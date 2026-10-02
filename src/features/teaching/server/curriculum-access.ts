import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaDateKey } from "@/lib/namibia-date";

type Relation<T> = T | T[] | null;

type AllocationDbRow = {
  id: string;
  subject_offering_id: string;
  register_class_id: string | null;
  active_from: string;
  active_to: string | null;
  subject_offerings: Relation<{
    subject_id: string;
    curriculum_version_id: string | null;
    subjects: Relation<{ display_name: string }>;
    grades: Relation<{ display_name: string; grade_code: string }>;
  }>;
  register_classes: Relation<{ display_name: string }>;
};

type VersionDbRow = {
  id: string;
  version_key: string;
  effective_from_year: number;
  effective_to_year: number | null;
  status: string;
  metadata: Record<string, unknown>;
  curriculum_subjects: Relation<{
    id: string;
    display_name: string;
    phase_code: string | null;
    subject_code: string | null;
    authority: string;
  }>;
  curriculum_sources: Relation<{
    authority: string;
    source_key: string;
    title: string;
    source_url: string | null;
    source_document_date: string | null;
    checksum: string | null;
    provenance: Record<string, unknown>;
    status: string;
  }>;
};

type UnitDbRow = {
  id: string;
  curriculum_version_id: string;
  unit_code: string;
  theme: string | null;
  topic: string;
  sequence_number: number;
  assessment_guidance: string | null;
  practical_required: boolean;
  applicable_grade_keys: string[];
};

type ObjectiveDbRow = {
  curriculum_unit_id: string;
  objective_code: string | null;
  objective_text: string;
  sequence_number: number;
  applicable_grade_keys: string[];
};

type CompetencyDbRow = {
  curriculum_unit_id: string;
  competency_code: string | null;
  competency_text: string;
  sequence_number: number;
  applicable_grade_keys: string[];
};

type PracticalDbRow = {
  curriculum_unit_id: string;
  practical_code: string | null;
  title: string;
  description: string | null;
  recommended_periods: number | null;
  applicable_grade_keys: string[];
};

type ResourceLinkDbRow = {
  curriculum_version_id: string | null;
  relationship_type: string;
  official_education_resources: Relation<{
    id: string;
    authority: string;
    document_type: string;
    title: string;
    source_url: string;
    publication_label: string | null;
    publication_date: string | null;
    language_code: string | null;
    status: string;
  }>;
};

type MappingDbRow = {
  id: string;
  subject_id: string;
  curriculum_subject_id: string;
  grade_code: string;
  phase_code: string;
  programme_code: string | null;
  qualification_code: string | null;
  academic_regime: string | null;
  language_code: string | null;
  effective_from_year: number;
  effective_to_year: number | null;
};

type ResourceApplicabilityDbRow = {
  resource_id: string;
  curriculum_subject_id: string | null;
  phase_code: string | null;
  grade_key: string | null;
  programme_code: string | null;
  qualification_code: string | null;
  academic_regime: string | null;
  language_code: string | null;
  effective_from_year: number | null;
  effective_to_year: number | null;
};

function one<T>(value: Relation<T>): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function appliesToGrade(keys: string[] | null | undefined, gradeCode: string) {
  if (!keys?.length) return true;
  const target = normalizeKey(gradeCode);
  return keys.some((key) => normalizeKey(key) === target);
}

function optionalKeyMatches(expected: string | null, actual: string | null | undefined) {
  return expected === null || (Boolean(actual) && normalizeKey(expected) === normalizeKey(actual));
}

export type CurriculumAccessAllocation = {
  allocationId: string;
  offeringId: string;
  classId: string | null;
  className: string;
  gradeName: string;
  gradeCode: string;
  subjectId: string;
  subjectName: string;
  curriculumVersionId: string | null;
};

