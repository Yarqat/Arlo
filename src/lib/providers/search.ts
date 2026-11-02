import { prisma } from "@/lib/db";
import { resolveConfig } from "./secrets";
import { ProviderConnection } from "@prisma/client";

export interface BusinessResult {
  name: string;
  website?: string;
  address?: string;
  phone?: string;
  category?: string;
  city?: string;
  country?: string;
  sourceUrl: string;
  source: string;
}

export interface SearchQuery {
  query: string;
  country?: string;
  city?: string;
  limit?: number;
  page?: number; // 1-indexed; lets discovery paginate for more results
}

const TIMEOUT = 20_000;
async function jget(url: string, init: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { res, json };
  } finally {
    clearTimeout(t);
  }
}

// --- Serper.dev (Google results via API) ---
async function serper(cfg: Record<string, string | undefined>, q: SearchQuery): Promise<BusinessResult[]> {
  const term = [q.query, q.city, q.country].filter(Boolean).join(" ");
  const { res, json } = await jget("https://google.serper.dev/places", {
    method: "POST",
    headers: { "X-API-KEY": cfg.apiKey || "", "Content-Type": "application/json" },
    body: JSON.stringify({ q: term, num: q.limit ?? 20, ...(q.page && q.page > 1 ? { page: q.page } : {}) }),
  });
  if (!res.ok) throw new Error(json?.message || `Serper error ${res.status}`);
  return (json.places ?? []).map((p: any) => ({
    name: p.title,
    website: p.website,
    address: p.address,
    phone: p.phoneNumber,
    category: p.category,
    city: q.city,
    country: q.country,
    sourceUrl: p.website || `https://www.google.com/maps/search/${encodeURIComponent(term)}`,
    source: "serper/google_places",
  }));
}

// --- Google Places Text Search (New) ---
async function googlePlaces(cfg: Record<string, string | undefined>, q: SearchQuery): Promise<BusinessResult[]> {
  const term = [q.query, q.city, q.country].filter(Boolean).join(" ");
  const { res, json } = await jget("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": cfg.apiKey || "",
      "X-Goog-FieldMask":
        "places.displayName,places.websiteUri,places.formattedAddress,places.nationalPhoneNumber,places.primaryType,places.id",
    },
    body: JSON.stringify({ textQuery: term, maxResultCount: Math.min(q.limit ?? 20, 20) }),
  });
  if (!res.ok) throw new Error(json?.error?.message || `Google Places error ${res.status}`);
  return (json.places ?? []).map((p: any) => ({
    name: p.displayName?.text ?? "",
    website: p.websiteUri,
    address: p.formattedAddress,
    phone: p.nationalPhoneNumber,
    category: p.primaryType,
    city: q.city,
    country: q.country,
    sourceUrl: p.websiteUri || `https://www.google.com/maps/place/?q=place_id:${p.id}`,
    source: "google_places",
  }));
}

function providerOf(conn: ProviderConnection): string {
  return ((conn.meta as any)?.provider as string) || "serper";
}

export async function runSearch(q: SearchQuery): Promise<BusinessResult[]> {
  const conn = await prisma.providerConnection.findFirst({ where: { kind: "SEARCH", status: "CONNECTED" } });
  if (!conn) throw new Error("No search provider is connected. Configure one in Settings → Search provider.");
  const cfg = resolveConfig(conn);
  if (!cfg.apiKey) throw new Error("Search provider has no API key.");
  const provider = providerOf(conn);
  const results = provider === "google_places" ? await googlePlaces(cfg, q) : await serper(cfg, q);
  return results.filter((r) => r.name);
}

export async function testSearch(conn: ProviderConnection): Promise<{ ok: boolean; error?: string; sample?: number }> {
  const cfg = resolveConfig(conn);
  if (!cfg.apiKey) return { ok: false, error: "No API key configured (set it here or in .env)." };
  try {
    const provider = providerOf(conn);
    const r = provider === "google_places"
      ? await googlePlaces(cfg, { query: "coffee shop", city: "London", limit: 3 })
      : await serper(cfg, { query: "coffee shop", city: "London", limit: 3 });
    return { ok: true, sample: r.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
