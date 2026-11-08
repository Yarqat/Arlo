import { getProfile } from "@/lib/settings";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsBack } from "../settings-ui";
import { ProfileForm } from "./profile-form";
import { LearnBrand } from "./learn-brand";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const p = await getProfile();
  return (
    <div className="space-y-6">
      <SettingsBack title="Profile & Yarqat details" description="Who the assistant writes as. Used in every outreach email." />
      <LearnBrand initialWebsite={p.website} />
      <Card>
        <CardContent className="pt-5">
          <ProfileForm
            key={`${p.bio.slice(0, 32)}|${p.website}`}
            initial={{
              companyName: p.companyName,
              personName: p.personName,
              roleTitle: p.roleTitle,
              bio: p.bio,
              website: p.website,
              defaultSignature: p.defaultSignature,
              timezone: p.timezone,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
