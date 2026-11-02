import { prisma } from "@/lib/db";
import { MemoryScope } from "@prisma/client";

// Patterns that look like secrets/credentials — never allowed in assistant memory.
const SECRET_PATTERNS: RegExp[] = [
  /\bpassword\b/i,
  /\bpass(code|phrase)\b/i,
  /\bapi[_\s-]?key\b/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /\bbearer\b/i,
  /\bsk-[a-z0-9]{10,}/i, // OpenAI-style keys
  /\bxi-api-key\b/i,
  /\b[A-Za-z0-9_\-]{32,}\b/, // long opaque strings (likely a key)
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
];

export class CredentialInMemoryError extends Error {
  constructor() {
    super("That looks like a password or API key. I don't store credentials in memory — set keys in Settings → Connections instead.");
    this.name = "CredentialInMemoryError";
  }
}

/** Reject anything that looks like a credential before it can be saved. */
export function assertNotCredential(text: string) {
  for (const re of SECRET_PATTERNS) {
    if (re.test(text)) throw new CredentialInMemoryError();
  }
}

export async function listMemory(scope?: MemoryScope) {
  return prisma.assistantMemory.findMany({
    where: scope ? { scope } : {},
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
}

export async function remember(scope: MemoryScope, title: string, content: string) {
  assertNotCredential(`${title} ${content}`);
  return prisma.assistantMemory.create({ data: { scope, title: title.slice(0, 120), content: content.slice(0, 2000) } });
}

/** Compact memory block for the assistant system prompt. */
export async function memoryPromptBlock(): Promise<string> {
  const mem = await listMemory();
  if (mem.length === 0) return "(no saved memory yet)";
  return mem
    .map((m) => `- [${m.scope.toLowerCase()}] ${m.title}: ${m.content}`)
    .join("\n")
    .slice(0, 4000);
}
