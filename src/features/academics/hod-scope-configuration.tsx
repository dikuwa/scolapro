"use client";

import { useActionState, useMemo, useState } from "react";
import { ChevronDown, Network, Plus, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Picker } from "@/components/ui/picker";
import { RecordActionButton } from "@/components/ui/record-action-button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import {
  createUnassignedHodPortfolio,
  appointHodPortfolio,
  endHodSubjectResponsibility,
  saveHodSubjectPortfolio,
  type HodScopeActionState,
} from "./server/hod-scope-actions";
import type {
  HodScopeHeadOption,
  HodScopeResponsibility,
  HodScopeSubject,
} from "./server/hod-scope";

type HodScopePortfolio = {
  id: string;
  label: string;
  subjectIds: string[];
  appointments: { id: string; headName: string; effectiveFrom: string; effectiveTo: string | null }[];
};

const emptyState: HodScopeActionState = {};

function ActionMessage({ state }: { state: HodScopeActionState }) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      className={
        state.success
          ? "rounded-[var(--radius-sm)] bg-success-soft/60 px-3 py-2 text-xs text-[color:var(--success)]"
          : "rounded-[var(--radius-sm)] bg-danger-soft/60 px-3 py-2 text-xs text-[color:var(--danger)]"
      }
    >
      {state.message}
    </p>
  );
}

function statusFor(row: HodScopeResponsibility, today: string) {
  if (row.effectiveFrom > today) return "Upcoming";
  if (row.effectiveTo && row.effectiveTo < today) return "Ended";
  return "Active";
}

function activeAppointment(portfolio: HodScopePortfolio, today: string) {
  return portfolio.appointments.find(
    (appointment) => appointment.effectiveFrom <= today && (!appointment.effectiveTo || appointment.effectiveTo >= today),
  );
}

function portfolioStatus(portfolio: HodScopePortfolio, today: string) {
  if (activeAppointment(portfolio, today)) return "Active";
  if (portfolio.appointments.some((appointment) => appointment.effectiveFrom > today)) return "Upcoming";
  if (portfolio.appointments.length) return "Ended";
  return "Unassigned";
}

function SubjectBadges({ ids, subjects }: { ids: string[]; subjects: HodScopeSubject[] }) {
  const byId = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);
  if (!ids.length) {
    return <span className="text-[0.68rem] text-muted-foreground">No subjects recorded on this portfolio</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Portfolio subject codes">
      {ids.map((id) => {
        const subject = byId.get(id);
        return (
          <li
            key={id}
            title={subject?.name ?? "Unknown subject"}
            className="rounded-[var(--radius-xs)] bg-surface-muted px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.04em] text-foreground"
          >
            {subject?.code || subject?.name || "Unknown"}
          </li>
        );
      })}
    </ul>
  );
}

