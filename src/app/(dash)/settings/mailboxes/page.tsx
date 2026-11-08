import { prisma } from "@/lib/db";
import { smtpOf, imapOf } from "@/lib/providers/email";
import { SettingsBack } from "../settings-ui";
import { MailboxesClient } from "./mailboxes-client";

export const dynamic = "force-dynamic";

export default async function MailboxesPage() {
  const mailboxes = await prisma.mailbox.findMany({ orderBy: { createdAt: "asc" } });
  const data = mailboxes.map((m) => {
    const smtp = smtpOf(m);
    const imap = imapOf(m);
    return {
      id: m.id,
      senderName: m.senderName,
      email: m.email,
      signature: m.signature,
      providerType: m.providerType,
      dailyLimit: m.dailyLimit,
      hourlyLimit: m.hourlyLimit,
      replyTo: m.replyTo,
      senderIdentities: Array.isArray(m.senderIdentities) ? (m.senderIdentities as { email: string; name: string }[]) : [],
      status: m.status,
      lastError: m.lastError,
      lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
      lastTestedAt: m.lastTestedAt?.toISOString() ?? null,
      smtp: smtp ? { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user } : null,
      imap: imap ? { host: imap.host, port: imap.port, secure: imap.secure, user: imap.user } : null,
    };
  });
  return (
    <div className="space-y-6">
      <SettingsBack title="Mailboxes" description="Sending identities. Credentials are encrypted at rest and never shown again." />
      <MailboxesClient mailboxes={data} />
    </div>
  );
}
