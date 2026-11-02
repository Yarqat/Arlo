import { prisma } from "@/lib/db";
import { sendViaMailbox, buildMessageId } from "@/lib/providers/email";
import { getSettings } from "@/lib/settings";
import { log } from "@/lib/log";

/**
 * Email the owner about something that needs their attention (a hot reply, a
 * buying signal). Best-effort and self-contained: it never throws into the
 * caller, and it does NOT reserve email budget — it's an internal alert, not
 * outreach. Honours the `hotReplyNotify` switch and sends to `notifyEmail`
 * (falling back to the owner's login email) from the first connected mailbox.
 */
export async function notifyOwner(subject: string, body: string): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.hotReplyNotify) return;

    let to = (settings.notifyEmail || "").trim();
    if (!to) {
      const owner = await prisma.owner.findFirst({ orderBy: { createdAt: "asc" }, select: { email: true } });
      to = owner?.email ?? "";
    }
    if (!to) return;

    const mailbox = await prisma.mailbox.findFirst({ where: { status: "CONNECTED", active: true } });
    if (!mailbox) {
      log.warn("notifyOwner: no connected mailbox to send from");
      return;
    }
    const domain = mailbox.email.split("@")[1] || "agent.yarqat.com";
    await sendViaMailbox(mailbox, {
      from: `${mailbox.senderName || "Arlo"} <${mailbox.email}>`,
      to,
      subject,
      text: body,
      messageId: buildMessageId(domain),
      // Mark as an automated internal alert so it is never treated as a reply.
      headers: { "Auto-Submitted": "auto-generated", "X-Arlo-Notification": "owner-alert" },
    });
    log.info("owner notified", { to, subject });
  } catch (e) {
    log.error("notifyOwner failed", { err: (e as Error).message });
  }
}
