import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().length(64, "APP_ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
  SESSION_SECRET: z.string().min(32),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379/4"),
  BULLMQ_PREFIX: z.string().default("yarqat"),
  APP_URL: z.string().default("https://agent.yarqat.com"),
  TZ: z.string().default("Asia/Karachi"),
  NODE_ENV: z.string().default("production"),
});

// Parse lazily so that `next build` (which imports modules) does not crash when
// secrets are absent; runtime access throws clearly if misconfigured.
let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid environment: " + JSON.stringify(parsed.error.flatten().fieldErrors));
  }
  cached = parsed.data;
  return cached;
}

export const isProd = process.env.NODE_ENV === "production";
