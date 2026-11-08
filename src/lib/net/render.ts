// Built-in JavaScript rendering. Drives a headless Chromium that is already on
// the host (via puppeteer-core — no bundled browser download, no external
// service) so JS-heavy sites (Wix, Squarespace, React) render to real HTML.
//
// Self-contained and self-host friendly: if no Chromium is found, callers fall
// back to a plain fetch. Renders are serialised (one page at a time) to keep
// memory bounded, and every request is SSRF-guarded.
import fs from "node:fs";
import dns from "node:dns/promises";
import net from "node:net";
import type { Browser } from "puppeteer-core";
import { isBlockedIp } from "./safe-fetch";
import { log } from "@/lib/log";

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/microsoft-edge",
];

let cachedPath: string | null | undefined;
export function chromiumPath(): string | null {
  if (cachedPath !== undefined) return cachedPath;
  cachedPath = null;
  for (const c of CHROMIUM_CANDIDATES) {
    if (!c) continue;
    try {
      if (fs.existsSync(c)) { cachedPath = c; break; }
    } catch { /* ignore */ }
  }
  return cachedPath;
}

/** True when built-in rendering can run (a Chromium exists and it isn't disabled). */
export function jsRenderAvailable(): boolean {
  if (process.env.RENDER_JS === "false") return false;
  return !!chromiumPath();
}

let browserP: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (browserP) return browserP;
  const executablePath = chromiumPath();
  if (!executablePath) throw new Error("No Chromium executable found");
  const { default: puppeteer } = await import("puppeteer-core");
  browserP = puppeteer
    .launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--no-first-run",
        "--disable-background-networking",
        "--disable-extensions",
        "--mute-audio",
      ],
    })
    .then((b) => {
      b.on("disconnected", () => { browserP = null; });
      return b;
    })
    .catch((e) => { browserP = null; throw e; });
  return browserP;
}

// Serialise renders so only one page is open at a time — caps memory on small
// hosts. A failed render never blocks the queue.
let chain: Promise<unknown> = Promise.resolve();
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const res = chain.then(fn, fn);
  chain = res.then(() => undefined, () => undefined);
  return res;
}

async function hostIsSafe(hostname: string): Promise<boolean> {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
  if (net.isIP(hostname)) return !isBlockedIp(hostname);
  try {
    const recs = await dns.lookup(hostname, { all: true });
    return recs.length > 0 && recs.every((r) => !isBlockedIp(r.address));
  } catch {
    return false;
  }
}

export interface RenderResult {
  url: string;
  status: number;
  html: string;
}

export async function renderPage(rawUrl: string, opts: { timeoutMs?: number } = {}): Promise<RenderResult> {
  const u = new URL(rawUrl);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`unsupported scheme: ${u.protocol}`);
  if (!(await hostIsSafe(u.hostname))) throw new Error(`blocked host: ${u.hostname}`);

  return runExclusive(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 900 });
      await page.setUserAgent("Mozilla/5.0 (compatible; ArloBot/1.0; +https://github.com/Yarqat/Arlo)");
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        void (async () => {
          try {
            if (["image", "media", "font"].includes(req.resourceType())) return await req.abort();
            const ru = new URL(req.url());
            if (ru.protocol !== "http:" && ru.protocol !== "https:") return await req.abort();
            if (!(await hostIsSafe(ru.hostname))) return await req.abort();
            return await req.continue();
          } catch {
            try { await req.abort(); } catch { /* request already handled */ }
          }
        })();
      });

      const resp = await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: opts.timeoutMs ?? 20000 });
      // Let client-rendered content settle, but never hang on it.
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 4000 }).catch(() => {});
      const html = await page.content();
      return { url: page.url(), status: resp?.status() ?? 200, html };
    } finally {
      await page.close().catch(() => {});
    }
  });
}

/** Close the shared browser (used on worker shutdown). */
export async function closeRenderer(): Promise<void> {
  if (!browserP) return;
  try {
    const b = await browserP;
    await b.close();
  } catch (e) {
    log.warn("renderer close failed", { err: (e as Error).message });
  } finally {
    browserP = null;
  }
}
