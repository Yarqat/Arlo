import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { encryptJson, decryptJson } from "@/lib/crypto";
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
  // Set only for asynchronous providers (status === "PENDING"): the provider's
  // validation id, used to match the later webhook callback to this result.
  externalId?: string | null;
}

/** Providers that answer asynchronously via a webhook callback rather than inline. */
export const ASYNC_PROVIDERS = ["emailawesome"] as const;
export function isAsyncProvider(provider: string): boolean {
  return (ASYNC_PROVIDERS as readonly string[]).includes(provider);
}

const TIMEOUT = 25_000;
async function jreq(url: string, init?: RequestInit) {
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

const ROLE_RE = /^(info|sales|support|contact|admin|office|hello|help|team|billing|accounts|noreply|no-reply)/i;

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

/** Email Awesome has exactly four verdicts; map them to our canonical status. */
export function mapEmailAwesomeStatus(verdict: string): VerificationStatus {
  switch ((verdict || "").toUpperCase()) {
    case "VALID": return "DELIVERABLE";
    case "INVALID": return "INVALID";
    case "CATCH_ALL": return "CATCH_ALL";
    default: return "UNKNOWN"; // UNKNOWN or anything unexpected → risky
  }
}

function providerOf(conn: ProviderConnection): string {
  return ((conn.meta as any)?.provider as string) || "generic";
}

// --- ZeroBounce (synchronous) ---
async function zeroBounce(cfg: Record<string, string | undefined>, email: string): Promise<VerifyOutcome> {
  const { res, json } = await jreq(
    `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(cfg.apiKey || "")}&email=${encodeURIComponent(email)}`,
  );
  if (!res.ok) throw new Error(json?.error || `ZeroBounce error ${res.status}`);
  const catchAll = json.status === "catch-all" || json.sub_status === "catch_all";
  return {
    status: mapStatus(json.status, catchAll),
    isRoleAddress: json.sub_status === "role_based" || ROLE_RE.test(email),
    isCatchAll: catchAll,
    isDisposable: json.sub_status === "disposable",
    score: undefined,
    provider: "zerobounce",
    raw: json,
  };
}

// --- NeverBounce (synchronous) ---
async function neverBounce(cfg: Record<string, string | undefined>, email: string): Promise<VerifyOutcome> {
  const { res, json } = await jreq(
    `https://api.neverbounce.com/v4/single/check?key=${encodeURIComponent(cfg.apiKey || "")}&email=${encodeURIComponent(email)}`,
  );
  if (!res.ok || json?.status !== "success") throw new Error(json?.message || `NeverBounce error ${res.status}`);
  const result = json.result as string; // valid|invalid|disposable|catchall|unknown
  return {
    status: mapStatus(result, result === "catchall"),
    isRoleAddress: ROLE_RE.test(email),
    isCatchAll: result === "catchall",
    isDisposable: result === "disposable",
    provider: "neverbounce",
    raw: json,
  };
}

// --- Email Awesome (asynchronous; verdict arrives later at our webhook) ---

/** Public URL our verifier webhook is served from. */
export function verifierCallbackUrl(): string {
  const base = env().APP_URL.replace(/\/$/, "");
  return `${base}/api/public/verifier/emailawesome`;
}

/**
 * Read the shared secret used to authenticate the results webhook. Prefers an
 * env override (VERIFIER_WEBHOOK_SECRET); otherwise the encrypted stored value.
 */
export function verifierWebhookSecret(conn: ProviderConnection): string | null {
  return resolveConfig(conn).webhookSecret || null;
}

/** Ensure a webhook secret exists (generating + persisting one if needed) and return it. */
export async function ensureWebhookSecret(conn: ProviderConnection): Promise<string> {
  const existing = verifierWebhookSecret(conn);
  if (existing) return existing;
  const secret = randomBytes(24).toString("hex");
  const stored = (conn.configEnc ? decryptJson<Record<string, string>>(conn.configEnc) : {}) ?? {};
  await prisma.providerConnection.update({
    where: { id: conn.id },
    data: { configEnc: encryptJson({ ...stored, webhookSecret: secret }) },
  });
  return secret;
}

/**
 * Submit one address for asynchronous validation. Returns immediately with the
 * provider's validation id; the verdict arrives later at verifierCallbackUrl().
 */
async function submitEmailAwesome(
  conn: ProviderConnection,
  cfg: Record<string, string | undefined>,
  email: string,
): Promise<{ externalId: string | null; raw: unknown }> {
  const secret = await ensureWebhookSecret(conn);
  const base = (cfg.baseUrl || "https://api.emailawesome.com").replace(/\/$/, "");
  const { res, json } = await jreq(`${base}/api/validations/email_validation`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey || "",
    },
    body: JSON.stringify({
      email,
      results_callback: {
        url: verifierCallbackUrl(),
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      },
    }),
  });
  if (!res.ok) throw new Error(json?.message || json?.error || `Email Awesome error ${res.status}`);
  // The request can be accepted but held — most commonly PENDING_BILLING when the
  // account has no credits/payment. Surface that as a real error instead of
  // leaving the contact stuck on "pending" forever.
  const subStatus = String(json?.status ?? json?.validation?.status ?? "").toUpperCase();
  if (subStatus.includes("BILLING")) {
    throw new Error("Email Awesome returned PENDING_BILLING — your Email Awesome account needs credits or a payment method before it will verify. Add billing there, or switch to ZeroBounce / NeverBounce in Settings → Email verifier.");
  }
  if (subStatus.startsWith("REJECT") || subStatus === "FAILED" || subStatus === "FAILED EXPIRED") {
    throw new Error(`Email Awesome rejected the request (${subStatus}).`);
  }
  const id =
    json?.validation?.id ?? json?.id ?? json?.data?.id ??
    (Array.isArray(json?.accepted_validations) ? json.accepted_validations[0]?.id : null) ?? null;
  return { externalId: id ? String(id) : null, raw: json };
}

