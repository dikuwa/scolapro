import { Activity, CheckCircle2, CircleAlert, Clock3 } from "lucide-react";
import type { CommunicationDeliveryDiagnostic } from "@/features/communications/server/diagnostics";

const statusLabels: Record<string, string> = {
  pending: "Waiting",
  processing: "Sending",
  retry: "Retrying",
  completed: "Completed",
  dead: "Failed",
  cancelled: "Cancelled",
};

function statusClass(status: string) {
  if (status === "completed") return "bg-success-soft text-[color:var(--success)]";
  if (status === "dead") return "bg-danger-soft text-[color:var(--danger)]";
  if (status === "retry" || status === "processing") return "bg-warning-soft text-[color:var(--warning)]";
  return "bg-surface-muted text-muted-foreground";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function DeliveryDiagnosticsPanel({ jobs }: { jobs: CommunicationDeliveryDiagnostic[] }) {
  const attention = jobs.filter((job) => ["pending", "processing", "retry", "dead"].includes(job.status)).length;
  const failed = jobs.filter((job) => job.status === "dead").length;
  const completed = jobs.filter((job) => job.status === "completed").length;

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="scolapro-section-title">Delivery diagnostics</h2>
          <p className="scolapro-section-description">Recent provider delivery state for this school. Failed jobs remain visible for operational follow-up.</p>
        </div>
        <span className="scolapro-tone-sky inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 py-1 text-xs font-medium">
          <Activity className="size-3.5" aria-hidden="true" /> {attention} needing attention
        </span>
      </div>

      <div className="grid gap-3 py-4 sm:grid-cols-3">
        <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-3"><p className="text-xs text-muted-foreground">Recent jobs</p><p className="mt-1 text-xl font-semibold">{jobs.length}</p></div>
        <div className="rounded-[var(--radius-sm)] bg-success-soft px-3 py-3"><p className="text-xs text-[color:var(--success)]">Completed</p><p className="mt-1 text-xl font-semibold text-[color:var(--success)]">{completed}</p></div>
        <div className="rounded-[var(--radius-sm)] bg-danger-soft px-3 py-3"><p className="text-xs text-[color:var(--danger)]">Failed</p><p className="mt-1 text-xl font-semibold text-[color:var(--danger)]">{failed}</p></div>
      </div>

      {jobs.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-xs">
            <thead className="border-b border-border-subtle text-muted-foreground"><tr><th className="px-2 py-2 font-medium">Channel</th><th className="px-2 py-2 font-medium">State</th><th className="px-2 py-2 font-medium">Attempts</th><th className="px-2 py-2 font-medium">Latest activity</th><th className="px-2 py-2 font-medium">Provider detail</th></tr></thead>
            <tbody className="divide-y divide-border-subtle">{jobs.slice(0, 25).map((job) => <tr key={job.deliveryJobId}>
              <td className="px-2 py-2.5 font-medium capitalize">{job.channel}</td>
              <td className="px-2 py-2.5"><span className={`inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-2 py-1 font-medium ${statusClass(job.status)}`}>{job.status === "completed" ? <CheckCircle2 className="size-3" aria-hidden="true" /> : job.status === "dead" ? <CircleAlert className="size-3" aria-hidden="true" /> : <Clock3 className="size-3" aria-hidden="true" />}{statusLabels[job.status] ?? job.status}</span></td>
              <td className="px-2 py-2.5 text-muted-foreground">{job.attemptCount}</td>
              <td className="px-2 py-2.5 text-muted-foreground">{formatDate(job.lastAttemptAt ?? job.completedAt ?? job.availableAt)}</td>
              <td className="px-2 py-2.5 text-muted-foreground">{job.latestErrorCode ?? job.latestOutcome ?? job.providerKey ?? "No provider detail"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      ) : <p className="py-6 text-center text-sm text-muted-foreground">No communication delivery jobs have been recorded for this school.</p>}
    </section>
  );
}
