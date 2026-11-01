import { requireOwner } from "@/lib/auth";
import { env } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsBack } from "../settings-ui";
import { SecurityForm } from "./security-form";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const owner = await requireOwner();
  let encOk = false;
  try {
    encOk = env().APP_ENCRYPTION_KEY.length === 64;
  } catch {
    encOk = false;
  }

  return (
    <div className="space-y-6">
      <SettingsBack title="Security" description="Password, sessions and how secrets are protected." />

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Use a long, unique password. You will stay signed in on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <SecurityForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Email" value={owner.email} />
          <Row label="Last sign-in" value={fmtDateTime(owner.lastLoginAt)} />
          <Row label="Session" value="httpOnly, Secure, SameSite=Lax cookie · 7-day expiry" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data protection</CardTitle>
          <CardDescription>How integration secrets and the app are secured.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Secret encryption" value={<Badge tone={encOk ? "success" : "danger"}>{encOk ? "AES-256-GCM active" : "Key missing"}</Badge>} />
          <Row label="Encryption key location" value="Environment file, outside the database" />
          <Row label="Transport" value="HTTPS only (TLS at the edge and origin)" />
          <Row label="Public signup" value={<Badge tone="success">Disabled — single owner</Badge>} />
          <Row label="Dashboard routes" value={<Badge tone="success">All protected by session</Badge>} />
          <Row label="Secrets in logs" value={<Badge tone="success">Redacted</Badge>} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-1.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
