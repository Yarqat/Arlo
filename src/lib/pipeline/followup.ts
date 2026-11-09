import { prisma } from "@/lib/db";
import { getSettings, getProfile } from "@/lib/settings";
import { runAiTask, extractJson } from "@/lib/providers/ai";
import { sendMessage, scrubOutreach, chooseMailbox, senderSignature } from "./outreach";
import { audit } from "@/lib/audit";

/** After a send, schedule the next follow-up step if the sequence allows it. */
export async function scheduleFollowUps(leadId: string, campaignId: string | null, currentStep: number) {
  const settings = await getSettings();
  const campaign = campaignId ? await prisma.campaign.findUnique({ where: { id: campaignId } }) : null;
  // DRAFT_ONLY campaigns never auto-schedule follow-ups; the owner stays in full control.
  if (campaign?.outreachMode === "DRAFT_ONLY") return;
  const maxFollowUps = campaign?.maxFollowUps ?? settings.maxFollowUps;
  const nextStep = currentStep + 1;
  if (nextStep > maxFollowUps) return;

  const seq =
    (campaign?.followUpSequenceId
      ? await prisma.followUpSequence.findUnique({ where: { id: campaign.followUpSequenceId }, include: { steps: true } })
      : null) ?? (await prisma.followUpSequence.findFirst({ where: { enabled: true }, include: { steps: true } }));
  if (!seq) return;
  const step = seq.steps.find((s) => s.stepOrder === nextStep);
  if (!step) return;

  const runAt = new Date(Date.now() + step.delayHours * 3600_000);
  const idempotencyKey = `followup:${leadId}:step${nextStep}`;
  await prisma.scheduledAction
    .upsert({
      where: { idempotencyKey },
      create: {
        type: "FOLLOW_UP",
        status: "SCHEDULED",
        leadId,
        campaignId,
        runAt,
        idempotencyKey,
        payload: { step: nextStep, instruction: step.instruction },
      },
      update: {},
    })
    .catch(() => {});
}

/** Process one due follow-up: re-draft a short nudge and send with full rechecks. */
export async function processFollowUp(actionId: string): Promise<{ ok: boolean; reason?: string }> {
  const action = await prisma.scheduledAction.findUnique({ where: { id: actionId } });
  if (!action || action.status !== "SCHEDULED" || !action.leadId) return { ok: false, reason: "Action not runnable" };

  // Any reply cancels follow-ups immediately (checked here and again in preflight).
  const replied = await prisma.message.count({ where: { leadId: action.leadId, direction: "INBOUND" } });
  if (replied > 0) {
    await prisma.scheduledAction.update({ where: { id: actionId }, data: { status: "CANCELLED", blockedReason: "reply received" } });
    return { ok: false, reason: "Reply received; follow-up cancelled" };
  }

  const step = (action.payload as any)?.step ?? 1;
  const instruction = (action.payload as any)?.instruction ?? "Short, polite nudge.";

  const lastOutbound = await prisma.message.findFirst({
    where: { leadId: action.leadId, direction: "OUTBOUND", state: { in: ["ACCEPTED", "SENT", "DELIVERED"] } },
    orderBy: { sentAt: "desc" },
    include: { contact: true, thread: true },
  });
  if (!lastOutbound || !lastOutbound.contact) {
    await prisma.scheduledAction.update({ where: { id: actionId }, data: { status: "CANCELLED", blockedReason: "no prior message" } });
    return { ok: false, reason: "No prior message" };
  }

  const idempotencyKey = `outreach:${action.leadId}:${lastOutbound.contactId}:step${step}`;
  let draft = await prisma.message.findUnique({ where: { idempotencyKey } });
  if (!draft) {
    const profile = await getProfile();
    const system = [
      `You are ${profile.personName} from ${profile.companyName} writing a brief follow-up to an earlier unanswered email.`,
      `Instruction for this step: ${instruction}`,
      `Keep it to 1-3 sentences. No new claims, no prices, no pressure. ${profile.prohibitedClaims}`,
      `Return ONLY JSON: {"body":"..."} (plain text, no signature).`,
    ].join("\n");
    const user = `Earlier subject: ${lastOutbound.subject}\nEarlier message:\n${lastOutbound.bodyText.slice(0, 500)}`;
    let bodyCore = "";
    try {
      const res = await runAiTask({ task: "OUTREACH_WRITING", system, messages: [{ role: "user", content: user }], campaignId: action.campaignId, maxTokens: 300, temperature: 0.6 });
      bodyCore = extractJson<{ body: string }>(res.text)?.body?.trim() ?? "";
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }
    if (!bodyCore || !scrubOutreach(bodyCore).clean) {
      return { ok: false, reason: "Follow-up draft empty or flagged" };
    }
    const settings = await getSettings();
    // Sign as the SAME persona the From line will use (chosen per lead on the
    // thread's mailbox), so a follow-up from "Daniel Foster" is never signed
    // "Shah Fahad". chooseMailbox resolves the thread's mailbox, exactly as the
    // sender will at send time.
    const mailbox = await chooseMailbox({
      mailboxId: lastOutbound.mailboxId,
      threadId: lastOutbound.threadId,
      campaign: action.campaignId ? { sendingMailboxId: (await prisma.campaign.findUnique({ where: { id: action.campaignId }, select: { sendingMailboxId: true } }))?.sendingMailboxId ?? null } : null,
    });
    const sig = senderSignature(mailbox, action.leadId, profile, lastOutbound.fromAddr);
    draft = await prisma.message.create({
      data: {
        leadId: action.leadId,
        contactId: lastOutbound.contactId,
        campaignId: action.campaignId,
        threadId: lastOutbound.threadId,
        direction: "OUTBOUND",
        state: "DRAFT",
        toAddrs: [lastOutbound.contact.email],
        subject: lastOutbound.subject.startsWith("Re:") ? lastOutbound.subject : `Re: ${lastOutbound.subject}`,
        bodyText: bodyCore + sig,
        snippet: bodyCore.slice(0, 140),
        idempotencyKey,
        followUpStep: step,
        inReplyTo: lastOutbound.messageIdHeader,
        referencesHeader: [lastOutbound.referencesHeader, lastOutbound.messageIdHeader].filter(Boolean).join(" "),
      },
    });
  }

  const send = await sendMessage(draft.id, { isFollowUp: true, actor: "worker" });
  if (send.ok) {
    await prisma.scheduledAction.update({ where: { id: actionId }, data: { status: "DONE" } });
    await audit("worker", "follow_up", "Message", draft.id, `Follow-up step ${step} sent`);
  } else if (send.blocked && send.nextEligibleAt) {
    await prisma.scheduledAction.update({ where: { id: actionId }, data: { runAt: send.nextEligibleAt, blockedReason: send.reason ?? "" } });
  } else {
    await prisma.scheduledAction.update({ where: { id: actionId }, data: { status: send.blocked ? "SCHEDULED" : "FAILED", blockedReason: send.reason ?? "" } });
  }
  return send;
}
