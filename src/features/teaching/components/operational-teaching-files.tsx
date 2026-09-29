import Link from "next/link";
import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FileQuestion,
  FolderKanban,
  Link2,
  Printer,
} from "lucide-react";
import type { OperationalTeachingFilesWorkspace } from "@/features/teaching/server/operational-files-workspace";

const statusLabel = {
  resolved: "Resolved",
  missing: "Missing",
  unavailable: "Unavailable",
  manual: "Manual",
  external: "External",
} as const;

function statusClass(status: keyof typeof statusLabel) {
  if (status === "resolved") return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
  if (status === "external") return "bg-brand-soft text-brand-strong";
  if (status === "missing") return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
  return "bg-surface-muted text-muted-foreground";
}

function StatusIcon({ status }: { status: keyof typeof statusLabel }) {
  if (status === "resolved") return <CircleCheck className="size-3.5" aria-hidden="true" />;
  if (status === "external") return <ExternalLink className="size-3.5" aria-hidden="true" />;
  if (status === "missing") return <CircleAlert className="size-3.5" aria-hidden="true" />;
  return <FileQuestion className="size-3.5" aria-hidden="true" />;
}

export function OperationalTeachingFiles({
  workspace,
}: {
  workspace: OperationalTeachingFilesWorkspace;
}) {
  if (!workspace.allocations.length && !workspace.unsupportedAllocations.length) return null;

  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <FolderKanban className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden="true" />
          <div>
            <h2 className="scolapro-section-title">My operational files</h2>
            <p className="scolapro-section-description">
              Policy-grounded file requirements linked to the authoritative ScolaPro record wherever one already exists.
            </p>
          </div>
        </div>
        <a
          href="/api/teaching/files/inspection-pack"
          target="_blank"
          rel="noopener noreferrer"
          className="scolapro-cta inline-flex min-h-9 w-fit shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted px-3 text-xs font-medium hover:bg-surface-elevated"
        >
          <Printer className="size-3.5" aria-hidden="true" />
          Inspection pack
        </a>
      </div>

      {workspace.allocations.length ? (
        <div className="mt-4 space-y-5">
          {workspace.allocations.map((allocation) => (
            <article
              key={allocation.allocationId}
              className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-elevated p-3 sm:p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">
                    {allocation.subjectName} · {allocation.gradeName}
                    {allocation.className ? " · " + allocation.className : ""}
                  </h3>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {allocation.authority} · {allocation.sourceTitle} · Version {allocation.templateVersion}
                    {allocation.phaseLabel ? " · " + allocation.phaseLabel : ""}
                  </p>
                </div>
                <span className="w-fit rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-wide text-brand-strong">
                  Authoritative template
                </span>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {allocation.fileTypes.map((fileType) => (
                  <section
                    key={fileType.id}
                    className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3"
                  >
                    <h4 className="text-xs font-semibold uppercase tracking-wide">
                      {fileType.displayName}
                    </h4>

                    {fileType.sections.length ? (
                      <div className="mt-3 space-y-3">
                        {fileType.sections.map((section) => (
                          <div key={section.id}>
                            <p className="text-xs font-medium">{section.title}</p>
                            <ul className="mt-1.5 divide-y divide-border-subtle">
                              {section.items.map((item) => (
                                <li key={item.id} className="py-2.5 first:pt-1">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium">{item.label}</p>
                                      <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                                        Source: {item.resolverType.replaceAll("_", " ")}
                                      </p>
                                      {item.evidence.reason ? (
                                        <p className="mt-1 text-[0.68rem] leading-4 text-muted-foreground">
                                          {item.evidence.reason}
                                        </p>
                                      ) : null}
                                    </div>
                                    <span
                                      className={
                                        "inline-flex w-fit shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide " +
                                        statusClass(item.evidence.status)
                                      }
                                    >
                                      <StatusIcon status={item.evidence.status} />
                                      {statusLabel[item.evidence.status]}
                                    </span>
                                  </div>

                                  {item.evidence.references.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {item.evidence.references.map((reference) =>
                                        reference.href ? (
                                          <Link
                                            key={reference.id}
                                            href={reference.href}
                                            className="scolapro-cta inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-[0.68rem] font-medium hover:bg-surface-muted"
                                          >
                                            <Link2 className="size-3" aria-hidden="true" />
                                            {reference.label}
                                            <ArrowUpRight className="size-3" aria-hidden="true" />
                                          </Link>
                                        ) : (
                                          <span
                                            key={reference.id}
                                            className="inline-flex min-h-8 items-center rounded-[var(--radius-sm)] bg-surface px-2.5 text-[0.68rem] text-muted-foreground"
                                          >
                                            {reference.label}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-[var(--radius-xs)] border border-dashed border-border p-3">
                        <p className="text-xs font-medium">Recognized file type</p>
                        <p className="mt-1 text-[0.68rem] text-muted-foreground">
                          No internal hierarchy is defined by the authoritative source, so ScolaPro does not invent one.
                        </p>
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {workspace.unsupportedAllocations.length ? (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <CircleAlert className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-semibold">Subjects without a verified operational-file template</p>
          </div>
          <ul className="mt-2 space-y-2">
            {workspace.unsupportedAllocations.map((allocation) => (
              <li key={allocation.allocationId} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {allocation.subjectName} · {allocation.gradeName}
                  {allocation.className ? " · " + allocation.className : ""}
                </span>
                {" — "}
                {allocation.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}