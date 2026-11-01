import { redirect } from "next/navigation";
import { getOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/shell/sidebar";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const owner = await getOwner();
  if (!owner) redirect("/login");
  const settings = await getSettings();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar ownerName={owner.name} paused={settings.emergencyPause} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
