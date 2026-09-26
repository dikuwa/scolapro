"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  BookOpenText,
  CalendarDays,
  CalendarRange,
  CircleAlert,
  ClipboardCheck,
  FileText,
  FolderOpen,
  ListChecks,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { Picker } from "@/components/ui/picker";
import { DateField } from "@/components/ui/date-field";
import { FormFieldFeedback, formFieldControlOffsetClass, formFieldLabelClass, formRowAlignClass } from "@/components/ui/form-field-layout";
import { getNamibiaDateKey } from "@/lib/namibia-date";

// Teaching workspace views. Year Planner, Scheme of Work and Lesson
// Preparation are three views of ONE connected teaching plan: every row is
// derived from the same pacing-plan chain, never a separate document store.
// Official curriculum content renders read-only from the curriculum registry;
// teacher-authored preparation content is the teacher-owned editable layer.

export type TeachingWorkspaceProps = {
  today: string;
  academicYear: number;
  academicYearStatus: string | null;
  terms: {
    id: string;
    number: number;
    name: string;
    startsOn: string | null;
    endsOn: string | null;
    status: string;
    isCurrent: boolean;
  }[];
  currentTerm: { id: string; number: number; name: string; startsOn: string | null; endsOn: string | null; status: string } | null;
  allocations: {
    allocationId: string;
    classId: string | null;
    className: string;
    gradeName: string;
    subjectName: string;
    subjectId: string;
    offeringId: string;
    curriculumVersionId: string | null;
    activeFrom: string;
    activeTo: string | null;
  }[];
  planByAllocation: Record<
    string,
    { planId: string; planLevel: string; status: string; curriculumVersionId: string; offeringId: string }[]
  >;
  planItems: {
    itemId: string;
    planId: string;
    planLevel: string;
    planStatus: string;
    unitId: string;
    unitCode: string;
    topic: string;
    theme: string | null;
    sequenceNumber: number;
    plannedStartOn: string | null;
    plannedEndOn: string | null;
    plannedPeriods: number;
    recommendedPeriodsMin: number | null;
    recommendedPeriodsMax: number | null;
    practicalRequired: boolean;
    priority: string;
  }[];
  scheduleItems: { itemId: string; planItemId: string; plannedOn: string; plannedPeriodCount: number; status: string; movedTo: string | null }[];
  preparations: {
    id: string;
    scheduleItemId: string;
    plannedOn: string;
    status: string;
    preparation: Record<string, unknown>;
    curriculumSnapshot: Record<string, unknown>;
    reviewNote: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
  }[];
  actuals: { scheduleItemId: string; taughtOn: string; periodsUsed: number; coverageState: string; reflection: string | null; compensatoryAction: string | null }[];
  objectivesByUnit: Record<string, { unitId: string; code: string | null; text: string }[]>;
  competenciesByUnit: Record<string, { unitId: string; code: string | null; text: string }[]>;
  dayOverrides: { date: string; isSchoolDay: boolean; reason: string | null; source: string }[];
  hasLeadershipAuthority: boolean;
  isTeacher: boolean;
  planningHref: string | null;
  curriculumHref: string | null;
  preparationHref: string | null;
  coverageHref: string | null;
  filesHref: string | null;
  reviewHref: string | null;
  oversightHref: string | null;
  /** Optional deep-link entry view (e.g. "preparation" from HOD readiness prompts). */
  initialView?: ViewKey;
};

type ViewKey = "overview" | "year-planner" | "scheme" | "preparation" | "coverage" | "files" | "review";

const views: { key: ViewKey; label: string; icon: typeof CalendarDays }[] = [
  { key: "overview", label: "Overview", icon: CalendarDays },
  { key: "year-planner", label: "Year planner", icon: CalendarRange },
  { key: "scheme", label: "Scheme of work", icon: ListChecks },
  { key: "preparation", label: "Lesson preparation", icon: ClipboardCheck },
  { key: "coverage", label: "Coverage & reflection", icon: BookOpenCheck },
  { key: "files", label: "Teaching files", icon: FolderOpen },
];

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Registry data may legitimately leave planned dates unset; formatting must
// degrade gracefully instead of throwing on null/undefined dates.
function safeDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: string | null | undefined) {
  const parsed = safeDate(value);
  return parsed ? new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short", year: "numeric" }).format(parsed) : "Unscheduled";
}

