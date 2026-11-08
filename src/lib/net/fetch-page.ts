// A single page-fetch layer used by research and brand-learning.
//
// Pages are fetched with full JavaScript rendering through the built-in headless
// Chromium (net/render) whenever a browser is present on the host, and returned
// as clean, LLM-ready markdown (nav/ads stripped). Without a browser it falls
// back to the built-in SSRF-safe fetch plus a dependency-free HTML→markdown
// cleaner. Either way the caller gets markdown.
import { safeFetch } from "./safe-fetch";
import { renderPage, jsRenderAvailable } from "./render";
import { log } from "@/lib/log";

export interface FetchedPage {
  url: string;
  status: number;
  markdown: string;
  /** Raw (or JS-rendered) HTML when available — used for link/email harvesting. */
  html: string;
  via: "render" | "fetch";
}

interface FetchOpts {
  maxBytes?: number;
  timeoutMs?: number;
}

export async function fetchPage(url: string, opts: FetchOpts = {}): Promise<FetchedPage> {
  // 1. Built-in JavaScript rendering (our own headless Chromium) — the default
  //    whenever a browser is present on the host. No external service.
  if (jsRenderAvailable()) {
    try {
      const r = await renderPage(url, { timeoutMs: opts.timeoutMs ?? 20000 });
      if (r.status < 400 && r.html) {
        return { url: r.url, status: r.status, markdown: htmlToMarkdown(r.html), html: r.html, via: "render" };
      }
    } catch (e) {
      log.warn("js render failed, falling back", { url, err: (e as Error).message });
    }
  }
  // 2. Plain SSRF-safe fetch + local HTML→markdown (always available).
  const res = await safeFetch(url, { maxBytes: opts.maxBytes ?? 1_500_000, timeoutMs: opts.timeoutMs ?? 15000 });
  return { url: res.url, status: res.status, markdown: htmlToMarkdown(res.body), html: res.body, via: "fetch" };
}

// --- Dependency-free HTML → markdown-ish text --------------------------------
// Not a full markdown renderer — it strips boilerplate (scripts, styles, nav,
// footers), keeps headings/lists/links/paragraph structure, decodes entities
// and collapses whitespace. Used when the built-in renderer isn't available.
const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
  hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? m);
}

function safeCodePoint(n: number): string {
  try {
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

export function htmlToMarkdown(html: string): string {
  let s = html;
  // Drop non-content regions entirely.
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|noscript|svg|head|template|iframe)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<(nav|footer|form)[\s\S]*?<\/\1>/gi, " ");
  // Links → markdown so the LLM can still cite/visit them.
  s = s.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const t = stripTags(text).trim();
    return t ? `[${t}](${href})` : "";
  });
  // Headings and list items → line-led markers.
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, inner) => `\n\n${"#".repeat(Number(lvl))} ${stripTags(inner).trim()}\n`);
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => `\n- ${stripTags(inner).trim()}`);
  // Block boundaries → newlines.
  s = s.replace(/<\/(p|div|section|article|header|tr|ul|ol|table|h[1-6])>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = stripTags(s);
  s = decodeEntities(s);
  // Collapse whitespace: trim lines, drop runs of empties.
  const lines = s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}
