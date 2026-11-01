import { prisma } from "@/lib/db";
import { resolveConfig } from "./secrets";
import { ProviderConnection, VerificationStatus } from "@prisma/client";

export interface VerifyOutcome {
  status: VerificationStatus;
  isRoleAddress: boolean;
  isCatchAll: boolean;
  isDisposable: boolean;
  score?: number;
  provider: string;
  raw: unknown;
}

const TIMEOUT = 25_000;
async function jget(url: string, init?: RequestInit) {
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

// Map a variety of provider vocabularies to our canonical status.
function mapStatus(s: string, catchAll: boolean): VerificationStatus {
  const v = (s || "").toLowerCase();
  if (catchAll || v.includes("catch")) return "CATCH_ALL";
  if (["deliverable", "valid", "ok", "safe"].some((x) => v.includes(x))) return "DELIVERABLE";
  if (["undeliverable", "invalid", "bad", "rejected"].some((x) => v.includes(x))) return "INVALID";
  if (v.includes("disposable")) return "DISPOSABLE";
  if (v.includes("role")) return "ROLE";
  if (["unknown", "risky", "accept_all", "unverifiable"].some((x) => v.includes(x))) return "UNKNOWN";
  return "UNKNOWN";
}

function providerOf(conn: ProviderConnection): string {
  return ((conn.meta as any)?.provider as string) || "generic";
}

// --- ZeroBounce ---
async function zeroBounce(cfg: Record<string, string | undefined>, email: string): Promise<VerifyOutcome> {
  const { res, json } = await jget(
    `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(cfg.apiKey || "")}&email=${encodeURIComponent(email)}`,
  );
  if (!res.ok) throw new Error(json?.error || `ZeroBounce error ${res.status}`);
  const catchAll = json.status === "catch-all" || json.sub_status === "catch_all";
  return {
    status: mapStatus(json.status, catchAll),
    isRoleAddress: json.sub_status === "role_based" || /^(info|sales|support|contact|admin)/i.test(email),
    isCatchAll: catchAll,
    isDisposable: json.sub_status === "disposable",
    score: undefined,
    provider: "zerobounce",
    raw: json,
  };
}

// --- NeverBounce ---
async function neverBounce(cfg: Record<string, string | undefined>, email: string): Promise<VerifyOutcome> {
  const { res, json } = await jget(
    `https://api.neverbounce.com/v4/single/check?key=${encodeURIComponent(cfg.apiKey || "")}&email=${encodeURIComponent(email)}`,
  );
  if (!res.ok || json?.status !== "success") throw new Error(json?.message || `NeverBounce error ${res.status}`);
  const result = json.result as string; // valid|invalid|disposable|catchall|unknown
  return {
    status: mapStatus(result, result === "catchall"),
    isRoleAddress: /^(info|sales|support|contact|admin)/i.test(email),
    isCatchAll: result === "catchall",
    isDisposable: result === "disposable",
    provider: "neverbounce",
    raw: json,
  };
}

export async function runVerify(email: string): Promise<VerifyOutcome> {
  const conn = await prisma.providerConnection.findFirst({ where: { kind: "EMAIL_VERIFIER", status: "CONNECTED" } });
  if (!conn) throw new Error("No email verifier is connected.");
  const cfg = resolveConfig(conn);
  if (!cfg.apiKey) throw new Error("Verifier has no API key.");
  const provider = providerOf(conn);
  if (provider === "neverbounce") return neverBounce(cfg, email);
  return zeroBounce(cfg, email);
}

export async function testVerifier(conn: ProviderConnection): Promise<{ ok: boolean; error?: string }> {
  const cfg = resolveConfig(conn);
  if (!cfg.apiKey) return { ok: false, error: "No API key configured (set it here or in .env)." };
  try {
    // A benign well-known address; we only confirm the API responds.
    await runVerifyWith(conn, cfg, "test@example.com");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
async function runVerifyWith(conn: ProviderConnection, cfg: Record<string, string | undefined>, email: string) {
  const provider = providerOf(conn);
  return provider === "neverbounce" ? neverBounce(cfg, email) : zeroBounce(cfg, email);
}
