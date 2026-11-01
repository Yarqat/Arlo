import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireOwner, UnauthorizedError } from "./auth";
import { BudgetExceededError, EmergencyPausedError } from "./budget";
import { NoModelAssignedError, ModelNotAllowedError, ProviderError } from "./providers/ai";
import { log } from "./log";

type Ctx = { owner: Awaited<ReturnType<typeof requireOwner>> };

/** Wrap an owner-protected JSON handler with consistent error mapping. */
export function ownerRoute(fn: (req: Request, ctx: Ctx) => Promise<NextResponse | Response>) {
  return async (req: Request) => {
    try {
      const owner = await requireOwner();
      return await fn(req, { owner });
    } catch (e) {
      if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid input", issues: e.flatten() }, { status: 400 });
      if (e instanceof BudgetExceededError)
        return NextResponse.json({ error: e.message, kind: "budget" }, { status: 402 });
      if (e instanceof EmergencyPausedError)
        return NextResponse.json({ error: e.message, kind: "paused" }, { status: 409 });
      if (e instanceof NoModelAssignedError || e instanceof ModelNotAllowedError)
        return NextResponse.json({ error: e.message, kind: "model" }, { status: 400 });
      if (e instanceof ProviderError) return NextResponse.json({ error: e.message, kind: "provider" }, { status: 502 });
      log.error("route error", { err: String((e as Error)?.message ?? e) });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}
