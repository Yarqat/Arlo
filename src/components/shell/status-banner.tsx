import { Alert } from "@/components/ui/misc";
import type { PipelineBlocker } from "@/lib/status";

/**
 * Renders the live reasons the pipeline is stalled. Silent when healthy.
 */
export function StatusBanner({ blockers }: { blockers: PipelineBlocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <div className="mb-5 space-y-2">
      {blockers.map((b) => (
        <Alert key={b.key} tone={b.tone} title={b.title}>
          {b.detail}
        </Alert>
      ))}
    </div>
  );
}
