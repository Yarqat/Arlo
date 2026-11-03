import { ConnectionKind, ProviderConnection } from "@prisma/client";
import { decryptJson } from "@/lib/crypto";

// Environment variable names that may hold provider credentials directly in .env.
// If present, these OVERRIDE anything stored (encrypted) in the database, so an
// operator can keep all keys in .env if they prefer.
const ENV_KEYS: Record<ConnectionKind, Record<string, string>> = {
  AI_OPENAI: { apiKey: "OPENAI_API_KEY", baseUrl: "OPENAI_BASE_URL" },
  AI_ANTHROPIC: { apiKey: "ANTHROPIC_API_KEY", baseUrl: "ANTHROPIC_BASE_URL" },
  AI_CLAUDE_CODE: { cliPath: "CLAUDE_CLI_PATH" },
  AI_CODEX: { cliPath: "CODEX_CLI_PATH" },
  SEARCH: { apiKey: "SEARCH_API_KEY", baseUrl: "SEARCH_BASE_URL" },
  EMAIL_VERIFIER: { apiKey: "VERIFIER_API_KEY", baseUrl: "VERIFIER_BASE_URL", webhookSecret: "VERIFIER_WEBHOOK_SECRET" },
  SPEECH_STT: { apiKey: "STT_API_KEY", baseUrl: "STT_BASE_URL" },
  SPEECH_TTS: { apiKey: "TTS_API_KEY", baseUrl: "TTS_BASE_URL" },
};

export type ProviderConfig = Record<string, string | undefined>;

/** CLI-driven AI providers: no API key; they run a locally-installed CLI on the
 *  owner's own subscription. The "credential" is the logged-in CLI, not a key. */
export const CLI_AI_KINDS: ConnectionKind[] = ["AI_CLAUDE_CODE", "AI_CODEX"];
export function isCliAiKind(kind: ConnectionKind): boolean {
  return CLI_AI_KINDS.includes(kind);
}

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

/** True when a usable credential is configured. For CLI providers the path is
 *  optional (the CLI may be on PATH), so they are always considered ready to test. */
export function hasCredential(conn: ProviderConnection): boolean {
  if (isCliAiKind(conn.kind)) return true;
  return !!resolveConfig(conn).apiKey;
}

/** Where a credential came from, for display (never the value itself). */
export function credentialSource(conn: ProviderConnection): "env" | "stored" | "none" {
  const envMap = ENV_KEYS[conn.kind] ?? {};
  const primary = isCliAiKind(conn.kind) ? "cliPath" : "apiKey";
  const envName = envMap[primary];
  if (envName && process.env[envName]?.trim()) return "env";
  const stored = conn.configEnc ? decryptJson<ProviderConfig>(conn.configEnc) : null;
  if (stored && stored[primary]) return "stored";
  return "none";
}
