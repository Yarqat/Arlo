import { getSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SettingsBack } from "../settings-ui";
import { AutomationForm } from "./automation-form";

export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const s = await getSettings();
  return (
    <div className="space-y-6">
      <SettingsBack title="Automation & scheduling" description="Hot-reply alerts, email enrichment, and your own booking link." />
      <Card>
        <CardHeader>
          <CardTitle>Owner alerts & enrichment</CardTitle>
          <CardDescription>
            Get emailed the instant a prospect replies with interest, and let Arlo harvest contact
            emails from prospect websites so more leads become reachable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AutomationForm
            initial={{
              hotReplyNotify: s.hotReplyNotify,
              notifyEmail: s.notifyEmail,
              enrichEmails: s.enrichEmails,
              enrichSocial: s.enrichSocial,
              emailAllContacts: s.emailAllContacts,
              trackClicks: s.trackClicks,
              bookingUrl: s.bookingUrl,
              hasCalcomKey: !!s.calcomApiKeyEnc,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
