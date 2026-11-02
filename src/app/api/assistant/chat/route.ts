import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerRoute } from "@/lib/api";
import { interpret, executeConfirmed } from "@/lib/assistant/engine";

const schema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1),
  // When present, the owner has confirmed a pending mutating action.
  confirm: z.object({ tool: z.string().max(64), args: z.any() }).optional(),
});

export const POST = ownerRoute(async (req) => {
  const { messages, confirm } = schema.parse(await req.json());
  const result = confirm ? await executeConfirmed(confirm.tool, confirm.args) : await interpret(messages);
  return NextResponse.json(result);
});