function formatShort(value: string | null | undefined) {
  const parsed = safeDate(value);
  return parsed ? new Intl.DateTimeFormat("en-NA", { day: "numeric", month: "short" }).format(parsed) : "—";
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mondayOf(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function priorityLabel(priority: string) {
  switch (priority) {
    case "essential": return "Essential";
    case "high": return "High";
    case "extension": return "Extension";
    default: return "Normal";
  }
}

const coverageLabels: Record<string, string> = {
  not_started: "Not started",
  started: "Started",
  partially_taught: "Partially taught",
  taught: "Taught",
  reinforcement_needed: "Reinforcement needed",
  assessed: "Assessed",
};

function EmptyState({ title, description, hint }: { title: string; description: string; hint?: string }) {
  return (
    <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-border p-6 text-center">
      <CircleAlert className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function OfficialBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-brand-soft px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-wide text-brand-strong">
      <ShieldCheck className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export function TeachingWorkspace(props: TeachingWorkspaceProps) {
  const { allocations, planByAllocation, planItems, scheduleItems, preparations, actuals, terms, dayOverrides, objectivesByUnit, competenciesByUnit } = props;
  // The page always supplies today; fall back for direct renders (tests/storybook).
  const today = props.today ?? getNamibiaDateKey();
  const hasAllocations = allocations.length > 0;

  const [view, setView] = useState<ViewKey>(props.initialView ?? "overview");
  const [allocationKey, setAllocationKey] = useState(hasAllocations ? allocations[0].allocationId : "");
  const [termId, setTermId] = useState(props.currentTerm?.id ?? "");
  const [anchorDate, setAnchorDate] = useState(today);

  const allocation = allocations.find((item) => item.allocationId === allocationKey) ?? null;
  const selectedTerm = terms.find((term) => term.id === termId) ?? props.currentTerm ?? null;

  const termFilter = useMemo(() => {
    if (!selectedTerm) return null;
    if (selectedTerm.startsOn && selectedTerm.endsOn) return { from: selectedTerm.startsOn, to: selectedTerm.endsOn };
    return null;
  }, [selectedTerm]);

  // One connected plan: the plan items for this allocation come from the
  // pacing-plan chain; every view below derives from the same items.
  // Unscheduled items (no planned dates) stay visible in scheme/preparation
  // views — they are outstanding planning work, not excluded records.
  const connectedPlanItems = useMemo(() => {
    if (!allocation) return [];
    const plans = planByAllocation[allocation.offeringId] ?? [];
    const planIds = new Set(plans.map((plan) => plan.planId));
    return planItems
      .filter((item) => planIds.has(item.planId))
      .filter((item) => !termFilter || !item.plannedStartOn || (item.plannedStartOn <= termFilter.to && (!item.plannedEndOn || item.plannedEndOn >= termFilter.from)))
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber || a.unitCode.localeCompare(b.unitCode));
  }, [allocation, planByAllocation, planItems, termFilter]);

  const scheduleByPlanItem = useMemo(() => {
    const map = new Map<string, typeof scheduleItems>();
    for (const row of scheduleItems) {
      map.set(row.planItemId, [...(map.get(row.planItemId) ?? []), row]);
    }
    return map;
  }, [scheduleItems]);

  const preparationByScheduleItem = useMemo(() => {
    const map = new Map<string, (typeof preparations)[number]>();
    for (const row of preparations) map.set(row.scheduleItemId, row);
    return map;
  }, [preparations]);

  const actualByScheduleItem = useMemo(() => {
    const map = new Map<string, (typeof actuals)[number]>();
    for (const row of actuals) map.set(row.scheduleItemId, row);
    return map;
  }, [actuals]);

  const preparationStateFor = (planItemId: string) => {
    const rows = scheduleByPlanItem.get(planItemId) ?? [];
    const states = rows.map((row) => {
      const preparation = preparationByScheduleItem.get(row.itemId);
      const actual = actualByScheduleItem.get(row.itemId);
      if (actual) return { kind: "taught" as const, date: actual.taughtOn, preparation, actual };
      if (preparation && ["prepared", "submitted", "reviewed"].includes(preparation.status)) {
        return { kind: "prepared" as const, date: row.plannedOn, preparation, actual: null };
      }
      return { kind: "outstanding" as const, date: row.plannedOn, preparation: preparation ?? null, actual: null };
    });
    if (states.some((state) => state.kind === "taught")) return { label: "Taught", tone: "success" as const };
    if (states.some((state) => state.kind === "prepared")) return { label: "Prepared", tone: "brand" as const };
    if (states.length) return { label: "Outstanding", tone: "warning" as const };
    return null;
  };

  // Overview: current/next teaching context, prepared vs outstanding, coverage summary.
  const upcomingSchedule = useMemo(() => {
    if (!allocation) return [];
    const planIds = new Set((planByAllocation[allocation.offeringId] ?? []).map((plan) => plan.planId));
    const scoped = planItems.filter((item) => planIds.has(item.planId));
    const planItemIds = new Set(scoped.map((item) => item.itemId));
    return scheduleItems
      .filter((row) => planItemIds.has(row.planItemId) && row.plannedOn >= today && !["cancelled"].includes(row.status))
      .sort((a, b) => a.plannedOn.localeCompare(b.plannedOn))
      .slice(0, 4);
  }, [allocation, planByAllocation, planItems, scheduleItems, today]);

  const taughtCount = useMemo(() => {
    if (!allocation) return 0;
    const planIds = new Set((planByAllocation[allocation.offeringId] ?? []).map((plan) => plan.planId));
    const planItemIds = new Set(planItems.filter((item) => planIds.has(item.planId)).map((item) => item.itemId));
    return scheduleItems.filter((row) => planItemIds.has(row.planItemId) && actualByScheduleItem.has(row.itemId)).length;
  }, [allocation, planByAllocation, planItems, scheduleItems, actualByScheduleItem]);

  const scheduledCount = useMemo(() => {
    if (!allocation) return 0;
    const planIds = new Set((planByAllocation[allocation.offeringId] ?? []).map((plan) => plan.planId));
    const planItemIds = new Set(planItems.filter((item) => planIds.has(item.planId)).map((item) => item.itemId));
    return scheduleItems.filter((row) => planItemIds.has(row.planItemId)).length;
  }, [allocation, planByAllocation, planItems, scheduleItems]);

  const preparationSummary = useMemo(() => {
    let prepared = 0;
    let outstanding = 0;
    for (const row of scheduleItems) {
      const preparation = preparationByScheduleItem.get(row.itemId);
      if (preparation && ["prepared", "submitted", "reviewed"].includes(preparation.status)) prepared += 1;
      else outstanding += 1;
    }
    return { prepared, outstanding };
  }, [scheduleItems, preparationByScheduleItem]);

  // Year planner: current week strip derived from the calendar foundation.
  const weekStart = mondayOf(anchorDate);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const overrideByDate = useMemo(() => new Map(dayOverrides.map((row) => [row.date, row])), [dayOverrides]);

  const scheduleForDate = (date: string) => {
    if (!allocation) return [];
    const planIds = new Set((planByAllocation[allocation.offeringId] ?? []).map((plan) => plan.planId));
    const planItemIds = new Set(planItems.filter((item) => planIds.has(item.planId)).map((item) => item.itemId));
    return scheduleItems
      .filter((row) => planItemIds.has(row.planItemId) && row.plannedOn === date)
      .map((row) => ({ row, planItem: planItems.find((item) => item.itemId === row.planItemId) ?? null }));
  };

  const tabs: { key: ViewKey; label: string; icon: typeof CalendarDays }[] = [
    ...views,
    ...(props.reviewHref ? [{ key: "review" as ViewKey, label: "HOD review", icon: ShieldCheck }] : []),
  ];

  const toolLinks: { href: string; label: string; description: string; icon: typeof CalendarDays }[] = [];
  if (props.curriculumHref) toolLinks.push({ href: props.curriculumHref, label: "Curriculum", description: "Official registry topics, objectives and competencies", icon: BookOpenText });
  if (props.planningHref) toolLinks.push({ href: props.planningHref, label: "Teaching plan", description: "Author pacing, scheme and scheduled lessons", icon: CalendarRange });
  if (props.preparationHref) toolLinks.push({ href: props.preparationHref, label: "Lesson preparation", description: "Author and submit connected lesson preparations", icon: ClipboardCheck });
  if (props.coverageHref) toolLinks.push({ href: props.coverageHref, label: "Coverage & reflection", description: "Record actual teaching without rewriting the plan", icon: BookOpenCheck });
  if (props.filesHref) toolLinks.push({ href: props.filesHref, label: "Teaching files", description: "Open your governed professional-file hub", icon: FolderOpen });
  if (props.reviewHref) toolLinks.push({ href: props.reviewHref, label: "HOD review", description: "Review submissions and readiness exceptions", icon: ShieldCheck });
  if (props.oversightHref) toolLinks.push({ href: props.oversightHref, label: "Teaching oversight", description: "Inspect connected plans, review evidence and actual teaching for your HOD subject scope", icon: ShieldCheck });

  return (
    <div className="space-y-5">
      {/* Connected-plan context bar: subject/class switcher + term/week context */}
      <section aria-label="Teaching context" className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${formRowAlignClass}`}>
          <Picker
            label="Subject & class"
            ariaLabel="Switch teaching subject and class"
            value={allocationKey}
            onChange={setAllocationKey}
            searchable
            disabled={!hasAllocations}
            searchPlaceholder="Search subject or class…"
            options={allocations.map((item) => ({
              value: item.allocationId,
              label: `${item.subjectName} · ${item.className}`,
              helper: item.gradeName,
            }))}
            placeholder={hasAllocations ? "Choose subject & class" : "No active allocations"}
          />
          <Picker
            label="Term"
            ariaLabel="Choose academic term"
            value={selectedTerm?.id ?? ""}
            onChange={setTermId}
            disabled={!terms.length}
            options={[
              ...(props.currentTerm ? [] : [{ value: "", label: "No term selected" }]),
              ...terms.map((term) => ({
                value: term.id,
                label: term.name,
                helper: term.startsOn && term.endsOn ? `${formatShort(term.startsOn)} – ${formatShort(term.endsOn)}` : term.status,
              })),
            ]}
            placeholder={terms.length ? "Choose term" : "No terms configured"}
          />
          <DateField label="Week of" name="plannerWeek" value={anchorDate} onChange={setAnchorDate} />
          <div className="min-w-0">
            <p className={formFieldLabelClass}>Term status</p>
            <div className={formFieldControlOffsetClass}>
              <div className="flex min-h-10 min-w-0 items-center rounded-[var(--radius-sm)] bg-surface-muted/55 px-3 text-xs leading-4 text-muted-foreground">
                <span className="min-w-0">
                  {selectedTerm
                    ? `${selectedTerm.name}${selectedTerm.startsOn && selectedTerm.endsOn ? ` · ${formatShort(selectedTerm.startsOn)} – ${formatShort(selectedTerm.endsOn)}` : ""}`
                    : "No term context configured yet."}
                </span>
              </div>
            </div>
            <FormFieldFeedback
              helper={<>Week of {formatDate(weekStart)} · {formatShort(weekDays[4])}</>}
            />
          </div>
        </div>
      </section>

      {toolLinks.length ? (
        <nav aria-label="Teaching tools" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {toolLinks.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className="scolapro-cta flex min-h-16 items-start gap-3 rounded-[var(--radius-sm)] border border-border-subtle bg-surface px-3 py-3 shadow-[var(--shadow-xs)] transition hover:bg-surface-muted"
              >
                <span className="scolapro-tone-brand grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{tool.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{tool.description}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      <nav aria-label="Teaching workspace views" className="flex gap-1 overflow-x-auto rounded-[var(--radius-sm)] bg-surface-muted p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              aria-current={view === tab.key ? "page" : undefined}
              className={`scolapro-cta flex min-h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-xs)] px-3 text-xs font-medium outline-none transition focus-visible:ring-4 focus-visible:ring-[color:var(--brand-soft)] ${view === tab.key ? "bg-surface text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {!hasAllocations ? (
        <EmptyState
          title="No active teaching allocations"
          description="Teaching planning follows the school's governed teacher allocations. You have no active allocation for this academic year."
          hint="Ask academic leadership to confirm your timetable allocations in Timetable setup."
        />
      ) : !allocation ? null : view === "overview" ? (
        <OverviewView
          allocation={allocation}
          currentTerm={selectedTerm}
          upcoming={upcomingSchedule.map((row) => ({ row, planItem: planItems.find((item) => item.itemId === row.planItemId) ?? null }))}
          prepared={preparationSummary.prepared}
          outstanding={preparationSummary.outstanding}
          scheduled={scheduledCount}
          taught={taughtCount}
          reviewHref={props.reviewHref}
        />
      ) : view === "year-planner" ? (
        <YearPlannerView
          allocation={allocation}
          weekDays={weekDays}
          weekStart={weekStart}
          anchorDate={anchorDate}
          onAnchorDate={setAnchorDate}
          rowsForDate={scheduleForDate}
          overrideByDate={overrideByDate}
        />
      ) : view === "scheme" ? (
        <SchemeView
          planItems={connectedPlanItems}
          objectivesByUnit={objectivesByUnit}
          competenciesByUnit={competenciesByUnit}
          stateFor={preparationStateFor}
        />
      ) : view === "preparation" ? (
        <PreparationView
          planItems={connectedPlanItems}
          scheduleByPlanItem={scheduleByPlanItem}
          preparationByScheduleItem={preparationByScheduleItem}
          objectivesByUnit={objectivesByUnit}
          competenciesByUnit={competenciesByUnit}
        />
      ) : view === "coverage" ? (
        <CoverageView
          planItems={connectedPlanItems}
          scheduleByPlanItem={scheduleByPlanItem}
          actualByScheduleItem={actualByScheduleItem}
          stateFor={preparationStateFor}
        />
      ) : view === "files" ? (
        <FilesView />
      ) : view === "review" && props.reviewHref ? (
        <HodEntryView href={props.reviewHref} />
      ) : null}
    </div>
  );
}