/** Resolve the single connected verifier (and its config + provider name). */
export async function getActiveVerifier() {
  const conn = await prisma.providerConnection.findFirst({ where: { kind: "EMAIL_VERIFIER", status: "CONNECTED" } });
  if (!conn) throw new Error("No email verifier is connected.");
  const cfg = resolveConfig(conn);
  if (!cfg.apiKey) throw new Error("Verifier has no API key.");
  return { conn, cfg, provider: providerOf(conn) };
}

/**
 * Begin verification of an address. For synchronous providers the returned
 * outcome carries the verdict; for asynchronous ones it is PENDING with an
 * externalId and the verdict lands later via the webhook.
 */
export async function startVerification(email: string): Promise<VerifyOutcome> {
  const { conn, cfg, provider } = await getActiveVerifier();
  if (provider === "emailawesome") {
    const { externalId, raw } = await submitEmailAwesome(conn, cfg, email);
    return {
      status: "PENDING",
      isRoleAddress: ROLE_RE.test(email),
      isCatchAll: false,
      isDisposable: false,
      provider,
      externalId,
      raw,
    };
  }
  if (provider === "neverbounce") return neverBounce(cfg, email);
  return zeroBounce(cfg, email);
}

/** Backwards-compatible alias. */
export const runVerify = startVerification;

export async function testVerifier(conn: ProviderConnection): Promise<{ ok: boolean; error?: string }> {
  const cfg = resolveConfig(conn);
  if (!cfg.apiKey) return { ok: false, error: "No API key configured (set it here or in .env)." };
  const provider = providerOf(conn);
  try {
    if (provider === "emailawesome") {
      // Confirm the key is accepted and the submission endpoint responds.
      // (The verdict for this probe arrives at our webhook and is ignored — no
      //  pending row is created for it.)
      await submitEmailAwesome(conn, cfg, "test@example.com");
      return { ok: true };
    }
    if (provider === "neverbounce") await neverBounce(cfg, "test@example.com");
    else await zeroBounce(cfg, "test@example.com");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
