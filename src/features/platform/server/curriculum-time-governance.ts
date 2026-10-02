import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type JsonObject = Record<string, unknown>;

export type GovernanceSource = {
  id: string;
  authority: string;
  sourceKey: string;
  title: string;
  sourceUrl: string | null;
  sourceDocumentDate: string | null;
  checksum: string | null;
  provenance: JsonObject;
  status: string;
  readiness: string[];
};

export type GovernanceProfile = {
  id: string;
  sourceId: string;
  sourceAuthority: string;
  sourceTitle: string;
  sourceDocumentDate: string | null;
  profileKey: string;
  title: string;
  phaseCode: string | null;
  cycleKind: string;
  cycleLength: number;
  periodMinutes: number | null;
  totalPeriodsPerCycle: number | null;
  effectiveFromYear: number;
  effectiveToYear: number | null;
  status: string;
  verifiedAt: string | null;
  supersedesProfileId: string | null;
  provenance: JsonObject;
  readiness: string[];
};

export type GovernanceAllocation = {
  id: string;
  profileId: string;
  profileTitle: string;
  curriculumSubjectId: string | null;
  subjectName: string | null;
  allocationKey: string;
  targetKind: string;
  displayLabel: string;
  gradeFrom: number | null;
  gradeTo: number | null;
  periodsPerCycle: number;
  percentageTime: number | null;
  ruleStrength: string;
  sourceLocator: string | null;
  notes: string | null;
  supersedesAllocationId: string | null;
  status: string;
  verifiedAt: string | null;
  conflictAcknowledgementReason: string | null;
  readiness: string[];
  conflictCount: number;
};

export type GovernanceConstraint = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  allocationId: string | null;
  allocationLabel: string | null;
  curriculumSubjectId: string | null;
  subjectName: string | null;
  constraintKey: string;
  constraintType: string;
  gradeFrom: number | null;
  gradeTo: number | null;
  cycleKind: string | null;
  cycleLength: number | null;
  ruleStrength: string;
  numericValue: number | null;
  sourceLocator: string;
  effectiveFromYear: number;
  effectiveToYear: number | null;
  supersedesConstraintId: string | null;
  status: string;
  verifiedAt: string | null;
  readiness: string[];
};

export type GovernanceConflict = {
  leftAllocationId: string;
  rightAllocationId: string;
  leftLabel: string;
  rightLabel: string;
  profileScope: string;
  target: string;
  acknowledged: boolean;
};

export type CurriculumTimeGovernanceWorkspace = {
  sources: GovernanceSource[];
  profiles: GovernanceProfile[];
  allocations: GovernanceAllocation[];
  constraints: GovernanceConstraint[];
  conflicts: GovernanceConflict[];
  summary: {
    sources: number;
    verifiedSources: number;
    profiles: number;
    publishedProfiles: number;
    allocations: number;
    publishedAllocations: number;
    constraints: number;
    publishedConstraints: number;
    unresolvedConflicts: number;
  };
};

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function hasEvidence(source: { source_url?: unknown; checksum?: unknown; provenance?: unknown; status?: unknown }) {
  return source.status === "verified"
    && Boolean(String(source.source_url ?? "").trim())
    && Boolean(String(source.checksum ?? "").trim())
    && Object.keys(object(source.provenance)).length > 0;
}

function rangesOverlap(aFrom: number, aTo: number | null, bFrom: number, bTo: number | null) {
  return aFrom <= (bTo ?? 2200) && (aTo ?? 2200) >= bFrom;
}

function gradesOverlap(aFrom: number | null, aTo: number | null, bFrom: number | null, bTo: number | null) {
  return (aFrom ?? 0) <= (bTo ?? 20) && (aTo ?? 20) >= (bFrom ?? 0);
}

