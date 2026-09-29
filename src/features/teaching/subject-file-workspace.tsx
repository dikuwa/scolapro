"use client";

import Link from "next/link";
import { ArrowUpRight, CircleAlert, CircleCheck, ClipboardList, ExternalLink, FileQuestion, FileText, Printer, UsersRound } from "lucide-react";
import type { SubjectFileWorkspace } from "./server/subject-file";


const policyStatusLabel = {
  resolved:"Resolved",
  missing:"Missing",
  unavailable:"Unavailable",
  manual:"Manual",
  external:"External",
} as const;

function policyStatusClass(status:keyof typeof policyStatusLabel) {
  if (status==="resolved") return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
  if (status==="external") return "bg-brand-soft text-brand-strong";
  if (status==="missing") return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
  return "bg-surface-muted text-muted-foreground";
}

function PolicyStatusIcon({status}:{status:keyof typeof policyStatusLabel}) {
  if (status==="resolved") return <CircleCheck className="size-3.5" aria-hidden="true"/>;
  if (status==="external") return <ExternalLink className="size-3.5" aria-hidden="true"/>;
  if (status==="missing") return <CircleAlert className="size-3.5" aria-hidden="true"/>;
  return <FileQuestion className="size-3.5" aria-hidden="true"/>;
}

export function SubjectFileWorkspaceView({data}:{data:SubjectFileWorkspace}) {
  return <div className="space-y-4">
    {data.rows.length ? data.rows.map((row)=><section key={row.subjectId} className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="scolapro-section-title">{row.subjectName}</h2>
            <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">{row.accessMode==="hod"?"HOD portfolio":"Teaching access"}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{row.subjectCode}{row.departmentLabel ? ` · ${row.departmentLabel}`:""} · {row.gradeNames.join(", ") || "No current grades"}</p>
        </div>
        <a href={`/api/teaching/subject-file/inspection-pack?subjectId=${encodeURIComponent(row.subjectId)}&year=${data.academicYear}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted px-3 text-xs font-medium hover:bg-surface-elevated">
          <Printer className="size-3.5"/>Inspection pack
        </a>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3"><p className="text-xs text-muted-foreground">Teaching team</p><p className="mt-1 text-xl font-semibold">{row.teacherNames.length}</p></article>
        <article className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3"><p className="text-xs text-muted-foreground">Plans / schedules</p><p className="mt-1 text-xl font-semibold">{row.planningCount} / {row.scheduledLessonCount}</p></article>
        <article className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3"><p className="text-xs text-muted-foreground">Preparations</p><p className="mt-1 text-xl font-semibold">{row.preparationCount}</p></article>
        <article className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3"><p className="text-xs text-muted-foreground">Assessment / moderation</p><p className="mt-1 text-xl font-semibold">{row.assessmentInstanceCount} / {row.moderationRequiredCount}</p></article>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="rounded-[var(--radius-sm)] border border-border-subtle p-4">
          <div className="flex items-center gap-2"><UsersRound className="size-4 text-brand-strong"/><h3 className="text-sm font-semibold">Teaching team</h3></div>
          {row.teacherNames.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{row.teacherNames.map((name)=><li key={name} className="rounded-[var(--radius-xs)] bg-surface-muted px-3 py-2 text-xs">{name}</li>)}</ul> : <p className="mt-3 text-xs text-muted-foreground">No current teacher allocation is recorded.</p>}
        </div>
        <div className="rounded-[var(--radius-sm)] border border-border-subtle p-4">
          <div className="flex items-center gap-2"><ClipboardList className="size-4 text-brand-strong"/><h3 className="text-sm font-semibold">Evidence counts</h3></div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><dt className="text-muted-foreground">Allocations</dt><dd className="font-medium">{row.allocationCount}</dd></div>
            <div><dt className="text-muted-foreground">Assessment schemes</dt><dd className="font-medium">{row.assessmentSchemeCount}</dd></div>
            <div><dt className="text-muted-foreground">Assessment instances</dt><dd className="font-medium">{row.assessmentInstanceCount}</dd></div>
            <div><dt className="text-muted-foreground">Moderation required</dt><dd className="font-medium">{row.moderationRequiredCount}</dd></div>
          </dl>
        </div>
      </div>

      {row.policyHierarchy ? <div className="mt-4 rounded-[var(--radius-sm)] border border-border-subtle p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Official Subject File hierarchy</h3>
            <p className="mt-1 break-words text-[0.68rem] leading-4 text-muted-foreground">
              {row.policyHierarchy.authority} · {row.policyHierarchy.sourceTitle} · Version {row.policyHierarchy.templateVersion}
            </p>
            <p className="mt-1 text-[0.68rem] text-muted-foreground">
              {row.policyHierarchy.phaseLabels.length ? row.policyHierarchy.phaseLabels.join(" · ") : "Applicable phase not labelled"}
            </p>
          </div>
          <span className="w-fit rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-wide text-brand-strong">Source-grounded</span>
        </div>

        <div className="mt-4 space-y-3">
          {row.policyHierarchy.sections.map((section)=><section key={section.id} className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3">
            <h4 className="text-xs font-semibold">{section.title}</h4>
            <ul className="mt-2 divide-y divide-border-subtle">
              {section.items.map((item)=><li key={item.id} className="py-2.5 first:pt-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{item.label}</p>
                    <p className="mt-0.5 text-[0.68rem] text-muted-foreground">Source: {item.resolverType.replaceAll("_"," ")}</p>
                    {item.reason ? <p className="mt-1 text-[0.68rem] leading-4 text-muted-foreground">{item.reason}</p> : null}
                  </div>
                  <span className={"inline-flex w-fit shrink-0 items-center gap-1 rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide "+policyStatusClass(item.status)}>
                    <PolicyStatusIcon status={item.status}/>{policyStatusLabel[item.status]}
                  </span>
                </div>
                {item.references.length ? <div className="mt-2 flex flex-wrap gap-2">
                  {item.references.map((reference)=><Link key={reference.id} href={reference.href} className="scolapro-cta inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-2.5 text-[0.68rem] font-medium hover:bg-surface-muted">
                    <span className="truncate">{reference.label}</span><ArrowUpRight className="size-3 shrink-0" aria-hidden="true"/>
                  </Link>)}
                </div> : null}
              </li>)}
            </ul>
          </section>)}
        </div>
      </div> : <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-4">
        <div className="flex items-start gap-2">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>
          <div>
            <h3 className="text-xs font-semibold">No authoritative Subject File hierarchy</h3>
            <p className="mt-1 text-[0.68rem] leading-4 text-muted-foreground">{row.policyHierarchyReason}</p>
          </div>
        </div>
      </div>}

      <div className="mt-4">
        <h3 className="text-sm font-semibold">Authoritative source modules</h3>
        <p className="mt-1 text-xs text-muted-foreground">These links open the live source records. The Subject File does not create mutable copies.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {row.sourceLinks.map((link)=><Link key={link.label} href={link.href} className="group rounded-[var(--radius-sm)] border border-border-subtle bg-surface-muted/55 p-3 hover:bg-surface-muted">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{link.label}</span><ArrowUpRight className="size-3.5 text-muted-foreground group-hover:text-brand-strong"/></div>
            <p className="mt-1 text-[0.68rem] leading-4 text-muted-foreground">{link.description}</p>
          </Link>)}
        </div>
      </div>

      <div className="mt-4 rounded-[var(--radius-sm)] bg-surface-muted p-4">
        <div className="flex items-center gap-2"><FileText className="size-4 text-muted-foreground"/><h3 className="text-xs font-semibold">Source gaps kept explicit</h3></div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.68rem] leading-4 text-muted-foreground">{row.unavailableSources.map((message)=><li key={message}>{message}</li>)}</ul>
      </div>
    </section>) : <section className="rounded-[var(--radius-md)] bg-surface-muted p-6 text-sm text-muted-foreground">No current HOD subject responsibility or teacher allocation is available for this account.</section>}
  </div>;
}
