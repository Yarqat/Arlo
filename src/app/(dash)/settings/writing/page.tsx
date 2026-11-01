import { getProfile } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SettingsBack } from "../settings-ui";
import { WritingForm } from "./writing-form";

export const dynamic = "force-dynamic";

export default async function WritingPage() {
  const p = await getProfile();
  return (
    <div className="space-y-6">
      <SettingsBack title="Writing preferences" description="How the assistant should write as you." />
      <Card>
        <CardHeader>
          <CardTitle>Voice & prohibited claims</CardTitle>
          <CardDescription>
            Prohibited claims are enforced in the outreach prompt. The assistant never invents prices, discounts,
            delivery dates, portfolio projects, results, testimonials or capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WritingForm initial={{ writingPreferences: p.writingPreferences, prohibitedClaims: p.prohibitedClaims }} />
        </CardContent>
      </Card>
    </div>
  );
}