export type CurriculumAccessVersion = {
  id: string;
  versionKey: string;
  effectiveFromYear: number;
  effectiveToYear: number | null;
  status: string;
  metadataPresent: boolean;
  curriculumSubjectId: string;
  registrySubjectName: string;
  phaseCode: string | null;
  subjectCode: string | null;
  authority: string;
  source: {
    authority: string;
    sourceKey: string;
    title: string;
    sourceUrl: string | null;
    sourceDocumentDate: string | null;
    status: string;
    checksumPresent: boolean;
    provenancePresent: boolean;
    sourceReferenceRecorded: boolean;
  } | null;
};

export type CurriculumAccessUnit = {
  id: string;
  curriculumVersionId: string;
  unitCode: string;
  theme: string | null;
  topic: string;
  sequenceNumber: number;
  assessmentGuidance: string | null;
  practicalRequired: boolean;
  objectives: { code: string | null; text: string }[];
  competencies: { code: string | null; text: string }[];
  practicals: {
    code: string | null;
    title: string;
    description: string | null;
    recommendedPeriods: number | null;
  }[];
};

export type CurriculumAccessResource = {
  id: string;
  curriculumVersionId: string;
  relationshipType: string;
  authority: string;
  documentType: string;
  title: string;
  sourceUrl: string;
  publicationLabel: string | null;
  publicationDate: string | null;
  languageCode: string | null;
  status: string;
};

export type CurriculumAccessData = {
  today: string;
  academicYear: number;
  allocations: CurriculumAccessAllocation[];
  versionsById: Record<string, CurriculumAccessVersion>;
  unitsByAllocationId: Record<string, CurriculumAccessUnit[]>;
  resourcesByAllocationId: Record<string, CurriculumAccessResource[]>;
};

/**
 * Read-only teacher curriculum access.
 *
 * The visible registry scope is seeded only from the current-school staff
 * member's effective teacher allocations. The canonical curriculum registry
 * remains immutable from this surface; RLS still decides which approved /
 * published registry rows the authenticated user may read.
 */
