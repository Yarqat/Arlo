import { spawn } from "node:child_process";
import os from "node:os";
import { prisma } from "@/lib/db";
import { reserve } from "@/lib/budget";
import { resolveConfig } from "./secrets";
import { AiTask, ProviderConnection } from "@prisma/client";
import { log } from "@/lib/log";
import { recordProviderAlert, isProviderCreditError } from "@/lib/provider-alert";

export class NoModelAssignedError extends Error {
  constructor(task: string) {
    super(`No AI model is assigned for task ${task}. Assign one in Settings → Connections.`);
    this.name = "NoModelAssignedError";
  }
}
export class ModelNotAllowedError extends Error {
  constructor(model: string) {
    super(`Model "${model}" is not on the approved allowlist.`);
    this.name = "ModelNotAllowedError";
  }
}
export class ProviderError extends Error {}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface AiResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  connectionId: string;
}

interface ChatOpts {
  model: string;
  system?: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
}

interface Adapter {
  chat(cfg: Record<string, string | undefined>, opts: ChatOpts): Promise<{ text: string; inputTokens: number; outputTokens: number }>;
  listModels(cfg: Record<string, string | undefined>): Promise<string[]>;
  test(cfg: Record<string, string | undefined>): Promise<{ ok: boolean; error?: string; models?: string[] }>;
}

const TIMEOUT = 60_000;

/**
 * Make a string safe to put in a JSON request body. Scraped web content can
 * carry lone UTF-16 surrogates and C0 control chars (from broken page
 * encodings); left in, they produce a malformed body the AI API rejects with
 * errors like "unexpected end of hex escape". We drop unpaired surrogates and
 * control chars (keeping \t, \n, \r) so the request always parses.
 */
export function sanitizeForJson(s: string): string {
  return s
    // unpaired high surrogate (not followed by a low surrogate)
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    // unpaired low surrogate (not preceded by a high surrogate)
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1")
    // C0 control chars except tab/newline/carriage-return
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

async function fetchJson(url: string, init: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(body);
    } catch {
      /* non-json */
    }
    return { res, json, body };
  } finally {
    clearTimeout(t);
  }
}

