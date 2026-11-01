import { prisma } from "@/lib/db";
import { UnsubscribeClient } from "./unsub-client";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contact = await prisma.contact.findUnique({ where: { unsubscribeToken: token }, include: { lead: true } });
  const already = contact ? await prisma.suppressionRecord.findUnique({ where: { email: contact.email } }) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center">
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-fg">Y</div>
        {!contact ? (
          <>
            <h1 className="text-lg font-semibold">Link not recognised</h1>
            <p className="mt-2 text-sm text-muted">This unsubscribe link is invalid or has expired.</p>
          </>
        ) : already ? (
          <>
            <h1 className="text-lg font-semibold">You're unsubscribed</h1>
            <p className="mt-2 text-sm text-muted">{contact.email} will not receive further emails from Yarqat.</p>
          </>
        ) : (
          <UnsubscribeClient token={token} email={contact.email} />
        )}
      </div>
    </main>
  );
}
