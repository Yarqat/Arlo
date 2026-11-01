import { ConnectionKind, ProviderConnection } from "@prisma/client";
import { decryptJson } from "@/lib/crypto";

// Environment variable names that may hold provider credentials directly in .env.
// If present, these OVERRIDE anything stored (encrypted) in the database, so an
// operator can keep all keys in .env if they prefer.
const ENV_KEYS: Record<ConnectionKind, Record<string, string>> = {
  AI_OPENAI: { apiKey: "OPENAI_API_KEY", baseUrl: "OPENAI_BASE_URL" },
  AI_ANTHROPIC: { apiKey: "ANTHROPIC_API_KEY", baseUrl: "ANTHROPIC_BASE_URL" },
  AI_CLAUDE_CODE: { binPath: "CLAUDE_CODE_BIN", runAsUser: "CLAUDE_CODE_USER", workdir: "CLAUDE_CODE_WORKDIR" },
  SEARCH: { apiKey: "SEARCH_API_KEY", baseUrl: "SEARCH_BASE_URL" },
  EMAIL_VERIFIER: { apiKey: "VERIFIER_API_KEY", baseUrl: "VERIFIER_BASE_URL" },
};

export type ProviderConfig = Record<string, string | undefined>;

export function resolveConfig(conn: ProviderConnection): ProviderConfig {
  const stored = (conn.configEnc ? decryptJson<ProviderConfig>(conn.configEnc) : {}) ?? {};
  const envMap = ENV_KEYS[conn.kind] ?? {};
  const merged: ProviderConfig = { ...stored };
  for (const [field, envName] of Object.entries(envMap)) {
    const v = process.env[envName];
    if (v && v.trim()) merged[field] = v.trim();
  }
  return merged;
}

/** True when a usable key is available from env OR encrypted storage. */
export function hasCredential(conn: ProviderConnection): boolean {
  const cfg = resolveConfig(conn);
  if (conn.kind === "AI_CLAUDE_CODE") return !!cfg.binPath;
  return !!cfg.apiKey;
}

/** Where a credential came from, for display (never the value itself). */
export function credentialSource(conn: ProviderConnection): "env" | "stored" | "none" {
  const envMap = ENV_KEYS[conn.kind] ?? {};
  const primary = conn.kind === "AI_CLAUDE_CODE" ? "binPath" : "apiKey";
  const envName = envMap[primary];
  if (envName && process.env[envName]?.trim()) return "env";
  const stored = conn.configEnc ? decryptJson<ProviderConfig>(conn.configEnc) : null;
  if (stored && stored[primary]) return "stored";
  return "none";
}