const openai: Adapter = {
  async chat(cfg, opts) {
    const base = cfg.baseUrl || "https://api.openai.com/v1";
    const messages = [
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      ...opts.messages,
    ];
    const payload: Record<string, unknown> = {
      model: opts.model,
      messages,
      max_completion_tokens: opts.maxTokens ?? 1024,
    };
    // Newer OpenAI reasoning models (gpt-5/o-series, etc.) reject a custom
    // `temperature` ("deprecated for this model"). Send it when asked, but if the
    // model refuses, transparently retry once without it rather than failing.
    if (opts.temperature != null) payload.temperature = opts.temperature;

    let { res, json } = await fetchJson(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(payload),
    });
    let j = json as any;
    if (!res.ok && "temperature" in payload && /temperature/i.test(j?.error?.message || "")) {
      delete payload.temperature;
      ({ res, json } = await fetchJson(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(payload),
      }));
      j = json as any;
    }
    if (!res.ok) throw new ProviderError(j?.error?.message || `OpenAI error ${res.status}`);
    return {
      text: j.choices?.[0]?.message?.content ?? "",
      inputTokens: j.usage?.prompt_tokens ?? 0,
      outputTokens: j.usage?.completion_tokens ?? 0,
    };
  },
  async listModels(cfg) {
    const base = cfg.baseUrl || "https://api.openai.com/v1";
    const { res, json } = await fetchJson(`${base}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (!res.ok) throw new ProviderError(`OpenAI models error ${res.status}`);
    return ((json as any).data ?? []).map((m: any) => m.id).sort();
  },
  async test(cfg) {
    try {
      const models = await this.listModels(cfg);
      return { ok: true, models };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};

const anthropic: Adapter = {
  async chat(cfg, opts) {
    const base = cfg.baseUrl || "https://api.anthropic.com/v1";
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey || "",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    };
    const payload: Record<string, unknown> = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      // Prompt caching: mark the system prompt as a cacheable prefix. Across the
      // many leads in a campaign the system (profile/offer/task rules) is stable,
      // so this restores cache hits and cuts input cost. Anthropic ignores it
      // when the prefix is below the cache minimum, so it's always safe.
      ...(opts.system ? { system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }] } : {}),
      messages: opts.messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      // The newest Claude models (Claude 5 family) enable extended thinking by
      // default, which consumes the whole max_tokens budget on reasoning and can
      // leave no room for the actual answer. Disable it so max_tokens is the
      // visible-output budget. Retried away for models that don't accept it.
      thinking: { type: "disabled" },
    };
    // Those same models also reject a custom `temperature`. Send it when asked,
    // but drop it (and/or `thinking`) and retry once if the model refuses.
    if (opts.temperature != null) payload.temperature = opts.temperature;

    let { res, json } = await fetchJson(`${base}/messages`, { method: "POST", headers, body: JSON.stringify(payload) });
    let j = json as any;
    if (!res.ok) {
      const msg = j?.error?.message || "";
      let changed = false;
      if ("temperature" in payload && /temperature/i.test(msg)) { delete payload.temperature; changed = true; }
      if ("thinking" in payload && /thinking/i.test(msg)) { delete payload.thinking; changed = true; }
      if (changed) {
        ({ res, json } = await fetchJson(`${base}/messages`, { method: "POST", headers, body: JSON.stringify(payload) }));
        j = json as any;
      }
    }
    if (!res.ok) throw new ProviderError(j?.error?.message || `Anthropic error ${res.status}`);
    const text = (j.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    return { text, inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 };
  },
  async listModels(cfg) {
    const base = cfg.baseUrl || "https://api.anthropic.com/v1";
    const { res, json } = await fetchJson(`${base}/models`, {
      headers: { "x-api-key": cfg.apiKey || "", "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) throw new ProviderError(`Anthropic models error ${res.status}`);
    return ((json as any).data ?? []).map((m: any) => m.id).sort();
  },
  async test(cfg) {
    try {
      const models = await this.listModels(cfg);
      return { ok: true, models };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};

// --- Claude Code CLI (subscription-backed, NO API key) ---
// Self-host only: drives the locally-installed `claude` CLI in headless mode
// (`-p --output-format json --safe-mode`) so model calls run on the owner's own
// Claude subscription with no per-token API bill. --safe-mode starts with all
// customizations off (no CLAUDE.md, hooks, MCP, plugins, settings); we also run
// in a temp cwd. Requires `claude` installed and logged in AS THE APP USER
// (see Settings → Connections for the setup steps).
const CLI_TIMEOUT = 120_000;

function runClaudeCli(bin: string, args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, { cwd: os.tmpdir(), env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      return reject(new ProviderError(`Claude CLI not runnable: ${(e as Error).message}`));
    }
    let out = "", err = "";
    const timer = setTimeout(() => { child!.kill("SIGKILL"); reject(new ProviderError("Claude CLI timed out")); }, CLI_TIMEOUT);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => { clearTimeout(timer); reject(new ProviderError(`Claude CLI not found or not runnable: ${e.message}`)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out);
      else reject(new ProviderError(err.trim() || out.trim() || `Claude CLI exited with code ${code}`));
    });
    child.stdin!.end(stdin);
  });
}

const claudeCode: Adapter = {
  async chat(cfg, opts) {
    const bin = cfg.cliPath || process.env.CLAUDE_CLI_PATH || "claude";
    const prompt = opts.messages
      .map((m) => (m.role === "assistant" ? `Assistant: ${m.content}` : m.content))
      .join("\n\n");
    const args = ["-p", "--output-format", "json", "--safe-mode"];
    if (opts.system) args.push("--system-prompt", opts.system);
    if (opts.model) args.push("--model", opts.model);
    const raw = await runClaudeCli(bin, args, prompt);
    let j: any;
    try { j = JSON.parse(raw); } catch { throw new ProviderError("Claude CLI returned non-JSON output."); }
    if (j.is_error || j.type === "error" || (j.subtype && j.subtype !== "success")) {
      throw new ProviderError(typeof j.result === "string" ? j.result : `Claude CLI error (${j.subtype ?? "unknown"})`);
    }
    const text = typeof j.result === "string" ? j.result : "";
    return { text, inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 };
  },
  async listModels() {
    // CLI aliases; the owner allowlists which to use. No per-token cost.
    return ["opus", "sonnet", "haiku"];
  },
  async test(cfg) {
    try {
      const r = await claudeCode.chat(cfg, { model: cfg.model || "sonnet", messages: [{ role: "user", content: "Reply with the single word: OK" }] });
      if (r.text) return { ok: true, models: ["opus", "sonnet", "haiku"] };
      return { ok: false, error: "No output. Is the claude CLI logged in as the app user? Run `claude login` as that user." };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};

export function adapterFor(kind: string): Adapter {
  switch (kind) {
    case "AI_OPENAI":
      return openai;
    case "AI_ANTHROPIC":
      return anthropic;
    case "AI_CLAUDE_CODE":
      return claudeCode;
    default:
      throw new ProviderError(`No adapter for connection kind ${kind}`);
  }
}

export async function testConnection(conn: ProviderConnection) {
  const cfg = resolveConfig(conn);
  // Claude Code uses the subscription CLI — no API key to check.
  if (conn.kind === "AI_CLAUDE_CODE") return claudeCode.test(cfg);
  if (!cfg.apiKey) return { ok: false, error: "No API key configured (set it here or in .env)." };
  return adapterFor(conn.kind).test(cfg);
}

interface RunTaskInput {
  task: AiTask;
  system?: string;
  messages: AiMessage[];
  campaignId?: string | null;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Resolve the approved model for a task, enforce the allowlist, reserve budget,
 * call the provider, and commit the actual cost. AI never selects its own model
 * or silently falls back to a different/pricier one.
 */
export async function runAiTask(input: RunTaskInput): Promise<AiResult> {
  // campaign-specific assignment wins over the global default.
  // (A compound-unique lookup cannot use a null campaignId, so the global
  //  default is fetched with findFirst.)
  const assignment =
    (input.campaignId
      ? await prisma.modelAssignment.findUnique({
          where: { task_campaignId: { task: input.task, campaignId: input.campaignId } },
        })
      : null) ?? (await prisma.modelAssignment.findFirst({ where: { task: input.task, campaignId: null } }));

  if (!assignment) throw new NoModelAssignedError(input.task);

  const conn = await prisma.providerConnection.findUnique({
    where: { id: assignment.connectionId },
    include: { models: true },
  });
  if (!conn || conn.status !== "CONNECTED") throw new ProviderError("AI connection is not connected.");

  const perm = conn.models.find((m) => m.modelId === assignment.modelId);
  if (!perm || !perm.allowed) throw new ModelNotAllowedError(assignment.modelId);

  const cfg = resolveConfig(conn);
  const inPrice = perm.inputCostPerMTok ? Number(perm.inputCostPerMTok) : 0;
  const outPrice = perm.outputCostPerMTok ? Number(perm.outputCostPerMTok) : 0;
  const maxTokens = input.maxTokens ?? 1024;
  const estInput = Math.ceil(((input.system?.length ?? 0) + input.messages.reduce((s, m) => s + m.content.length, 0)) / 4);
  const estCost = (estInput / 1e6) * inPrice + (maxTokens / 1e6) * outPrice;

  const r = await reserve({
    kind: "AI",
    campaignId: input.campaignId ?? null,
    estimatedCost: estCost,
    estimatedCount: 1,
    provider: conn.kind,
    model: assignment.modelId,
    note: input.task,
  });

  try {
    const adapter = adapterFor(conn.kind);
    const out = await adapter.chat(cfg, {
      model: assignment.modelId,
      system: input.system ? sanitizeForJson(input.system) : input.system,
      messages: input.messages.map((m) => ({ ...m, content: sanitizeForJson(m.content) })),
      maxTokens,
      temperature: input.temperature,
    });
    const actual = (out.inputTokens / 1e6) * inPrice + (out.outputTokens / 1e6) * outPrice;
    await r.commit(actual, {
      provider: conn.kind,
      model: assignment.modelId,
      tokensIn: out.inputTokens,
      tokensOut: out.outputTokens,
      count: 1,
    });
    return { ...out, model: assignment.modelId, connectionId: conn.id };
  } catch (e) {
    await r.release();
    const msg = (e as Error).message;
    log.error("ai task failed", { task: input.task, err: msg });
    // Surface only provider-side money/auth failures (expired credits, billing,
    // bad key, rate limit) to the dashboard — NOT every error. A malformed-body
    // or transient error is a code/data issue, not something the owner fixes in
    // Connections, so it must not masquerade as a credits warning.
    if (isProviderCreditError(msg)) {
      await recordProviderAlert("AI", `AI provider error: ${msg}`);
    }
    throw e;
  }
}

/** Parse JSON out of a model response that may be wrapped in prose/fences. */
export function extractJson<T = unknown>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  for (let end = candidate.length; end > start; end--) {
    const slice = candidate.slice(start, end);
    try {
      return JSON.parse(slice) as T;
    } catch {
      /* keep shrinking */
    }
  }
  return null;
}
