import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GovernanceSource = {
  id: string;
  authority: string;
  title: string;
  sourceUrl: string | null;
  sourceDocumentDate: string | null;
  checksum: string | null;
  provenance: Record<string, unknown>;
  status: string;
};

export type GovernanceProfile = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  title: string;
  phaseCode: string | null;
  cycleKind: string;
  cycleLength: number;
  periodMinutes: number | null;
  totalPeriodsPerCycle: number | null;
  effectiveFromYear: number;
  effectiveToYear: number | null;
  status: string;
  supersedesProfileId: string | null;
  provenance: Record<string, unknown>;
};

export type GovernanceAllocation = {
  id: string;
  profileId: string;
  curriculumSubjectId: string | null;
  curriculumSubjectLabel: string | null;
  allocationKey: string;
  targetKind: string;
  displayLabel: string;
  gradeFrom: number | null;
  gradeTo: number | null;
  periodsPerCycle: number;
  percentageTime: number | null;
  ruleStrength: string;
  sourceLocator: string | null;
  supersedesAllocationId: string | null;
  status: string;
};

export type GovernanceConstraint = {
  id: string;
  sourceId: string;
  curriculumSubjectId: string | null;
  allocationId: string | null;
  constraintType: string;
  gradeFrom: number | null;
  gradeTo: number | null;
  cycleKind: string | null;
  cycleLength: number | null;
  numericValue: number | null;
  ruleStrength: string;
  sourceLocator: string;
  effectiveFromYear: number;
  effectiveToYear: number | null;
  supersedesConstraintId: string | null;
  status: string;
};

export type GovernanceConflict = {
  allocationAId: string;
  allocationBId: string;
  allocationALabel: string;
  allocationBLabel: string;
  sourceATitle: string;
  sourceBTitle: string;
  cycleKind: string;
  cycleLength: number;
  gradeFrom: number;
  gradeTo: number;
  effectiveFromYear: number;
  effectiveToYear: number;
};

export type CurriculumTimeGovernanceWorkspace = {
  sources: GovernanceSource[];
  profiles: GovernanceProfile[];
  allocations: GovernanceAllocation[];
  constraints: GovernanceConstraint[];
  conflicts: GovernanceConflict[];
};

