import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/misc";
import { SettingsBack } from "../settings-ui";
import { SuppressionManager } from "./suppression-client";
import { fmtDateTime } from "@/lib/time";
import { ShieldBan } from "lucide-react";

export const dynamic = "force-dynamic";

const reasonTone: Record<string, "danger" | "warning" | "neutral"> = {
  HARD_BOUNCE: "danger",
  UNSUBSCRIBE: "warning",
  COMPLAINT: "danger",
  INVALID: "danger",
  MANUAL: "neutral",
  REQUESTED_HUMAN: "neutral",
};

export default async function SuppressionPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const where = sp.q ? { email: { contains: sp.q.toLowerCase() } } : {};
  const [records, total] = await Promise.all([
    prisma.suppressionRecord.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.suppressionRecord.count(),
  ]);

  return (
    <div className="space-y-6">
      <SettingsBack title="Suppression list" description={`${total} permanently suppressed addresses. Never auto-reactivated; protected from CSV re-import.`} />
      <Card>
        <CardHeader>
          <CardTitle>Add or search</CardTitle>
          <CardDescription>Suppressing cancels all queued outreach and follow-ups to that address across every campaign.</CardDescription>
        </CardHeader>
        <CardContent>
          <SuppressionManager query={sp.q ?? ""} />
        </CardContent>
      </Card>

      {records.length === 0 ? (
        <EmptyState icon={<ShieldBan />} title="No suppressed addresses" description="Hard bounces and unsubscribes are added here automatically." />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <THead><TR><TH>Email</TH><TH>Reason</TH><TH>Source</TH><TH>Added</TH></TR></THead>
            <TBody>
              {records.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">{r.email}</TD>
                  <TD><Badge tone={reasonTone[r.reason]}>{r.reason.replace(/_/g, " ").toLowerCase()}</Badge></TD>
                  <TD className="text-muted">{r.source}</TD>
                  <TD className="text-xs text-muted-2">{fmtDateTime(r.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
