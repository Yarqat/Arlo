import { redirect } from "next/navigation";
import { getOwner } from "@/lib/auth";
import { TopNav } from "@/components/shell/topnav";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const owner = await getOwner();
  if (!owner) redirect("/login");
  const settings = await getSettings();

  return (
    <div className="min-h-screen bg-background">
      <TopNav ownerName={owner.name} paused={settings.emergencyPause} />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
