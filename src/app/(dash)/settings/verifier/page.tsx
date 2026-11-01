import { prisma } from "@/lib/db";
import { credentialSource } from "@/lib/providers/secrets";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SettingsBack } from "../settings-ui";
import { SimpleProviderForm } from "../provider-form";

export const dynamic = "force-dynamic";

export default async function VerifierPage() {
  const conn = await prisma.providerConnection.upsert({
    where: { kind_name: { kind: "EMAIL_VERIFIER", name: "default" } },
    create: { kind: "EMAIL_VERIFIER", name: "default" },
    update: {},
  });
  return (
    <div className="space-y-6">
      <SettingsBack title="Email verifier" description="Deliverability is checked through this provider. Valid syntax or MX alone never counts as verified." />
      <Card>
        <CardHeader>
          <CardTitle>Verification provider</CardTitle>
          <CardDescription>
            Only <b>deliverable</b> contacts qualify for automatic sending by default. Catch-all and unknown require an
            explicit campaign setting and stay labelled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleProviderForm
            kind="EMAIL_VERIFIER"
            providers={[
              { value: "zerobounce", label: "ZeroBounce" },
              { value: "neverbounce", label: "NeverBounce" },
            ]}
            status={conn.status}
            source={credentialSource(conn)}
            currentProvider={(conn.meta as any)?.provider ?? "zerobounce"}
            lastError={conn.lastError}
          />
        </CardContent>
      </Card>
    </div>
  );
}
