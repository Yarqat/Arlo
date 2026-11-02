import { env } from "@/lib/env";

/** Base URL for public tracking links; falls back to production. */
export function trackingBase(): string {
  try {
    return env().APP_URL.replace(/\/$/, "");
  } catch {
    return "https://agent.yarqat.com";
  }
}

// A bare URL in text/email. We stop at whitespace and common trailing punctuation.
const URL_RE = /https?:\/\/[^\s<>()"']+/gi;

/**
 * Rewrite links in an outbound body so each click is logged before the recipient
 * is forwarded on. The unsubscribe link (/u/...) is left untouched for compliance,
 * and we never double-wrap a link that already points at our tracker.
 */
export function wrapLinks(body: string, token: string, base = trackingBase()): string {
  const tracker = `${base}/t/c/${token}`;
  return body.replace(URL_RE, (raw) => {
    // Preserve trailing punctuation that isn't part of the URL.
    const trail = raw.match(/[.,;:!?)]+$/)?.[0] ?? "";
    const url = trail ? raw.slice(0, -trail.length) : raw;
    if (url.includes("/u/") || url.startsWith(tracker)) return raw; // leave unsubscribe + already-wrapped
    return `${tracker}?u=${encodeURIComponent(url)}${trail}`;
  });
}
