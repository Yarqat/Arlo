import { redirect } from "next/navigation";
import { getOwnerId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getOwnerId()) redirect("/");
  const ownerExists = (await prisma.owner.count()) > 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-fg">
            A
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Arlo</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your workspace</p>
        </div>
        {ownerExists ? (
          <LoginForm />
        ) : (
          <div className="rounded-lg border border-border bg-surface p-5 text-sm text-muted">
            No owner account exists yet. On the server run{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">pnpm seed:owner</code> to create
            your login, then refresh this page.
          </div>
        )}
      </div>
    </main>
  );
}
