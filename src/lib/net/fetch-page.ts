// A single page-fetch layer used by research and brand-learning.
//
// If Firecrawl is configured (FIRECRAWL_API_KEY for the hosted API, or
// FIRECRAWL_BASE_URL for a self-hosted instance) pages are fetched with full
// JavaScript rendering and returned as clean, LLM-ready markdown (nav/ads
// stripped). Otherwise it falls back to the built-in SSRF-safe fetch plus a
// dependency-free HTML→markdown cleaner. Either way the caller gets markdown.
import { safeFetch } from "./safe-fetch";
import { renderPage, jsRenderAvailable } from "./render";
import { log } from "@/lib/log";

export interface FetchedPage {
  url: string;
  status: number;
  markdown: string;
  /** Raw (or JS-rendered) HTML when available — used for link/email harvesting. */
  html: string;
  via: "render" | "firecrawl" | "fetch";
}

function firecrawlBase(): string {
  return (process.env.FIRECRAWL_BASE_URL || "https://api.firecrawl.dev").replace(/\/+$/, "");
}

/** Firecrawl is on when either a hosted API key or a self-host base URL is set. */
export function firecrawlEnabled(): boolean {
  return !!(process.env.FIRECRAWL_API_KEY || process.env.FIRECRAWL_BASE_URL);
}

interface FetchOpts {
  maxBytes?: number;
  timeoutMs?: number;
  onlyMainContent?: boolean;
}

async function firecrawlScrape(url: string, opts: FetchOpts): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.FIRECRAWL_API_KEY) headers.Authorization = `Bearer ${process.env.FIRECRAWL_API_KEY}`;
    const res = await fetch(`${firecrawlBase()}/v2/scrape`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
        onlyMainContent: opts.onlyMainContent ?? true,
      }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      data?: { markdown?: string; html?: string; metadata?: { statusCode?: number; sourceURL?: string } };
    };
    if (!res.ok || json.success === false || !json.data) {
      throw new Error(json.error || `Firecrawl ${res.status}`);
    }
    return {
      url: json.data.metadata?.sourceURL || url,
      status: json.data.metadata?.statusCode ?? 200,
      markdown: (json.data.markdown || "").trim(),
      html: json.data.html || "",
      via: "firecrawl",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPage(url: string, opts: FetchOpts = {}): Promise<FetchedPage> {
  // 1. Built-in JavaScript rendering (our own headless Chromium) — the default
  //    whenever a browser is present on the host. No external service needed.
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
  // 2. Firecrawl — only if explicitly configured (an alternative, not required).
  if (firecrawlEnabled()) {
    try {
      return await firecrawlScrape(url, opts);
    } catch (e) {
      log.warn("firecrawl scrape failed, falling back to fetch", { url, err: (e as Error).message });
    }
  }
  // 3. Plain SSRF-safe fetch + local HTML→markdown (always available).
  const res = await safeFetch(url, { maxBytes: opts.maxBytes ?? 1_500_000, timeoutMs: opts.timeoutMs ?? 15000 });
  return { url: res.url, status: res.status, markdown: htmlToMarkdown(res.body), html: res.body, via: "fetch" };
}

// --- Dependency-free HTML → markdown-ish text --------------------------------
// Not a full markdown renderer — it strips boilerplate (scripts, styles, nav,
// footers), keeps headings/lists/links/paragraph structure, decodes entities
// and collapses whitespace. Good enough to feed an LLM when Firecrawl is off.
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
