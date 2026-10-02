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
    curriculum_version_id: string | null;
    subjects: Relation<{ display_name: string }>;
    grades: Relation<{ display_name: string }>;
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
};

type ObjectiveDbRow = {
  curriculum_unit_id: string;
  objective_code: string | null;
  objective_text: string;
  sequence_number: number;
};

type CompetencyDbRow = {
  curriculum_unit_id: string;
  competency_code: string | null;
  competency_text: string;
  sequence_number: number;
};

type PracticalDbRow = {
  curriculum_unit_id: string;
  practical_code: string | null;
  title: string;
  description: string | null;
  recommended_periods: number | null;
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

function one<T>(value: Relation<T>): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export type CurriculumAccessAllocation = {
  allocationId: string;
  offeringId: string;
  classId: string | null;
  className: string;
  gradeName: string;
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
  unitsByVersionId: Record<string, CurriculumAccessUnit[]>;
  resourcesByVersionId: Record<string, CurriculumAccessResource[]>;
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
      "id,subject_offering_id,register_class_id,active_from,active_to,subject_offerings(curriculum_version_id,subjects(display_name),grades(display_name)),register_classes(display_name)",
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
    return { today, academicYear: input.academicYear, allocations, versionsById: {}, unitsByVersionId: {}, resourcesByVersionId: {} };
  }

  const versionsResult = await supabase
    .from("curriculum_versions")
    .select(
      "id,version_key,effective_from_year,effective_to_year,status,metadata,curriculum_subjects(display_name,phase_code,subject_code,authority),curriculum_sources(authority,source_key,title,source_url,source_document_date,checksum,provenance,status)",
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
    return { today, academicYear: input.academicYear, allocations, versionsById, unitsByVersionId: {}, resourcesByVersionId: {} };
  }

  const unitsResult = await supabase
    .from("curriculum_units")
    .select(
      "id,curriculum_version_id,unit_code,theme,topic,sequence_number,assessment_guidance,practical_required",
    )
    .in("curriculum_version_id", readableVersionIds)
    .order("sequence_number")
    .order("unit_code");

  if (unitsResult.error) {
    throw new Error("Unable to load curriculum topics.");
  }

  const unitRows = (unitsResult.data ?? []) as unknown as UnitDbRow[];
  const unitIds = unitRows.map((row) => row.id);

  const [objectivesResult, competenciesResult, practicalsResult, resourceLinksResult] = await Promise.all([
    unitIds.length
      ? supabase
          .from("curriculum_objectives")
          .select("curriculum_unit_id,objective_code,objective_text,sequence_number")
          .in("curriculum_unit_id", unitIds)
          .order("sequence_number")
      : Promise.resolve({ data: [] as ObjectiveDbRow[], error: null }),
    unitIds.length
      ? supabase
          .from("curriculum_competencies")
          .select("curriculum_unit_id,competency_code,competency_text,sequence_number")
          .in("curriculum_unit_id", unitIds)
          .order("sequence_number")
      : Promise.resolve({ data: [] as CompetencyDbRow[], error: null }),
    unitIds.length
      ? supabase
          .from("curriculum_practicals")
          .select("curriculum_unit_id,practical_code,title,description,recommended_periods")
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
  ]);

  if (objectivesResult.error) throw new Error("Unable to load curriculum objectives.");
  if (competenciesResult.error) throw new Error("Unable to load curriculum competencies.");
  if (practicalsResult.error) throw new Error("Unable to load curriculum practicals.");
  if (resourceLinksResult.error) throw new Error("Unable to load official curriculum resources.");

  const objectivesByUnit = new Map<string, { code: string | null; text: string }[]>();
  for (const row of (objectivesResult.data ?? []) as unknown as ObjectiveDbRow[]) {
    objectivesByUnit.set(row.curriculum_unit_id, [
      ...(objectivesByUnit.get(row.curriculum_unit_id) ?? []),
      { code: row.objective_code, text: row.objective_text },
    ]);
  }

  const competenciesByUnit = new Map<string, { code: string | null; text: string }[]>();
  for (const row of (competenciesResult.data ?? []) as unknown as CompetencyDbRow[]) {
    competenciesByUnit.set(row.curriculum_unit_id, [
      ...(competenciesByUnit.get(row.curriculum_unit_id) ?? []),
      { code: row.competency_code, text: row.competency_text },
    ]);
  }

  const practicalsByUnit = new Map<string, CurriculumAccessUnit["practicals"]>();
  for (const row of (practicalsResult.data ?? []) as unknown as PracticalDbRow[]) {
    practicalsByUnit.set(row.curriculum_unit_id, [
      ...(practicalsByUnit.get(row.curriculum_unit_id) ?? []),
      {
        code: row.practical_code,
        title: row.title,
        description: row.description,
        recommendedPeriods: row.recommended_periods,
      },
    ]);
  }

  const resourcesByVersionId: Record<string, CurriculumAccessResource[]> = {};
  for (const row of (resourceLinksResult.data ?? []) as unknown as ResourceLinkDbRow[]) {
    const resource = one(row.official_education_resources);
    if (!resource || !row.curriculum_version_id) continue;
    const item: CurriculumAccessResource = {
      id: resource.id,
      curriculumVersionId: row.curriculum_version_id,
      relationshipType: row.relationship_type,
      authority: resource.authority,
      documentType: resource.document_type,
      title: resource.title,
      sourceUrl: resource.source_url,
      publicationLabel: resource.publication_label,
      publicationDate: resource.publication_date,
      languageCode: resource.language_code,
      status: resource.status,
    };
    resourcesByVersionId[row.curriculum_version_id] = [
      ...(resourcesByVersionId[row.curriculum_version_id] ?? []),
      item,
    ];
  }

  const unitsByVersionId: Record<string, CurriculumAccessUnit[]> = {};
  for (const row of unitRows) {
    const unit: CurriculumAccessUnit = {
      id: row.id,
      curriculumVersionId: row.curriculum_version_id,
      unitCode: row.unit_code,
      theme: row.theme,
      topic: row.topic,
      sequenceNumber: row.sequence_number,
      assessmentGuidance: row.assessment_guidance,
      practicalRequired: row.practical_required,
      objectives: objectivesByUnit.get(row.id) ?? [],
      competencies: competenciesByUnit.get(row.id) ?? [],
      practicals: practicalsByUnit.get(row.id) ?? [],
    };
    unitsByVersionId[row.curriculum_version_id] = [
      ...(unitsByVersionId[row.curriculum_version_id] ?? []),
      unit,
    ];
  }

  return { today, academicYear: input.academicYear, allocations, versionsById, unitsByVersionId, resourcesByVersionId };
}
