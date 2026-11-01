import { getSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SettingsBack } from "../settings-ui";
import { BudgetsForm } from "./budgets-form";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const s = await getSettings();
  return (
    <div className="space-y-6">
      <SettingsBack title="Budgets, limits & schedules" description="Hard caps enforced in code before any billable task runs." />
      <Card>
        <CardHeader>
          <CardTitle>Global limits</CardTitle>
          <CardDescription>
            Costs are reserved atomically before work starts, so concurrent jobs cannot overspend. Reporting day
            boundaries use your timezone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BudgetsForm
            initial={{
              timezone: s.timezone,
              dailySpendLimit: Number(s.dailySpendLimit),
              monthlySpendLimit: Number(s.monthlySpendLimit),
              dailyAiRequests: s.dailyAiRequests,
              dailyTokens: s.dailyTokens,
              dailyNewLeads: s.dailyNewLeads,
              dailyResearch: s.dailyResearch,
              dailyEmail: s.dailyEmail,
              hourlyEmail: s.hourlyEmail,
              maxFollowUps: s.maxFollowUps,
              maxPagesPerLead: s.maxPagesPerLead,
              maxRetriesPerJob: s.maxRetriesPerJob,
              maxJobSeconds: s.maxJobSeconds,
              verificationStaleDays: s.verificationStaleDays,
              retentionDays: s.retentionDays,
              unsubscribeFooter: s.unsubscribeFooter,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
