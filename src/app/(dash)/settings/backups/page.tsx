import fs from "node:fs/promises";
import { getSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/misc";
import { SettingsBack } from "../settings-ui";
import { DatabaseBackup } from "lucide-react";

export const dynamic = "force-dynamic";

const DIR = "/var/lib/yarqat/backups";

async function listBackups() {
  try {
    const files = await fs.readdir(DIR);
    const stats = await Promise.all(
      files
        .filter((f) => f.endsWith(".sql.gz"))
        .map(async (f) => {
          const st = await fs.stat(`${DIR}/${f}`);
          return { name: f, size: st.size, mtime: st.mtime };
        }),
    );
    return stats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

export default async function BackupsPage() {
  const [backups, settings] = await Promise.all([listBackups(), getSettings()]);
  return (
    <div className="space-y-6">
      <SettingsBack title="Backups & retention" description="Automated daily database backups with a tested restore path." />

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>A systemd timer runs a compressed pg_dump every day at 02:30, keeping the most recent 14.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Backup directory: <code className="text-xs">{DIR}</code></p>
          <p>Retention policy (app data): {settings.retentionDays === 0 ? "keep forever" : `${settings.retentionDays} days`}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent backups</CardTitle></CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <EmptyState icon={<DatabaseBackup />} title="No backups found" description="The first scheduled backup runs at 02:30; you can also run it manually on the server." />
          ) : (
            <Table>
              <THead><TR><TH>File</TH><TH>Size</TH><TH>Created</TH></TR></THead>
              <TBody>
                {backups.map((b) => (
                  <TR key={b.name}>
                    <TD className="font-mono text-xs">{b.name}</TD>
                    <TD>{(b.size / 1024).toFixed(0)} KB</TD>
                    <TD className="text-muted">{b.mtime.toISOString().replace("T", " ").slice(0, 16)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Manual backup & restore</CardTitle></CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 text-xs leading-relaxed">
{`# Run a backup now
sudo /usr/local/bin/yarqat-backup.sh

# Restore into a fresh database (verified procedure)
sudo -u postgres createdb yarqat_restore
gunzip -c /var/lib/yarqat/backups/<file>.sql.gz | sudo -u postgres psql yarqat_restore

# Swap in after verifying, then restart the app
sudo systemctl stop yarqat-web yarqat-worker
sudo -u postgres psql -c 'ALTER DATABASE yarqat RENAME TO yarqat_old;'
sudo -u postgres psql -c 'ALTER DATABASE yarqat_restore RENAME TO yarqat;'
sudo systemctl start yarqat-web yarqat-worker`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
