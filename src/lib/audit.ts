import { prisma } from "./db";
import { log } from "./log";

export async function audit(
  actor: string,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  evidence?: unknown,
) {
  try {
    await prisma.auditEvent.create({
      data: { actor, action, entityType, entityId, summary, evidence: evidence as object },
    });
  } catch (e) {
    log.error("audit write failed", { action, err: String(e) });
  }
}
