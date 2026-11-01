import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SettingsBack } from "../settings-ui";
import { ServicesManager, PortfolioManager } from "./services-client";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const [services, portfolio] = await Promise.all([
    prisma.service.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.portfolioItem.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="space-y-6">
      <SettingsBack title="Services & portfolio" description="What you offer and approved examples the assistant may reference." />
      <Card>
        <CardHeader>
          <CardTitle>Service catalogue</CardTitle>
          <CardDescription>Only enabled services are offered. Prices are never mentioned in outreach.</CardDescription>
        </CardHeader>
        <CardContent>
          <ServicesManager services={services} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Portfolio examples</CardTitle>
          <CardDescription>Real, approved work only. The assistant will not invent projects or results.</CardDescription>
        </CardHeader>
        <CardContent>
          <PortfolioManager items={portfolio} />
        </CardContent>
      </Card>
    </div>
  );
}