function OverviewView({
  allocation,
  currentTerm,
  upcoming,
  prepared,
  outstanding,
  scheduled,
  taught,
  reviewHref,
}: {
  allocation: NonNullable<TeachingWorkspaceProps["allocations"][number]>;
  currentTerm: TeachingWorkspaceProps["currentTerm"];
  upcoming: { row: TeachingWorkspaceProps["scheduleItems"][number]; planItem: TeachingWorkspaceProps["planItems"][number] | null }[];
  prepared: number;
  outstanding: number;
  scheduled: number;
  taught: number;
  reviewHref: string | null;
}) {
  const metrics = [
    { label: "Scheduled lessons", value: scheduled, tone: "scolapro-tone-brand" },
    { label: "Taught with actuals", value: taught, tone: "scolapro-tone-mint" },
    { label: "Prepared", value: prepared, tone: "scolapro-tone-sky" },
    { label: "Outstanding preparation", value: outstanding, tone: "scolapro-tone-amber" },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)]">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
              <p className="scolapro-stat-value mt-1.5 text-xl">{metric.value}</p>
            </div>
            <span className={`${metric.tone} grid size-9 place-items-center rounded-[var(--radius-sm)]`}>
              <ClipboardCheck className="size-4" aria-hidden="true" />
            </span>
          </article>
        ))}
      </div>

      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Next teaching context</h2>
        <p className="scolapro-section-description">
          {allocation.subjectName} · {allocation.className} · {currentTerm ? currentTerm.name : "No term context configured"}
        </p>
        {upcoming.length ? (
          <div className="mt-4 divide-y divide-border-subtle">
            {upcoming.map(({ row, planItem }) => (
              <div key={row.itemId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="scolapro-record-title">{planItem?.topic ?? "Curriculum unit"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(row.plannedOn)} · {row.plannedPeriodCount} {row.plannedPeriodCount === 1 ? "period" : "periods"}
                    {planItem ? ` · ${planItem.unitCode}` : ""}
                  </p>
                </div>
                <span className="rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground self-start sm:self-auto">
                  {row.status === "prepared" ? "Prepared" : row.status === "moved" ? "Moved" : "Planned"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No scheduled lessons ahead"
            description="This allocation has no planned teaching dates in the connected plan yet."
            hint="Planned lessons appear here once a pacing plan is scheduled against the school calendar."
          />
        )}
      </section>

      {reviewHref ? (
        <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-brand-strong" aria-hidden="true" />
            <h2 className="scolapro-section-title">HOD review &amp; readiness</h2>
          </div>
          <p className="scolapro-section-description">Preparation submissions and department readiness exceptions live in the dedicated review workspace.</p>
          <a href={reviewHref} className="scolapro-cta mt-4 inline-flex min-h-10 items-center gap-2 self-start bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong">
            Open review workspace
            <ArrowUpRightIcon />
          </a>
        </section>
      ) : null}
    </div>
  );
}

function YearPlannerView({
  allocation,
  weekDays,
  weekStart,
  anchorDate,
  onAnchorDate,
  rowsForDate,
  overrideByDate,
}: {
  allocation: NonNullable<TeachingWorkspaceProps["allocations"][number]>;
  weekDays: string[];
  weekStart: string;
  anchorDate: string;
  onAnchorDate: (value: string) => void;
  rowsForDate: (date: string) => { row: TeachingWorkspaceProps["scheduleItems"][number]; planItem: TeachingWorkspaceProps["planItems"][number] | null }[];
  overrideByDate: Map<string, TeachingWorkspaceProps["dayOverrides"][number]>;
}) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="scolapro-section-title">Week view · {allocation.subjectName} · {allocation.className}</h2>
          <p className="scolapro-section-description">One connected plan shown week by week. School calendar interruptions and term context come from the school calendar.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onAnchorDate(addDays(weekStart, -7))}
            className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Previous week
          </button>
          <button
            type="button"
            onClick={() => onAnchorDate(addDays(weekStart, 7))}
            className="scolapro-cta inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-xs)] bg-surface-muted px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Next week
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {weekDays.map((date, index) => {
          const override = overrideByDate.get(date);
          const rows = rowsForDate(date);
          const isToday = date === anchorDate;
          return (
            <article
              key={date}
              className={`rounded-[var(--radius-sm)] border p-3 ${override && !override.isSchoolDay ? "border-[color:var(--warning)]/40 bg-warning-soft/45" : "border-border-subtle bg-surface-muted/55"} ${isToday ? "ring-1 ring-inset ring-[color:var(--brand)]/35" : ""}`}
            >
              <header className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{weekdayLabels[index]}</p>
                <p className="text-[0.68rem] text-muted-foreground">{formatShort(date)}</p>
              </header>
              {override && !override.isSchoolDay ? (
                <p className="mt-2 text-[0.68rem] font-medium text-[color:var(--warning)]">{override.reason ?? "No school day"}</p>
              ) : rows.length ? (
                <ul className="mt-2 space-y-2">
                  {rows.map(({ row, planItem }) => (
                    <li key={row.itemId} className="rounded-[var(--radius-xs)] bg-surface px-2 py-1.5">
                      <p className="truncate text-[0.68rem] font-semibold">{planItem?.topic ?? "Curriculum unit"}</p>
                      <p className="text-[0.62rem] text-muted-foreground">
                        {row.plannedPeriodCount} {row.plannedPeriodCount === 1 ? "period" : "periods"}
                        {row.status === "moved" && row.movedTo ? ` · moved to ${formatShort(row.movedTo)}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[0.68rem] text-muted-foreground">No planned lessons</p>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.68rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-warning-soft ring-1 ring-inset ring-[color:var(--warning)]/40" aria-hidden="true" />School calendar interruption</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-surface-muted ring-1 ring-inset ring-border-subtle" aria-hidden="true" />Planned teaching day</span>
        <span className="inline-flex items-center gap-1.5"><Printer className="size-3.5" aria-hidden="true" />Printing uses dedicated document templates, not a browser capture.</span>
      </div>
    </section>
  );
}

function SchemeView({
  planItems,
  objectivesByUnit,
  competenciesByUnit,
  stateFor,
}: {
  planItems: TeachingWorkspaceProps["planItems"];
  objectivesByUnit: TeachingWorkspaceProps["objectivesByUnit"];
  competenciesByUnit: TeachingWorkspaceProps["competenciesByUnit"];
  stateFor: (planItemId: string) => { label: string; tone: "success" | "brand" | "warning" } | null;
}) {
  if (!planItems.length) {
    return (
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Scheme of work</h2>
        <p className="scolapro-section-description">Curriculum detail for the connected pacing plan.</p>
        <EmptyState
          title="No pacing plan items yet"
          description="The scheme is generated from the department/class pacing plan; no plan items exist for this subject and class in the selected term."
          hint="Academic leadership or the department owns pacing-plan creation."
        />
      </section>
    );
  }
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Scheme of work</h2>
      <p className="scolapro-section-description">Curriculum detail from the connected pacing plan. Official objectives and competencies come from the curriculum registry and are read-only.</p>
      <div className="mt-4 divide-y divide-border-subtle">
        {planItems.map((item) => {
          const state = stateFor(item.itemId);
          return (
            <article key={item.itemId} className="py-4 first:pt-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="scolapro-record-title">{item.topic}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[item.unitCode, item.theme, `${item.plannedPeriods} planned ${item.plannedPeriods === 1 ? "period" : "periods"}`, priorityLabel(item.priority), item.practicalRequired ? "Practical required" : null].filter(Boolean).join(" · ")}
                  </p>
                  {item.plannedStartOn ? (
                    <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                      Planned {formatDate(item.plannedStartOn)}{item.plannedEndOn ? ` – ${formatDate(item.plannedEndOn)}` : ""}
                    </p>
                  ) : null}
                </div>
                {state ? (
                  <span
                    className={`self-start rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs font-semibold sm:self-auto ${state.tone === "success" ? "bg-success-soft text-[color:var(--success)]" : state.tone === "brand" ? "bg-brand-soft text-brand-strong" : "bg-warning-soft text-[color:var(--warning)]"}`}
                  >
                    {state.label}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3">
                  <OfficialBadge label="Official curriculum" />
                  <ul className="mt-2 space-y-1.5">
                    {(objectivesByUnit[item.unitId] ?? []).map((objective, index) => (
                      <li key={index} className="text-xs leading-5 text-foreground">
                        {objective.code ? <span className="font-semibold text-muted-foreground">{objective.code} </span> : null}
                        {objective.text}
                      </li>
                    ))}
                    {!(objectivesByUnit[item.unitId] ?? []).length ? <li className="text-xs text-muted-foreground">No objectives recorded for this unit in the curriculum registry yet.</li> : null}
                  </ul>
                </div>
                <div className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3">
                  <OfficialBadge label="Basic competencies" />
                  <ul className="mt-2 space-y-1.5">
                    {(competenciesByUnit[item.unitId] ?? []).map((competency, index) => (
                      <li key={index} className="text-xs leading-5 text-foreground">
                        {competency.code ? <span className="font-semibold text-muted-foreground">{competency.code} </span> : null}
                        {competency.text}
                      </li>
                    ))}
                    {!(competenciesByUnit[item.unitId] ?? []).length ? <li className="text-xs text-muted-foreground">No competencies recorded for this unit in the curriculum registry yet.</li> : null}
                  </ul>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PreparationView({
  planItems,
  scheduleByPlanItem,
  preparationByScheduleItem,
  objectivesByUnit,
  competenciesByUnit,
}: {
  planItems: TeachingWorkspaceProps["planItems"];
  scheduleByPlanItem: Map<string, TeachingWorkspaceProps["scheduleItems"]>;
  preparationByScheduleItem: Map<string, TeachingWorkspaceProps["preparations"][number]>;
  objectivesByUnit: TeachingWorkspaceProps["objectivesByUnit"];
  competenciesByUnit: TeachingWorkspaceProps["competenciesByUnit"];
}) {
  if (!planItems.length) {
    return (
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Lesson preparation</h2>
        <p className="scolapro-section-description">Prepare scheduled lessons from the connected plan.</p>
        <EmptyState
          title="Nothing scheduled to prepare"
          description="Lesson preparation attaches to scheduled lessons from the pacing plan. This subject and class has no scheduled lessons in the selected term."
        />
      </section>
    );
  }
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Lesson preparation</h2>
      <p className="scolapro-section-description">
        Official curriculum content is prefilled read-only from the curriculum registry. Teacher-authored pedagogy is the teacher-owned layer.
      </p>
      <div className="mt-4 space-y-4">
        {planItems.map((item) => {
          const scheduleRows = scheduleByPlanItem.get(item.itemId) ?? [];
          if (!scheduleRows.length) return null;
          return (
            <article key={item.itemId} className="rounded-[var(--radius-sm)] border border-border-subtle p-3.5">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="scolapro-record-title">{item.topic}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.unitCode}{item.theme ? ` · ${item.theme}` : ""}</p>
                </div>
                <span className="self-start rounded-[var(--radius-xs)] bg-surface-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground sm:self-auto">
                  {scheduleRows.length} scheduled {scheduleRows.length === 1 ? "lesson" : "lessons"}
                </span>
              </header>

              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                {/* Official curriculum-controlled content: read-only registry material */}
                <div className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <OfficialBadge label="Official curriculum" />
                    <span className="text-[0.62rem] font-medium uppercase tracking-wide text-muted-foreground">Read-only</span>
                  </div>
                  <dl className="mt-2 space-y-2 text-xs">
                    <div>
                      <dt className="font-medium text-muted-foreground">Theme / topic</dt>
                      <dd className="mt-0.5 leading-5">{[item.theme, item.topic].filter(Boolean).join(" · ")}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">General objectives</dt>
                      <dd className="mt-0.5 leading-5">
                        {(objectivesByUnit[item.unitId] ?? []).length
                          ? (objectivesByUnit[item.unitId] ?? []).map((objective, index) => (
                              <span key={index} className="block">
                                {objective.code ? <span className="font-semibold text-muted-foreground">{objective.code} </span> : null}
                                {objective.text}
                              </span>
                            ))
                          : "No objectives recorded in the curriculum registry yet."}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">Basic competencies</dt>
                      <dd className="mt-0.5 leading-5">
                        {(competenciesByUnit[item.unitId] ?? []).length
                          ? (competenciesByUnit[item.unitId] ?? []).map((competency, index) => (
                              <span key={index} className="block">
                                {competency.code ? <span className="font-semibold text-muted-foreground">{competency.code} </span> : null}
                                {competency.text}
                              </span>
                            ))
                          : "No competencies recorded in the curriculum registry yet."}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Teacher-authored preparation content per scheduled lesson */}
                <div className="space-y-2.5">
                  {scheduleRows.map((row) => {
                    const preparation = preparationByScheduleItem.get(row.itemId);
                    const statusLabel = preparation
                      ? preparation.status === "draft"
                        ? "Draft"
                        : preparation.status === "prepared"
                          ? "Prepared"
                          : preparation.status === "submitted"
                            ? "Waiting for HOD review"
                            : preparation.status === "reviewed"
                              ? "Reviewed"
                              : preparation.status === "returned"
                                ? "Returned for changes"
                                : preparation.status
                      : "No preparation yet";
                    return (
                      <div key={row.itemId} className="rounded-[var(--radius-xs)] bg-surface-muted/45 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">{formatDate(row.plannedOn)} · {row.plannedPeriodCount} {row.plannedPeriodCount === 1 ? "period" : "periods"}</p>
                          <span
                            className={`rounded-[var(--radius-xs)] px-2 py-1 text-[0.62rem] font-semibold ${preparation?.status === "reviewed" ? "bg-success-soft text-[color:var(--success)]" : preparation && ["submitted", "reviewed"].includes(preparation.status) ? "bg-brand-soft text-brand-strong" : preparation ? "bg-surface-muted text-muted-foreground" : "bg-warning-soft text-[color:var(--warning)]"}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[0.68rem] leading-4 text-muted-foreground">
                          Teacher-authored fields (materials, introduction, lesson structure, activities, consolidation, homework) are managed in the dedicated Lesson preparation tool above. This view stays a connected read of the same plan and preparation records.
                        </p>
                        {preparation?.reviewNote ? (
                          <p className="mt-1.5 rounded-[var(--radius-xs)] bg-surface px-2 py-1.5 text-[0.68rem] text-muted-foreground">
                            <span className="font-semibold text-foreground">Review note: </span>
                            {preparation.reviewNote}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CoverageView({
  planItems,
  scheduleByPlanItem,
  actualByScheduleItem,
  stateFor,
}: {
  planItems: TeachingWorkspaceProps["planItems"];
  scheduleByPlanItem: Map<string, TeachingWorkspaceProps["scheduleItems"]>;
  actualByScheduleItem: Map<string, TeachingWorkspaceProps["actuals"][number]>;
  stateFor: (planItemId: string) => { label: string; tone: "success" | "brand" | "warning" } | null;
}) {
  if (!planItems.length) {
    return (
      <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
        <h2 className="scolapro-section-title">Coverage & reflection</h2>
        <p className="scolapro-section-description">Planned versus actual teaching for the connected plan.</p>
        <EmptyState
          title="No plan items to reconcile"
          description="Coverage compares planned teaching against recorded actuals. This subject and class has no plan items in the selected term."
        />
      </section>
    );
  }
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Coverage & reflection</h2>
      <p className="scolapro-section-description">Planned teaching stays intact; actual records show what happened without rewriting history. Use the Coverage & reflection tool above to record new actuals.</p>
      <div className="mt-4 divide-y divide-border-subtle">
        {planItems.map((item) => {
          const rows = scheduleByPlanItem.get(item.itemId) ?? [];
          const state = stateFor(item.itemId);
          return (
            <article key={item.itemId} className="py-3.5 first:pt-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="scolapro-record-title">{item.topic}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.unitCode} · {item.plannedPeriods} planned {item.plannedPeriods === 1 ? "period" : "periods"} · {rows.length} scheduled {rows.length === 1 ? "lesson" : "lessons"}
                  </p>
                </div>
                {state ? (
                  <span
                    className={`self-start rounded-[var(--radius-xs)] px-2.5 py-1.5 text-xs font-semibold sm:self-auto ${state.tone === "success" ? "bg-success-soft text-[color:var(--success)]" : state.tone === "brand" ? "bg-brand-soft text-brand-strong" : "bg-warning-soft text-[color:var(--warning)]"}`}
                  >
                    {state.label}
                  </span>
                ) : null}
              </div>
              {rows.length ? (
                <ul className="mt-2.5 space-y-1.5">
                  {rows.map((row) => {
                    const actual = actualByScheduleItem.get(row.itemId);
                    return (
                      <li key={row.itemId} className="flex flex-col gap-1 rounded-[var(--radius-xs)] bg-surface-muted/45 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs">
                          {formatDate(row.plannedOn)} · {row.plannedPeriodCount} {row.plannedPeriodCount === 1 ? "period" : "periods"}
                          {row.status === "moved" && row.movedTo ? ` · moved to ${formatShort(row.movedTo)}` : ""}
                        </span>
                        {actual ? (
                          <span className="text-[0.68rem] text-muted-foreground">
                            Taught {formatShort(actual.taughtOn)} · {actual.periodsUsed} {actual.periodsUsed === 1 ? "period" : "periods"} · {coverageLabels[actual.coverageState] ?? actual.coverageState}
                            {actual.reflection ? " · reflection recorded" : ""}
                          </span>
                        ) : (
                          <span className="text-[0.68rem] text-muted-foreground">No actual recorded yet</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No scheduled lessons for this plan item yet.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FilesView() {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <h2 className="scolapro-section-title">Teaching files</h2>
      <p className="scolapro-section-description">Teaching documents and resource files for your allocated subjects and classes.</p>
      <EmptyState
        title="Teaching files are available"
        description="Open Teaching files from the tools above to view your governed professional documents and connected teaching records."
        hint="The hub reuses existing document and teaching authority; no separate file store is created."
      />
    </section>
  );
}

function HodEntryView({ href }: { href: string }) {
  return (
    <section className="rounded-[var(--radius-md)] bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-brand-strong" aria-hidden="true" />
        <h2 className="scolapro-section-title">HOD review & readiness</h2>
      </div>
      <p className="scolapro-section-description">Preparation submissions and department readiness exceptions live in the dedicated review workspace.</p>
      <a href={href} className="scolapro-cta mt-4 inline-flex min-h-10 items-center gap-2 self-start bg-brand px-4 text-sm font-medium text-white shadow-[var(--shadow-xs)] hover:bg-brand-strong">
        Open review workspace
        <ArrowUpRightIcon />
      </a>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3">
          <p className="text-xs font-semibold">Preparation submissions</p>
          <p className="mt-1 text-xs text-muted-foreground">Review submitted week or term preparation packs with a governed audit trail.</p>
        </div>
        <div className="rounded-[var(--radius-sm)] bg-surface-muted/55 p-3">
          <p className="text-xs font-semibold">Readiness exceptions</p>
          <p className="mt-1 text-xs text-muted-foreground">Unsubmitted preparations, unreviewed submissions and capacity risk, without surveillance-style scoring.</p>
        </div>
      </div>
    </section>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="scolapro-cta-icon size-4" aria-hidden="true">
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  );
}

// Shared icon imports used by tab labels and empty states above.
export const teachingViewIcons = { BookOpenText, FileText, CalendarDays };
