import dns from "node:dns/promises";
import net from "node:net";

// SSRF protection: block private, loopback, link-local and cloud-metadata targets.
// Treat all fetched web content as untrusted.

export class UnsafeUrlError extends Error {}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("fe80") || low.startsWith("fc") || low.startsWith("fd")) return true;
  if (low.startsWith("::ffff:")) return isBlockedIp(low.slice(7));
  return false;
}

async function assertHostSafe(hostname: string) {
  if (!hostname) throw new UnsafeUrlError("empty host");
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new UnsafeUrlError(`blocked host: ${hostname}`);
  }
  // If a literal IP was given, check directly.
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new UnsafeUrlError(`blocked ip: ${hostname}`);
    return;
  }
  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) throw new UnsafeUrlError(`cannot resolve ${hostname}`);
  for (const r of records) {
    if (isBlockedIp(r.address)) throw new UnsafeUrlError(`host resolves to blocked ip: ${hostname}`);
  }
}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

interface Opts {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

export async function safeFetch(rawUrl: string, opts: Opts = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 2_000_000; // 2MB
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let maxRedirects = opts.maxRedirects ?? 4;

  let current = rawUrl;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (;;) {
      let u: URL;
      try {
        u = new URL(current);
      } catch {
        throw new UnsafeUrlError("invalid url");
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new UnsafeUrlError(`blocked protocol: ${u.protocol}`);
      }
      await assertHostSafe(u.hostname);

      const res = await fetch(u.toString(), {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "User-Agent": "YarqatAgent/1.0 (+https://agent.yarqat.com; research bot)",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (maxRedirects-- <= 0) throw new UnsafeUrlError("too many redirects");
        current = new URL(res.headers.get("location")!, u).toString();
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      const reader = res.body?.getReader();
      let received = 0;
      const chunks: Uint8Array[] = [];
      let truncated = false;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            received += value.length;
            if (received > maxBytes) {
              truncated = true;
              await reader.cancel();
              break;
            }
            chunks.push(value);
          }
        }
      }
      const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      return {
        url: u.toString(),
        status: res.status,
        contentType,
        body: buf.toString("utf8"),
        truncated,
      };
    }
  } finally {
    clearTimeout(timer);
  }
}