export async function getCurriculumTimeGovernanceWorkspace(): Promise<CurriculumTimeGovernanceWorkspace> {
  const supabase = await createSupabaseServerClient();
  const [sourcesResult, profilesResult, allocationsResult, constraintsResult, subjectsResult, conflictsResult] = await Promise.all([
    supabase.from("curriculum_sources").select("id,authority,title,source_url,source_document_date,checksum,provenance,status").order("created_at", { ascending: false }),
    supabase.from("curriculum_time_profiles").select("id,source_id,title,phase_code,cycle_kind,cycle_length,period_minutes,total_periods_per_cycle,effective_from_year,effective_to_year,status,supersedes_profile_id,provenance").order("updated_at", { ascending: false }),
    supabase.from("curriculum_time_allocations").select("id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,periods_per_cycle,percentage_time,rule_strength,source_locator,supersedes_allocation_id,status").order("updated_at", { ascending: false }),
    supabase.from("curriculum_scheduling_constraints").select("id,source_id,curriculum_subject_id,allocation_id,constraint_type,grade_from,grade_to,cycle_kind,cycle_length,numeric_value,rule_strength,source_locator,effective_from_year,effective_to_year,supersedes_constraint_id,status").order("updated_at", { ascending: false }),
    supabase.from("curriculum_subjects").select("id,display_name,subject_code"),
    supabase.rpc("get_curriculum_time_governance_conflicts"),
  ]);

  const error = sourcesResult.error || profilesResult.error || allocationsResult.error || constraintsResult.error || subjectsResult.error || conflictsResult.error;
  if (error) throw new Error("Unable to load curriculum-time governance data.");

  const sourceTitles = new Map((sourcesResult.data ?? []).map((row) => [row.id, row.title] as const));
  const subjectLabels = new Map((subjectsResult.data ?? []).map((row) => [
    row.id,
    [row.subject_code, row.display_name].filter(Boolean).join(" · "),
  ] as const));

  return {
    sources: (sourcesResult.data ?? []).map((row) => ({
      id: row.id,
      authority: row.authority,
      title: row.title,
      sourceUrl: row.source_url,
      sourceDocumentDate: row.source_document_date,
      checksum: row.checksum,
      provenance: (row.provenance ?? {}) as Record<string, unknown>,
      status: row.status,
    })),
    profiles: (profilesResult.data ?? []).map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      sourceTitle: sourceTitles.get(row.source_id) ?? "Unknown source",
      title: row.title,
      phaseCode: row.phase_code,
      cycleKind: row.cycle_kind,
      cycleLength: Number(row.cycle_length),
      periodMinutes: row.period_minutes === null ? null : Number(row.period_minutes),
      totalPeriodsPerCycle: row.total_periods_per_cycle === null ? null : Number(row.total_periods_per_cycle),
      effectiveFromYear: Number(row.effective_from_year),
      effectiveToYear: row.effective_to_year === null ? null : Number(row.effective_to_year),
      status: row.status,
      supersedesProfileId: row.supersedes_profile_id,
      provenance: (row.provenance ?? {}) as Record<string, unknown>,
    })),
    allocations: (allocationsResult.data ?? []).map((row) => ({
      id: row.id,
      profileId: row.profile_id,
      curriculumSubjectId: row.curriculum_subject_id,
      curriculumSubjectLabel: row.curriculum_subject_id ? subjectLabels.get(row.curriculum_subject_id) ?? null : null,
      allocationKey: row.allocation_key,
      targetKind: row.target_kind,
      displayLabel: row.display_label,
      gradeFrom: row.grade_from === null ? null : Number(row.grade_from),
      gradeTo: row.grade_to === null ? null : Number(row.grade_to),
      periodsPerCycle: Number(row.periods_per_cycle),
      percentageTime: row.percentage_time === null ? null : Number(row.percentage_time),
      ruleStrength: row.rule_strength,
      sourceLocator: row.source_locator,
      supersedesAllocationId: row.supersedes_allocation_id,
      status: row.status,
    })),
    constraints: (constraintsResult.data ?? []).map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      curriculumSubjectId: row.curriculum_subject_id,
      allocationId: row.allocation_id,
      constraintType: row.constraint_type,
      gradeFrom: row.grade_from === null ? null : Number(row.grade_from),
      gradeTo: row.grade_to === null ? null : Number(row.grade_to),
      cycleKind: row.cycle_kind,
      cycleLength: row.cycle_length === null ? null : Number(row.cycle_length),
      numericValue: row.numeric_value === null ? null : Number(row.numeric_value),
      ruleStrength: row.rule_strength,
      sourceLocator: row.source_locator,
      effectiveFromYear: Number(row.effective_from_year),
      effectiveToYear: row.effective_to_year === null ? null : Number(row.effective_to_year),
      supersedesConstraintId: row.supersedes_constraint_id,
      status: row.status,
    })),
    conflicts: ((conflictsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      allocationAId: String(row.allocation_a_id),
      allocationBId: String(row.allocation_b_id),
      allocationALabel: String(row.allocation_a_label),
      allocationBLabel: String(row.allocation_b_label),
      sourceATitle: String(row.source_a_title),
      sourceBTitle: String(row.source_b_title),
      cycleKind: String(row.cycle_kind),
      cycleLength: Number(row.cycle_length),
      gradeFrom: Number(row.grade_from),
      gradeTo: Number(row.grade_to),
      effectiveFromYear: Number(row.effective_from_year),
      effectiveToYear: Number(row.effective_to_year),
    })),
  };
}