function SuggestionSubjects({
  options,
  subjects,
  selectedSubjectIds,
  setSelectedSubjectIds,
  disabled,
}: {
  options: { value: string; label: string; helper?: string }[];
  subjects: HodScopeSubject[];
  selectedSubjectIds: string[];
  setSelectedSubjectIds: (next: string[]) => void;
  disabled?: boolean;
}) {
  const selectedSubjects = useMemo(
    () => selectedSubjectIds.map((id) => subjects.find((subject) => subject.id === id)).filter(Boolean) as HodScopeSubject[],
    [selectedSubjectIds, subjects],
  );
  return (
    <>
      {selectedSubjectIds.map((id) => (
        <input key={id} type="hidden" name="subjectIds" value={id} />
      ))}
      <SearchableSelect
        label="Subjects"
        options={options}
        placeholder="Search and choose subjects"
        searchPlaceholder="Search subjects"
        value=""
        multiple
        selectedValues={selectedSubjectIds}
        onToggle={(id) =>
          setSelectedSubjectIds(
            selectedSubjectIds.includes(id)
              ? selectedSubjectIds.filter((value) => value !== id)
              : [...selectedSubjectIds, id],
          )
        }
        disabled={disabled}
      />
      {selectedSubjects.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Selected subjects">
          {selectedSubjects.map((subject) => (
            <span
              key={subject.id}
              className="inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-brand-soft px-3 py-1.5 text-sm text-brand-strong"
            >
              {subject.name}
              <button
                type="button"
                aria-label={`Remove ${subject.name}`}
                onClick={() => setSelectedSubjectIds(selectedSubjectIds.filter((id) => id !== subject.id))}
                className="grid size-6 place-items-center rounded-[var(--radius-xs)] hover:bg-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function AssignSubjectsForm({
  schoolId,
  subjects,
  heads,
  today,
  defaultDepartmentLabel,
}: {
  schoolId: string;
  subjects: HodScopeSubject[];
  heads: HodScopeHeadOption[];
  today: string;
  defaultDepartmentLabel?: string;
}) {
  const [state, action, pending] = useActionState(saveHodSubjectPortfolio, emptyState);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [departmentLabel, setDepartmentLabel] = useState(defaultDepartmentLabel ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [effectiveTo, setEffectiveTo] = useState("");

  const subjectOptions = useMemo(
    () => subjects.map((subject) => ({ value: subject.id, label: subject.name, helper: subject.code })),
    [subjects],
  );
  const headOptions = useMemo(
    () => heads.map((head) => ({ value: head.assignmentId, label: head.name, helper: "Current HOD placement" })),
    [heads],
  );

  return (
    <form action={action} className="space-y-3 rounded-[var(--radius-sm)] border border-border-subtle p-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Assign subjects</h4>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Select one or more subjects in one save. Only current HOD staff placements are offered; the HOD does not need to teach the subject.
        </p>
      </div>
      <ActionMessage state={state} />
      <input type="hidden" name="schoolId" value={schoolId} />
      <SuggestionSubjects
        options={subjectOptions}
        subjects={subjects}
        selectedSubjectIds={selectedSubjectIds}
        setSelectedSubjectIds={setSelectedSubjectIds}
        disabled={!subjectOptions.length || pending}
      />
      <Picker
        label="HOD"
        name="assignmentId"
        value={assignmentId}
        onChange={setAssignmentId}
        options={headOptions}
        placeholder="Choose HOD"
        disabled={!heads.length || pending}
      />
      <label className="block text-xs font-medium">
        Department / portfolio label (optional)
        <input
          name="departmentLabel"
          value={departmentLabel}
          onChange={(event) => setDepartmentLabel(event.target.value)}
          maxLength={120}
          placeholder="e.g. Math & Science"
          className="scolapro-control-surface mt-1.5 min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm text-foreground outline-none focus-visible:border-[color:var(--brand)]/45 focus-visible:ring-4 focus-visible:ring-brand-soft"
        />
        <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">Descriptive only; subject responsibility remains the authorization source.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField label="Effective from" name="effectiveFrom" value={effectiveFrom} onChange={setEffectiveFrom} />
        <DateField label="Effective to (optional)" name="effectiveTo" value={effectiveTo} onChange={setEffectiveTo} />
      </div>
      <div className="flex justify-start sm:justify-end">
        <Button type="submit" loading={pending} disabled={!selectedSubjectIds.length || !assignmentId || !effectiveFrom}>
          <Plus className="size-4" aria-hidden="true" />
          Save subject portfolio
        </Button>
      </div>
    </form>
  );
}

function AppointHodForm({
  schoolId,
  heads,
  today,
  portfolios,
  portfolio,
}: {
  schoolId: string;
  heads: HodScopeHeadOption[];
  today: string;
  portfolios: HodScopePortfolio[];
  portfolio?: HodScopePortfolio;
}) {
  const [state, action, pending] = useActionState(appointHodPortfolio, emptyState);
  const [portfolioId, setPortfolioId] = useState(portfolio?.id ?? "");
  const [portfolioHeadId, setPortfolioHeadId] = useState("");
  const [portfolioDate, setPortfolioDate] = useState(today);

  const headOptions = useMemo(
    () => heads.map((head) => ({ value: head.assignmentId, label: head.name, helper: "Current HOD placement" })),
    [heads],
  );

  return (
    <form action={action} className="space-y-3 rounded-[var(--radius-sm)] border border-border-subtle p-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Change HOD</h4>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Assign HOD later keeps the effective-dated appointment history intact. An unassigned portfolio grants no review authority.
        </p>
      </div>
      <ActionMessage state={state} />
      <input type="hidden" name="schoolId" value={schoolId} />
      {portfolio ? (
        <input type="hidden" name="portfolioId" value={portfolio.id} />
      ) : (
        <Picker
          label="Portfolio"
          name="portfolioId"
          value={portfolioId}
          onChange={setPortfolioId}
          options={portfolios.map((option) => ({ value: option.id, label: option.label }))}
          placeholder="Choose portfolio"
          disabled={!portfolios.length || pending}
        />
      )}
      <Picker
        label="Eligible HOD"
        name="assignmentId"
        value={portfolioHeadId}
        onChange={setPortfolioHeadId}
        options={headOptions}
        placeholder="Choose HOD"
        disabled={!heads.length || pending}
      />
      <DateField label="Effective from" name="effectiveFrom" value={portfolioDate} onChange={setPortfolioDate} />
      <p className="text-xs text-muted-foreground">{portfolio ? `Appointing for ${portfolio.label}.` : "Assign HOD later for the chosen portfolio."}</p>
      <div className="flex justify-start sm:justify-end">
        <Button type="submit" loading={pending} disabled={!portfolioHeadId || !portfolioDate || (!portfolio && !portfolioId)}>
          Appoint HOD
        </Button>
      </div>
    </form>
  );
}

function EndResponsibilityForm({
  schoolId,
  responsibilities,
  today,
}: {
  schoolId: string;
  responsibilities: HodScopeResponsibility[];
  today: string;
}) {
  const [state, action, pending] = useActionState(endHodSubjectResponsibility, emptyState);
  const [endResponsibilityId, setEndResponsibilityId] = useState("");
  const [endDate, setEndDate] = useState(today);

  const endOptions = useMemo(
    () =>
      responsibilities
        .filter((row) => statusFor(row, today) !== "Ended")
        .map((row) => ({
          value: row.id,
          label: `${row.subjectName} · ${row.headName}`,
          helper: `From ${row.effectiveFrom}`,
        })),
    [responsibilities, today],
  );

  return (
    <form action={action} className="space-y-3 rounded-[var(--radius-sm)] border border-border-subtle p-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">End responsibility</h4>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Ending a responsibility preserves the original assignment and its historical provenance.
        </p>
      </div>
      <ActionMessage state={state} />
      <input type="hidden" name="schoolId" value={schoolId} />
      <Picker
        label="Responsibility"
        name="responsibilityId"
        value={endResponsibilityId}
        onChange={setEndResponsibilityId}
        options={endOptions}
        placeholder="Choose responsibility"
        disabled={!endOptions.length || pending}
      />
      <DateField label="Effective to" name="effectiveTo" value={endDate} onChange={setEndDate} />
      <div className="flex justify-start sm:justify-end">
        <Button type="submit" variant="neutral" loading={pending} disabled={!endResponsibilityId || !endDate}>
          End responsibility
        </Button>
      </div>
    </form>
  );
}

function CreatePortfolioForm({ schoolId, subjects }: { schoolId: string; subjects: HodScopeSubject[] }) {
  const [portfolioLabel, setPortfolioLabel] = useState("");
  const [portfolioState, portfolioAction, portfolioPending] = useActionState(createUnassignedHodPortfolio, emptyState);
  const [portfolioSubjectIds, setPortfolioSubjectIds] = useState<string[]>([]);

  const subjectOptions = useMemo(
    () => subjects.map((subject) => ({ value: subject.id, label: subject.name, helper: subject.code })),
    [subjects],
  );

  return (
    <form action={portfolioAction} className="space-y-3 rounded-[var(--radius-sm)] border border-border-subtle p-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Create unassigned portfolio</h4>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Create a subject portfolio now; assign an HOD later. An unassigned portfolio grants no review authority.
        </p>
      </div>
      <ActionMessage state={portfolioState} />
      <input type="hidden" name="schoolId" value={schoolId} />
      <label className="block text-xs font-medium">
        Portfolio name
        <input
          name="label"
          required
          maxLength={120}
          value={portfolioLabel}
          onChange={(event) => setPortfolioLabel(event.target.value)}
          placeholder="Mathematics & Science"
          className="scolapro-control-surface mt-1 min-h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm"
        />
      </label>
      <SuggestionSubjects
        options={subjectOptions}
        subjects={subjects}
        selectedSubjectIds={portfolioSubjectIds}
        setSelectedSubjectIds={setPortfolioSubjectIds}
        disabled={!subjectOptions.length || portfolioPending}
      />
      <div className="flex justify-start sm:justify-end">
        <Button type="submit" disabled={portfolioPending || !portfolioLabel.trim() || !portfolioSubjectIds.length} loading={portfolioPending}>
          Create portfolio without HOD
        </Button>
      </div>
    </form>
  );
}

function PortfolioScopeRow({
  portfolio,
  subjects,
  heads,
  responsibilities,
  today,
  schoolId,
  open,
  operation,
  onToggle,
  onToggleOperation,
}: {
  portfolio: HodScopePortfolio;
  subjects: HodScopeSubject[];
  heads: HodScopeHeadOption[];
  responsibilities: HodScopeResponsibility[];
  today: string;
  schoolId: string;
  open: boolean;
  operation: "assign" | "change" | "end" | null;
  onToggle: () => void;
  onToggleOperation: (next: "assign" | "change" | "end") => void;
}) {
  const active = activeAppointment(portfolio, today);
  const status = portfolioStatus(portfolio, today);

  const operations = [
    { value: "assign" as const, label: "Assign subjects" },
    { value: "change" as const, label: "Change HOD" },
    { value: "end" as const, label: "End responsibility" },
  ];

  return (
    <article className="rounded-[var(--radius-sm)] border border-border-subtle" data-hod-scope-id={portfolio.id}>
      <div className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="scolapro-record-title">{portfolio.label}</p>
            <span
              className={cn(
                "rounded-[var(--radius-xs)] px-2 py-0.5 text-[0.62rem] font-semibold",
                status === "Active"
                  ? "bg-success-soft text-[color:var(--success)]"
                  : status === "Unassigned"
                    ? "bg-surface-muted text-muted-foreground"
                    : "bg-warning-soft text-[color:var(--warning)]",
              )}
            >
              {status}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            HOD: <span className={active ? "font-medium text-foreground" : "italic"}>{active ? active.headName : "Unassigned"}</span>
          </p>
          <div className="mt-2">
            <SubjectBadges ids={portfolio.subjectIds} subjects={subjects} />
          </div>
        </div>
        <div className="flex justify-start sm:justify-end">
          <RecordActionButton
            label={open ? "Close scope" : "Manage scope"}
            icon={open ? X : undefined}
            actionKind={open ? undefined : "manage"}
            variant="soft"
            expanded={open}
            onClick={onToggle}
            className="min-h-9 px-3 text-xs"
          />
        </div>
      </div>

      {open ? (
        <div className="space-y-3 border-t border-border-subtle px-3 py-3" data-hod-scope-editor={portfolio.id}>
          {portfolio.appointments.length ? (
            <div className="rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2">
              <p className="text-xs font-medium text-foreground">Appointment history</p>
              <ul className="mt-1 space-y-0.5">
                {portfolio.appointments.map((appointment) => (
                  <li key={appointment.id} className="text-[0.68rem] text-muted-foreground">
                    {appointment.headName} · {appointment.effectiveFrom} → {appointment.effectiveTo ?? "open"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Scope operations for ${portfolio.label}`}>
            {operations.map(({ value, label }) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={operation === value ? "primary" : "soft"}
                aria-expanded={operation === value}
                onClick={() => onToggleOperation(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {operation === null ? (
            <p className="text-[0.68rem] text-muted-foreground">Choose an operation to update this scope.</p>
          ) : null}
          {operation === "assign" ? (
            <AssignSubjectsForm
              schoolId={schoolId}
              subjects={subjects}
              heads={heads}
              today={today}
              defaultDepartmentLabel={portfolio.label}
            />
          ) : null}
          {operation === "change" ? (
            <AppointHodForm schoolId={schoolId} heads={heads} today={today} portfolios={[]} portfolio={portfolio} />
          ) : null}
          {operation === "end" ? (
            <EndResponsibilityForm schoolId={schoolId} responsibilities={responsibilities} today={today} />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function HodScopeConfiguration({
  schoolId,
  subjects,
  heads,
  responsibilities,
  today,
  portfolios,
}: {
  schoolId: string;
  subjects: HodScopeSubject[];
  heads: HodScopeHeadOption[];
  responsibilities: HodScopeResponsibility[];
  today: string;
  portfolios: HodScopePortfolio[];
}) {
  const [openScopeId, setOpenScopeId] = useState<string | null>(null);
  const [openOperation, setOpenOperation] = useState<"assign" | "change" | "end" | null>(null);

  const toggleScope = (scopeId: string) => {
    setOpenScopeId((current) => (current === scopeId ? null : scopeId));
    setOpenOperation(null);
  };

  const toggleOperation = (next: "assign" | "change" | "end") =>
    setOpenOperation((current) => (current === next ? null : next));
  const [showCreate, setShowCreate] = useState(false);

  return (
    <section
      id="hod-scope"
      className="mt-5 rounded-[var(--radius-md)] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
            <Network className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="scolapro-section-title">HOD teaching scope</h2>
            <p className="scolapro-section-description">
              Every configured portfolio is listed here. Open one scope to assign subjects, change its HOD or end a responsibility.
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="soft" aria-expanded={showCreate} onClick={() => setShowCreate((value) => !value)}>
          {showCreate ? <X className="size-3.5" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
          {showCreate ? "Close" : "New portfolio"}
        </Button>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-sm)] bg-surface-muted px-3 py-2.5 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Effective-dated subject responsibilities remain the authorization source for HOD preparation review and teaching-plan
          authoring. Labels such as Languages, Mathematics & Natural Sciences, Commerce or phase portfolios are suggestions only
          and are not encoded as official structures.
        </p>
      </div>

      {showCreate ? (
        <div className="mt-4">
          <CreatePortfolioForm schoolId={schoolId} subjects={subjects} />
        </div>
      ) : null}

      <div className="mt-4 space-y-2" data-hod-scope-list>
        {portfolios.length ? (
          portfolios.map((portfolio) => (
            <PortfolioScopeRow
              key={portfolio.id}
              portfolio={portfolio}
              subjects={subjects}
              heads={heads}
              responsibilities={responsibilities}
              today={today}
              schoolId={schoolId}
              open={openScopeId === portfolio.id}
              operation={openScopeId === portfolio.id ? openOperation : null}
              onToggle={() => toggleScope(portfolio.id)}
              onToggleOperation={toggleOperation}
            />
          ))
        ) : (
          <div className="rounded-[var(--radius-sm)] border border-dashed border-border px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">No HOD portfolio configured</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Create a portfolio, then assign an HOD when the responsibility is confirmed.
            </p>
          </div>
        )}
      </div>

      <details className="mt-5 rounded-[var(--radius-sm)] border border-border-subtle">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground">
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          Subject responsibility history
          <span className="text-xs font-normal text-muted-foreground">({responsibilities.length})</span>
        </summary>
        <div className="divide-y divide-border-subtle border-t border-border-subtle">
          {responsibilities.length ? (
            responsibilities.map((row) => {
              const status = statusFor(row, today);
              return (
                <div key={row.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {row.subjectName}
                      {row.subjectCode ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{row.subjectCode}</span> : null}
                    </p>
                    {row.departmentLabel ? <p className="mt-1 text-xs font-medium text-brand-strong">{row.departmentLabel}</p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.headName} · {row.effectiveFrom} → {row.effectiveTo ?? "open"}
                    </p>
                  </div>
                  <span className="self-start rounded-[var(--radius-xs)] bg-surface-muted px-2 py-1 text-xs font-medium text-foreground">
                    {status}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">No HOD scope configured</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Add explicit subject responsibilities before HOD review or planning authority is expected.
              </p>
            </div>
          )}
        </div>
      </details>

      {!heads.length ? (
        <p className="mt-4 rounded-[var(--radius-sm)] bg-warning-soft/60 px-3 py-2 text-xs text-[color:var(--warning)]">
          No current HOD placement is available. Assign the HOD role and an effective staff placement first.
        </p>
      ) : null}
    </section>
  );
}
