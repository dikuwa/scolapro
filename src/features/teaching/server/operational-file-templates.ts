import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const OPERATIONAL_FILE_TYPES = [
  "preparation",
  "administration",
  "resource",
  "subject",
  "question_paper",
] as const;

export const OPERATIONAL_FILE_RESOLVER_TYPES = [
  "timetable",
  "curriculum",
  "scheme",
  "lesson_preparation",
  "class_list",
  "assessment",
  "calendar",
  "staff_profile",
  "results",
  "room_inventory",
  "shared_resource",
  "teacher_document",
  "external_link",
  "manual",
] as const;

export type OperationalFileTypeKey = (typeof OPERATIONAL_FILE_TYPES)[number];
export type OperationalFileResolverType = (typeof OPERATIONAL_FILE_RESOLVER_TYPES)[number];

type Nested<T> = T[] | T | null | undefined;
function one<T>(value: Nested<T>): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

type TemplateItemRow = {
  id: string; item_key: string; label: string; sequence_number: number;
  resolver_type: OperationalFileResolverType;
  resolver_metadata: Record<string, unknown> | null;
  review_expectation: Record<string, unknown> | null;
};
type TemplateSectionRow = {
  id: string; section_key: string; title: string; sequence_number: number;
  items: TemplateItemRow[] | null;
};
type TemplateFileTypeRow = {
  id: string; file_type_key: OperationalFileTypeKey; display_name: string; sequence_number: number;
  review_expectation: Record<string, unknown> | null; metadata: Record<string, unknown> | null;
  sections: TemplateSectionRow[] | null;
};
type TemplateRow = {
  id: string; authority: string; source_key: string; source_title: string; template_version: number;
  effective_from: string; effective_to: string | null;
  subjects: Array<{ subject_key: string; subject_label: string }> | null;
  phases: Array<{ phase_key: string; phase_label: string; grade_from: number | null; grade_to: number | null }> | null;
  file_types: TemplateFileTypeRow[] | null;
};
type ResolvedTemplateRow = { template_id: string };

export type OperationalFileTemplateItem = {
  id: string; itemKey: string; label: string; sequenceNumber: number;
  resolverType: OperationalFileResolverType; resolverMetadata: Record<string, unknown>;
  reviewExpectation: Record<string, unknown>;
};
export type OperationalFileTemplateSection = {
  id: string; sectionKey: string; title: string; sequenceNumber: number; items: OperationalFileTemplateItem[];
};
export type OperationalFileTemplateFileType = {
  id: string; fileTypeKey: OperationalFileTypeKey; displayName: string; sequenceNumber: number;
  reviewExpectation: Record<string, unknown>; metadata: Record<string, unknown>;
  sections: OperationalFileTemplateSection[];
};
export type OperationalFileTemplate = {
  id: string; authority: string; sourceKey: string; sourceTitle: string; templateVersion: number;
  effectiveFrom: string; effectiveTo: string | null;
  subjects: Array<{ subjectKey: string; subjectLabel: string }>;
  phases: Array<{ phaseKey: string; phaseLabel: string; gradeFrom: number | null; gradeTo: number | null }>;
  fileTypes: OperationalFileTemplateFileType[];
};

function mapTemplate(row: TemplateRow): OperationalFileTemplate {
  const fileTypes = [...(row.file_types ?? [])]
    .sort((a, b) => a.sequence_number - b.sequence_number || a.id.localeCompare(b.id))
    .map((fileType) => ({
      id: fileType.id,
      fileTypeKey: fileType.file_type_key,
      displayName: fileType.display_name,
      sequenceNumber: fileType.sequence_number,
      reviewExpectation: fileType.review_expectation ?? {},
      metadata: fileType.metadata ?? {},
      sections: [...(fileType.sections ?? [])]
        .sort((a, b) => a.sequence_number - b.sequence_number || a.id.localeCompare(b.id))
        .map((section) => ({
          id: section.id,
          sectionKey: section.section_key,
          title: section.title,
          sequenceNumber: section.sequence_number,
          items: [...(section.items ?? [])]
            .sort((a, b) => a.sequence_number - b.sequence_number || a.id.localeCompare(b.id))
            .map((item) => ({
              id: item.id,
              itemKey: item.item_key,
              label: item.label,
              sequenceNumber: item.sequence_number,
              resolverType: item.resolver_type,
              resolverMetadata: item.resolver_metadata ?? {},
              reviewExpectation: item.review_expectation ?? {},
            })),
        })),
    }));

  return {
    id: row.id,
    authority: row.authority,
    sourceKey: row.source_key,
    sourceTitle: row.source_title,
    templateVersion: row.template_version,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    subjects: [...(row.subjects ?? [])]
      .map((subject) => ({ subjectKey: subject.subject_key, subjectLabel: subject.subject_label }))
      .sort((a, b) => a.subjectKey.localeCompare(b.subjectKey)),
    phases: [...(row.phases ?? [])]
      .map((phase) => ({
        phaseKey: phase.phase_key, phaseLabel: phase.phase_label,
        gradeFrom: phase.grade_from, gradeTo: phase.grade_to,
      }))
      .sort((a, b) => (a.gradeFrom ?? 0) - (b.gradeFrom ?? 0) || a.phaseKey.localeCompare(b.phaseKey)),
    fileTypes,
  };
}

async function loadTemplateById(templateId: string): Promise<OperationalFileTemplate | null> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("operational_file_templates")
    .select(`
      id,authority,source_key,source_title,template_version,effective_from,effective_to,
      subjects:operational_file_template_subjects(subject_key,subject_label),
      phases:operational_file_template_phases(phase_key,phase_label,grade_from,grade_to),
      file_types:operational_file_template_file_types(
        id,file_type_key,display_name,sequence_number,review_expectation,metadata,
        sections:operational_file_template_sections(
          id,section_key,title,sequence_number,
          items:operational_file_template_items(
            id,item_key,label,sequence_number,resolver_type,resolver_metadata,review_expectation
          )
        )
      )
    `)
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data) return null;
  return mapTemplate(data as unknown as TemplateRow);
}

export async function resolveOperationalFileTemplate(input: {
  subjectKey: string; grade: number; effectiveOn: string;
}): Promise<OperationalFileTemplate | null> {
  if (!Number.isInteger(input.grade)) throw new Error("Operational file template grade must be an integer.");
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("resolve_operational_file_template", {
    p_subject_key: input.subjectKey,
    p_grade: input.grade,
    p_effective_on: input.effectiveOn,
  });
  if (error) throw new Error("Unable to resolve operational file policy template.");
  const resolved = one(data as unknown as Nested<ResolvedTemplateRow>);
  if (!resolved?.template_id) return null;
  return loadTemplateById(resolved.template_id);
}

export async function getOperationalFileTemplateVersion(input: {
  sourceKey: string; templateVersion: number;
}): Promise<OperationalFileTemplate | null> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("get_operational_file_template_version", {
    p_source_key: input.sourceKey,
    p_template_version: input.templateVersion,
  });
  if (error) throw new Error("Unable to load operational file policy template version.");
  const resolved = one(data as unknown as Nested<ResolvedTemplateRow>);
  if (!resolved?.template_id) return null;
  return loadTemplateById(resolved.template_id);
}