export async function getTeacherCurriculumAccess(input: {
  schoolId: string;
  academicYear: number;
  staffMemberId: string;
}): Promise<CurriculumAccessData> {
  const supabase = await createSupabaseServerClient();
  const today = getNamibiaDateKey();

  const allocationsResult = await supabase
    .from("teacher_allocations")
    .select(
      "id,subject_offering_id,register_class_id,active_from,active_to,subject_offerings(subject_id,curriculum_version_id,subjects(display_name),grades(display_name,grade_code)),register_classes(display_name)",
    )
    .eq("school_id", input.schoolId)
    .eq("academic_year", input.academicYear)
    .eq("staff_member_id", input.staffMemberId)
    .lte("active_from", today)
    .or(`active_to.is.null,active_to.gte.${today}`)
    .order("active_from")
    .order("id");

  if (allocationsResult.error) {
    throw new Error("Unable to load your current curriculum allocations.");
  }

  const allocationRows = (allocationsResult.data ?? []) as unknown as AllocationDbRow[];
  const allocations: CurriculumAccessAllocation[] = allocationRows.map((row) => {
    const offering = one(row.subject_offerings);
    const registerClass = one(row.register_classes);
    return {
      allocationId: row.id,
      offeringId: row.subject_offering_id,
      classId: row.register_class_id,
      className: registerClass?.display_name ?? "Unassigned class",
      gradeName: one(offering?.grades ?? null)?.display_name ?? "Grade not configured",
      gradeCode: one(offering?.grades ?? null)?.grade_code ?? "",
      subjectId: offering?.subject_id ?? "",
      subjectName: one(offering?.subjects ?? null)?.display_name ?? "Subject",
      curriculumVersionId: offering?.curriculum_version_id ?? null,
    };
  });

  const versionIds = [
    ...new Set(
      allocations
        .map((allocation) => allocation.curriculumVersionId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  if (!versionIds.length) {
    return { today, academicYear: input.academicYear, allocations, versionsById: {}, unitsByAllocationId: {}, resourcesByAllocationId: {} };
  }

  const versionsResult = await supabase
    .from("curriculum_versions")
    .select(
      "id,version_key,effective_from_year,effective_to_year,status,metadata,curriculum_subjects(id,display_name,phase_code,subject_code,authority),curriculum_sources(authority,source_key,title,source_url,source_document_date,checksum,provenance,status)",
    )
    .in("id", versionIds)
    .order("effective_from_year", { ascending: false });

  if (versionsResult.error) {
    throw new Error("Unable to load curriculum registry metadata.");
  }

  const versionRows = (versionsResult.data ?? []) as unknown as VersionDbRow[];
  const versionsById: Record<string, CurriculumAccessVersion> = {};

  for (const row of versionRows) {
    const subject = one(row.curriculum_subjects);
    const source = one(row.curriculum_sources);
    versionsById[row.id] = {
      id: row.id,
      versionKey: row.version_key,
      effectiveFromYear: row.effective_from_year,
      effectiveToYear: row.effective_to_year,
      status: row.status,
      metadataPresent: Object.keys(row.metadata ?? {}).length > 0,
      curriculumSubjectId: subject?.id ?? "",
      registrySubjectName: subject?.display_name ?? "Curriculum subject",
      phaseCode: subject?.phase_code ?? null,
      subjectCode: subject?.subject_code ?? null,
      authority: subject?.authority ?? "Registry",
      source: source
        ? {
            authority: source.authority,
            sourceKey: source.source_key,
            title: source.title,
            sourceUrl: source.source_url,
            sourceDocumentDate: source.source_document_date,
            status: source.status,
            checksumPresent: Boolean(source.checksum),
            provenancePresent: Object.keys(source.provenance ?? {}).length > 0,
            sourceReferenceRecorded: Boolean(source.source_url),
          }
        : null,
    };
  }

  const readableVersionIds = Object.keys(versionsById);
  if (!readableVersionIds.length) {
    return { today, academicYear: input.academicYear, allocations, versionsById, unitsByAllocationId: {}, resourcesByAllocationId: {} };
  }

  const unitsResult = await supabase
    .from("curriculum_units")
    .select(
      "id,curriculum_version_id,unit_code,theme,topic,sequence_number,assessment_guidance,practical_required,applicable_grade_keys",
    )
    .in("curriculum_version_id", readableVersionIds)
    .order("sequence_number")
    .order("unit_code");

  if (unitsResult.error) {
    throw new Error("Unable to load curriculum topics.");
  }

  const unitRows = (unitsResult.data ?? []) as unknown as UnitDbRow[];
  const unitIds = unitRows.map((row) => row.id);

  const subjectIds = [...new Set(allocations.map((allocation) => allocation.subjectId).filter(Boolean))];
  const [objectivesResult, competenciesResult, practicalsResult, resourceLinksResult, mappingsResult] = await Promise.all([
    unitIds.length
      ? supabase
          .from("curriculum_objectives")
          .select("curriculum_unit_id,objective_code,objective_text,sequence_number,applicable_grade_keys")
          .in("curriculum_unit_id", unitIds)
          .order("sequence_number")
      : Promise.resolve({ data: [] as ObjectiveDbRow[], error: null }),
    unitIds.length
      ? supabase
          .from("curriculum_competencies")
          .select("curriculum_unit_id,competency_code,competency_text,sequence_number,applicable_grade_keys")
          .in("curriculum_unit_id", unitIds)
          .order("sequence_number")
      : Promise.resolve({ data: [] as CompetencyDbRow[], error: null }),
    unitIds.length
      ? supabase
          .from("curriculum_practicals")
          .select("curriculum_unit_id,practical_code,title,description,recommended_periods,applicable_grade_keys")
          .in("curriculum_unit_id", unitIds)
          .order("created_at")
      : Promise.resolve({ data: [] as PracticalDbRow[], error: null }),
    supabase
      .from("official_education_resource_curriculum_links")
      .select(
        "curriculum_version_id,relationship_type,official_education_resources(id,authority,document_type,title,source_url,publication_label,publication_date,language_code,status)",
      )
      .in("curriculum_version_id", readableVersionIds)
      .order("relationship_type"),
    subjectIds.length
      ? supabase
          .from("school_subject_curriculum_mappings")
          .select(
            "id,subject_id,curriculum_subject_id,grade_code,phase_code,programme_code,qualification_code,academic_regime,language_code,effective_from_year,effective_to_year",
          )
          .eq("school_id", input.schoolId)
          .eq("status", "verified")
          .in("subject_id", subjectIds)
          .lte("effective_from_year", input.academicYear)
      : Promise.resolve({ data: [] as MappingDbRow[], error: null }),
  ]);

  if (objectivesResult.error) throw new Error("Unable to load curriculum objectives.");
  if (competenciesResult.error) throw new Error("Unable to load curriculum competencies.");
  if (practicalsResult.error) throw new Error("Unable to load curriculum practicals.");
  if (resourceLinksResult.error) throw new Error("Unable to load official curriculum resources.");
  if (mappingsResult.error) throw new Error("Unable to load curriculum applicability context.");

  const objectiveRowsByUnit = new Map<string, ObjectiveDbRow[]>();
  for (const row of (objectivesResult.data ?? []) as unknown as ObjectiveDbRow[]) {
    objectiveRowsByUnit.set(row.curriculum_unit_id, [
      ...(objectiveRowsByUnit.get(row.curriculum_unit_id) ?? []),
      row,
    ]);
  }

  const competencyRowsByUnit = new Map<string, CompetencyDbRow[]>();
  for (const row of (competenciesResult.data ?? []) as unknown as CompetencyDbRow[]) {
    competencyRowsByUnit.set(row.curriculum_unit_id, [
      ...(competencyRowsByUnit.get(row.curriculum_unit_id) ?? []),
      row,
    ]);
  }

  const practicalRowsByUnit = new Map<string, PracticalDbRow[]>();
  for (const row of (practicalsResult.data ?? []) as unknown as PracticalDbRow[]) {
    practicalRowsByUnit.set(row.curriculum_unit_id, [
      ...(practicalRowsByUnit.get(row.curriculum_unit_id) ?? []),
      row,
    ]);
  }

  const linkRows = (resourceLinksResult.data ?? []) as unknown as ResourceLinkDbRow[];
  const resourceIds = [
    ...new Set(
      linkRows
        .map((row) => one(row.official_education_resources)?.id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const resourceApplicabilityResult = resourceIds.length
    ? await supabase
        .from("official_education_resource_applicability")
        .select(
          "resource_id,curriculum_subject_id,phase_code,grade_key,programme_code,qualification_code,academic_regime,language_code,effective_from_year,effective_to_year",
        )
        .in("resource_id", resourceIds)
    : { data: [] as ResourceApplicabilityDbRow[], error: null };

  if (resourceApplicabilityResult.error) {
    throw new Error("Unable to load official resource applicability.");
  }

  const applicabilityByResource = new Map<string, ResourceApplicabilityDbRow[]>();
  for (const row of (resourceApplicabilityResult.data ?? []) as unknown as ResourceApplicabilityDbRow[]) {
    applicabilityByResource.set(row.resource_id, [
      ...(applicabilityByResource.get(row.resource_id) ?? []),
      row,
    ]);
  }

  const mappingRows = ((mappingsResult.data ?? []) as unknown as MappingDbRow[]).filter(
    (row) => row.effective_to_year === null || row.effective_to_year >= input.academicYear,
  );

  const unitsByAllocationId: Record<string, CurriculumAccessUnit[]> = {};
  const resourcesByAllocationId: Record<string, CurriculumAccessResource[]> = {};

  for (const allocation of allocations) {
    const versionId = allocation.curriculumVersionId;
    const version = versionId ? versionsById[versionId] : null;
    if (!versionId || !version) {
      unitsByAllocationId[allocation.allocationId] = [];
      resourcesByAllocationId[allocation.allocationId] = [];
      continue;
    }

    const candidateMappings = mappingRows.filter(
      (row) =>
        row.subject_id === allocation.subjectId &&
        row.curriculum_subject_id === version.curriculumSubjectId &&
        normalizeKey(row.grade_code) === normalizeKey(allocation.gradeCode),
    );
    const mapping = candidateMappings.length === 1 ? candidateMappings[0] : null;

    unitsByAllocationId[allocation.allocationId] = unitRows
      .filter(
        (row) =>
          row.curriculum_version_id === versionId &&
          appliesToGrade(row.applicable_grade_keys, allocation.gradeCode),
      )
      .map((row) => {
        const objectives = (objectiveRowsByUnit.get(row.id) ?? [])
          .filter((item) => appliesToGrade(item.applicable_grade_keys, allocation.gradeCode))
          .map((item) => ({ code: item.objective_code, text: item.objective_text }));
        const competencies = (competencyRowsByUnit.get(row.id) ?? [])
          .filter((item) => appliesToGrade(item.applicable_grade_keys, allocation.gradeCode))
          .map((item) => ({ code: item.competency_code, text: item.competency_text }));
        const practicals = (practicalRowsByUnit.get(row.id) ?? [])
          .filter((item) => appliesToGrade(item.applicable_grade_keys, allocation.gradeCode))
          .map((item) => ({
            code: item.practical_code,
            title: item.title,
            description: item.description,
            recommendedPeriods: item.recommended_periods,
          }));

        return {
          id: row.id,
          curriculumVersionId: row.curriculum_version_id,
          unitCode: row.unit_code,
          theme: row.theme,
          topic: row.topic,
          sequenceNumber: row.sequence_number,
          assessmentGuidance: row.assessment_guidance,
          practicalRequired: row.practical_required,
          objectives,
          competencies,
          practicals,
        };
      });

    resourcesByAllocationId[allocation.allocationId] = linkRows.flatMap((row) => {
      if (row.curriculum_version_id !== versionId) return [];
      const resource = one(row.official_education_resources);
      if (!resource) return [];

      const applicability = applicabilityByResource.get(resource.id) ?? [];
      const visible =
        !applicability.length ||
        applicability.some((rule) => {
          if (
            rule.curriculum_subject_id !== null &&
            rule.curriculum_subject_id !== version.curriculumSubjectId
          ) {
            return false;
          }
          if (!optionalKeyMatches(rule.grade_key, allocation.gradeCode)) return false;

          const phaseCode = mapping?.phase_code ?? version.phaseCode;
          if (!optionalKeyMatches(rule.phase_code, phaseCode)) return false;

          if (!optionalKeyMatches(rule.programme_code, mapping?.programme_code)) return false;
          if (!optionalKeyMatches(rule.qualification_code, mapping?.qualification_code)) return false;
          if (!optionalKeyMatches(rule.academic_regime, mapping?.academic_regime)) return false;
          if (!optionalKeyMatches(rule.language_code, mapping?.language_code)) return false;

          if (rule.effective_from_year !== null && rule.effective_from_year > input.academicYear) {
            return false;
          }
          if (rule.effective_to_year !== null && rule.effective_to_year < input.academicYear) {
            return false;
          }
          return true;
        });

      if (!visible) return [];

      return [{
        id: resource.id,
        curriculumVersionId: versionId,
        relationshipType: row.relationship_type,
        authority: resource.authority,
        documentType: resource.document_type,
        title: resource.title,
        sourceUrl: resource.source_url,
        publicationLabel: resource.publication_label,
        publicationDate: resource.publication_date,
        languageCode: resource.language_code,
        status: resource.status,
      }];
    });
  }

  return {
    today,
    academicYear: input.academicYear,
    allocations,
    versionsById,
    unitsByAllocationId,
    resourcesByAllocationId,
  };
}