export async function getCurriculumTimeGovernanceWorkspace(): Promise<CurriculumTimeGovernanceWorkspace> {
  const supabase = await createSupabaseServerClient();
  const [sourcesResult, profilesResult, allocationsResult, constraintsResult, subjectsResult, slotSubjectsResult] = await Promise.all([
    supabase.from("curriculum_sources").select("id,authority,source_key,title,source_url,source_document_date,checksum,provenance,status,created_at").order("created_at", { ascending: false }),
    supabase.from("curriculum_time_profiles").select("id,source_id,profile_key,title,phase_code,cycle_kind,cycle_length,period_minutes,total_periods_per_cycle,effective_from_year,effective_to_year,status,verified_at,supersedes_profile_id,provenance,created_at").order("created_at", { ascending: false }),
    supabase.from("curriculum_time_allocations").select("id,profile_id,curriculum_subject_id,allocation_key,target_kind,display_label,grade_from,grade_to,periods_per_cycle,percentage_time,rule_strength,source_locator,notes,supersedes_allocation_id,status,verified_at,conflict_acknowledgement_reason,created_at").order("created_at", { ascending: false }),
    supabase.from("curriculum_scheduling_constraints").select("id,source_id,curriculum_subject_id,allocation_id,constraint_key,constraint_type,grade_from,grade_to,cycle_kind,cycle_length,rule_strength,numeric_value,source_locator,effective_from_year,effective_to_year,supersedes_constraint_id,status,verified_at,created_at").order("created_at", { ascending: false }),
    supabase.from("curriculum_subjects").select("id,display_name,subject_code"),
    supabase.from("curriculum_time_slot_subjects").select("allocation_id,curriculum_subject_id"),
  ]);

  const error = sourcesResult.error || profilesResult.error || allocationsResult.error || constraintsResult.error || subjectsResult.error || slotSubjectsResult.error;
  if (error) throw new Error("Unable to load curriculum time governance data.");

  const sourceRaw = (sourcesResult.data ?? []) as Array<Record<string, unknown>>;
  const profileRaw = (profilesResult.data ?? []) as Array<Record<string, unknown>>;
  const allocationRaw = (allocationsResult.data ?? []) as Array<Record<string, unknown>>;
  const constraintRaw = (constraintsResult.data ?? []) as Array<Record<string, unknown>>;
  const subjectRaw = (subjectsResult.data ?? []) as Array<Record<string, unknown>>;
  const slotSubjectRaw = (slotSubjectsResult.data ?? []) as Array<Record<string, unknown>>;

  const sourceById = new Map(sourceRaw.map((row) => [String(row.id), row]));
  const profileById = new Map(profileRaw.map((row) => [String(row.id), row]));
  const allocationById = new Map(allocationRaw.map((row) => [String(row.id), row]));
  const subjectById = new Map(subjectRaw.map((row) => [String(row.id), String(row.display_name ?? row.subject_code ?? "Curriculum subject")]));
  const slotSubjects = new Map<string, Set<string>>();

  for (const row of slotSubjectRaw) {
    const allocationId = String(row.allocation_id);
    const subjectId = String(row.curriculum_subject_id);
    const set = slotSubjects.get(allocationId) ?? new Set<string>();
    set.add(subjectId);
    slotSubjects.set(allocationId, set);
  }

  function sameTarget(left: Record<string, unknown>, right: Record<string, unknown>) {
    const leftKind = String(left.target_kind);
    const rightKind = String(right.target_kind);
    const leftSubject = left.curriculum_subject_id ? String(left.curriculum_subject_id) : null;
    const rightSubject = right.curriculum_subject_id ? String(right.curriculum_subject_id) : null;
    if (leftKind === "subject" && rightKind === "subject") return leftSubject === rightSubject;
    if (leftKind === "subject" && rightKind !== "subject") return Boolean(leftSubject && slotSubjects.get(String(right.id))?.has(leftSubject));
    if (leftKind !== "subject" && rightKind === "subject") return Boolean(rightSubject && slotSubjects.get(String(left.id))?.has(rightSubject));
    if (leftKind === rightKind && String(left.allocation_key) === String(right.allocation_key)) return true;
    const leftSlots = slotSubjects.get(String(left.id)) ?? new Set<string>();
    const rightSlots = slotSubjects.get(String(right.id)) ?? new Set<string>();
    return [...leftSlots].some((subjectId) => rightSlots.has(subjectId));
  }

  const conflictPairs: GovernanceConflict[] = [];
  const conflictCounts = new Map<string, number>();
  const conflictCandidates = allocationRaw.filter((row) => ["verified", "published"].includes(String(row.status)));

  for (let leftIndex = 0; leftIndex < conflictCandidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < conflictCandidates.length; rightIndex += 1) {
      const left = conflictCandidates[leftIndex];
      const right = conflictCandidates[rightIndex];
      const leftProfile = profileById.get(String(left.profile_id));
      const rightProfile = profileById.get(String(right.profile_id));
      if (!leftProfile || !rightProfile) continue;
      if (String(leftProfile.cycle_kind) !== String(rightProfile.cycle_kind) || Number(leftProfile.cycle_length) !== Number(rightProfile.cycle_length)) continue;
      if (!rangesOverlap(Number(leftProfile.effective_from_year), leftProfile.effective_to_year === null ? null : Number(leftProfile.effective_to_year), Number(rightProfile.effective_from_year), rightProfile.effective_to_year === null ? null : Number(rightProfile.effective_to_year))) continue;
      if (!gradesOverlap(left.grade_from === null ? null : Number(left.grade_from), left.grade_to === null ? null : Number(left.grade_to), right.grade_from === null ? null : Number(right.grade_from), right.grade_to === null ? null : Number(right.grade_to))) continue;
      if (!sameTarget(left, right)) continue;
      if (String(left.supersedes_allocation_id ?? "") === String(right.id) || String(right.supersedes_allocation_id ?? "") === String(left.id)) continue;

      const leftId = String(left.id);
      const rightId = String(right.id);
      conflictCounts.set(leftId, (conflictCounts.get(leftId) ?? 0) + 1);
      conflictCounts.set(rightId, (conflictCounts.get(rightId) ?? 0) + 1);
      conflictPairs.push({
        leftAllocationId: leftId,
        rightAllocationId: rightId,
        leftLabel: String(left.display_label),
        rightLabel: String(right.display_label),
        profileScope: String(leftProfile.cycle_kind) + " " + Number(leftProfile.cycle_length) + "-day · " + Number(leftProfile.effective_from_year) + "–" + String(leftProfile.effective_to_year ?? "open"),
        target: left.curriculum_subject_id
          ? subjectById.get(String(left.curriculum_subject_id)) ?? String(left.display_label)
          : String(left.target_kind).replaceAll("_", " ") + " · " + String(left.allocation_key),
        acknowledged: Boolean(String(left.conflict_acknowledgement_reason ?? "").trim() || String(right.conflict_acknowledgement_reason ?? "").trim()),
      });
    }
  }

  const sources: GovernanceSource[] = sourceRaw.map((row) => {
    const readiness: string[] = [];
    if (String(row.status) !== "verified") readiness.push("Source is not human-verified.");
    if (!String(row.source_url ?? "").trim()) readiness.push("Source URL is missing.");
    if (!String(row.checksum ?? "").trim()) readiness.push("Checksum is missing.");
    if (!Object.keys(object(row.provenance)).length) readiness.push("Source provenance is missing.");
    return {
      id: String(row.id),
      authority: String(row.authority),
      sourceKey: String(row.source_key),
      title: String(row.title),
      sourceUrl: row.source_url ? String(row.source_url) : null,
      sourceDocumentDate: row.source_document_date ? String(row.source_document_date) : null,
      checksum: row.checksum ? String(row.checksum) : null,
      provenance: object(row.provenance),
      status: String(row.status),
      readiness,
    };
  });

  const profiles: GovernanceProfile[] = profileRaw.map((row) => {
    const source = sourceById.get(String(row.source_id));
    const readiness: string[] = [];
    if (!source || !hasEvidence(source)) readiness.push("Verified source URL, checksum and provenance are required before publication.");
    if (String(row.status) === "draft") readiness.push("Profile must be human-verified before publication.");
    return {
      id: String(row.id),
      sourceId: String(row.source_id),
      sourceAuthority: source ? String(source.authority) : "Authority unavailable",
      sourceTitle: source ? String(source.title) : "Source unavailable",
      sourceDocumentDate: source?.source_document_date ? String(source.source_document_date) : null,
      profileKey: String(row.profile_key),
      title: String(row.title),
      phaseCode: row.phase_code ? String(row.phase_code) : null,
      cycleKind: String(row.cycle_kind),
      cycleLength: Number(row.cycle_length),
      periodMinutes: row.period_minutes === null ? null : Number(row.period_minutes),
      totalPeriodsPerCycle: row.total_periods_per_cycle === null ? null : Number(row.total_periods_per_cycle),
      effectiveFromYear: Number(row.effective_from_year),
      effectiveToYear: row.effective_to_year === null ? null : Number(row.effective_to_year),
      status: String(row.status),
      verifiedAt: row.verified_at ? String(row.verified_at) : null,
      supersedesProfileId: row.supersedes_profile_id ? String(row.supersedes_profile_id) : null,
      provenance: object(row.provenance),
      readiness,
    };
  });

  const allocations: GovernanceAllocation[] = allocationRaw.map((row) => {
    const profile = profileById.get(String(row.profile_id));
    const source = profile ? sourceById.get(String(profile.source_id)) : null;
    const readiness: string[] = [];
    if (!profile || String(profile.status) !== "published") readiness.push("Parent profile must be published first.");
    if (!source || !hasEvidence(source)) readiness.push("Verified source evidence is required.");
    if (!String(row.source_locator ?? "").trim()) readiness.push("Source locator is required.");
    if (String(row.status) === "draft") readiness.push("Allocation must be human-verified before publication.");
    if ((conflictCounts.get(String(row.id)) ?? 0) > 0 && !String(row.conflict_acknowledgement_reason ?? "").trim()) readiness.push("Source conflict requires an explicit acknowledgement reason or supersession.");
    return {
      id: String(row.id),
      profileId: String(row.profile_id),
      profileTitle: profile ? String(profile.title) : "Profile unavailable",
      curriculumSubjectId: row.curriculum_subject_id ? String(row.curriculum_subject_id) : null,
      subjectName: row.curriculum_subject_id ? subjectById.get(String(row.curriculum_subject_id)) ?? null : null,
      allocationKey: String(row.allocation_key),
      targetKind: String(row.target_kind),
      displayLabel: String(row.display_label),
      gradeFrom: row.grade_from === null ? null : Number(row.grade_from),
      gradeTo: row.grade_to === null ? null : Number(row.grade_to),
      periodsPerCycle: Number(row.periods_per_cycle),
      percentageTime: row.percentage_time === null ? null : Number(row.percentage_time),
      ruleStrength: String(row.rule_strength),
      sourceLocator: row.source_locator ? String(row.source_locator) : null,
      notes: row.notes ? String(row.notes) : null,
      supersedesAllocationId: row.supersedes_allocation_id ? String(row.supersedes_allocation_id) : null,
      status: String(row.status),
      verifiedAt: row.verified_at ? String(row.verified_at) : null,
      conflictAcknowledgementReason: row.conflict_acknowledgement_reason ? String(row.conflict_acknowledgement_reason) : null,
      readiness,
      conflictCount: conflictCounts.get(String(row.id)) ?? 0,
    };
  });

  const constraints: GovernanceConstraint[] = constraintRaw.map((row) => {
    const source = sourceById.get(String(row.source_id));
    const allocation = row.allocation_id ? allocationById.get(String(row.allocation_id)) : null;
    const readiness: string[] = [];
    if (!source || !hasEvidence(source)) readiness.push("Verified source evidence is required.");
    if (!String(row.source_locator ?? "").trim()) readiness.push("Source locator is required.");
    if (allocation && !["published", "superseded"].includes(String(allocation.status))) readiness.push("Linked allocation must be published first.");
    if (String(row.status) === "draft") readiness.push("Constraint must be human-verified before publication.");
    return {
      id: String(row.id),
      sourceId: String(row.source_id),
      sourceTitle: source ? String(source.title) : "Source unavailable",
      allocationId: row.allocation_id ? String(row.allocation_id) : null,
      allocationLabel: allocation ? String(allocation.display_label) : null,
      curriculumSubjectId: row.curriculum_subject_id ? String(row.curriculum_subject_id) : null,
      subjectName: row.curriculum_subject_id ? subjectById.get(String(row.curriculum_subject_id)) ?? null : null,
      constraintKey: String(row.constraint_key),
      constraintType: String(row.constraint_type),
      gradeFrom: row.grade_from === null ? null : Number(row.grade_from),
      gradeTo: row.grade_to === null ? null : Number(row.grade_to),
      cycleKind: row.cycle_kind ? String(row.cycle_kind) : null,
      cycleLength: row.cycle_length === null ? null : Number(row.cycle_length),
      ruleStrength: String(row.rule_strength),
      numericValue: row.numeric_value === null ? null : Number(row.numeric_value),
      sourceLocator: String(row.source_locator),
      effectiveFromYear: Number(row.effective_from_year),
      effectiveToYear: row.effective_to_year === null ? null : Number(row.effective_to_year),
      supersedesConstraintId: row.supersedes_constraint_id ? String(row.supersedes_constraint_id) : null,
      status: String(row.status),
      verifiedAt: row.verified_at ? String(row.verified_at) : null,
      readiness,
    };
  });

  return {
    sources,
    profiles,
    allocations,
    constraints,
    conflicts: conflictPairs,
    summary: {
      sources: sources.length,
      verifiedSources: sources.filter((item) => item.status === "verified").length,
      profiles: profiles.length,
      publishedProfiles: profiles.filter((item) => item.status === "published").length,
      allocations: allocations.length,
      publishedAllocations: allocations.filter((item) => item.status === "published").length,
      constraints: constraints.length,
      publishedConstraints: constraints.filter((item) => item.status === "published").length,
      unresolvedConflicts: conflictPairs.filter((item) => !item.acknowledged).length,
    },
  };
}
