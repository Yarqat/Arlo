import { prisma } from "@/lib/db";
import { credentialSource } from "@/lib/providers/secrets";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SettingsBack } from "../settings-ui";
import { SimpleProviderForm } from "../provider-form";

export const dynamic = "force-dynamic";

export default async function SearchProviderPage() {
  const conn = await prisma.providerConnection.upsert({
    where: { kind_name: { kind: "SEARCH", name: "default" } },
    create: { kind: "SEARCH", name: "default" },
    update: {},
  });
  return (
    <div className="space-y-6">
      <SettingsBack title="Search provider" description="Used to discover businesses. Only approved APIs and public directories — no scraping of private accounts or CAPTCHA bypass." />
      <Card>
        <CardHeader>
          <CardTitle>Discovery API</CardTitle>
          <CardDescription>Serper returns Google Places-style results; Google Places uses the official Places API.</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleProviderForm
            kind="SEARCH"
            providers={[
              { value: "serper", label: "Serper.dev (Google Places)" },
              { value: "google_places", label: "Google Places API (official)" },
            ]}
            status={conn.status}
            source={credentialSource(conn)}
            currentProvider={(conn.meta as any)?.provider ?? "serper"}
            lastError={conn.lastError}
          />
        </CardContent>
      </Card>
    </div>
  );
}
