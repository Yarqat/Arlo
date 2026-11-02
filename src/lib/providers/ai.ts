import { prisma } from "@/lib/db";
import { reserve } from "@/lib/budget";
import { resolveConfig } from "./secrets";
import { AiTask, ProviderConnection } from "@prisma/client";
import { log } from "@/lib/log";

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
    };
    const payload: Record<string, unknown> = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      ...(opts.system ? { system: opts.system } : {}),
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

export function adapterFor(kind: string): Adapter {
  switch (kind) {
    case "AI_OPENAI":
      return openai;
    case "AI_ANTHROPIC":
      return anthropic;
    default:
      throw new ProviderError(`No adapter for connection kind ${kind}`);
  }
}

export async function testConnection(conn: ProviderConnection) {
  const cfg = resolveConfig(conn);
  if (conn.kind === "AI_CLAUDE_CODE") {
    return { ok: false, error: "Claude Code CLI adapter must be enabled on the server with a dedicated user." };
  }
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
      system: input.system,
      messages: input.messages,
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
    log.error("ai task failed", { task: input.task, err: (e as Error).message });
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
