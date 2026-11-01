// Minimal structured logger with secret redaction. Never log credential values.

const SECRET_KEYS = /pass|secret|token|apikey|api_key|authorization|smtp|imap|configenc|key$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[deep]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 40 && /^[A-Za-z0-9+/_=.-]{40,}$/.test(value)) return "[redacted:long]";
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: string, msg: string, meta?: Record<string, unknown>) {
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else console.log(out);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
