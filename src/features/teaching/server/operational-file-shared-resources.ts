import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OperationalFileSharedResourceReference = {
  id: string;
  templateItemId: string;
  scopeType: "national" | "school" | "subject_phase" | "teacher";
  visibility: "platform" | "school" | "subject" | "private";
  title: string;
  description: string | null;
  provider: string;
  authorityLabel: string;
  externalUrl: string | null;
  teacherDocumentId: string | null;
  academicYear: number | null;
  gradeFrom: number | null;
  gradeTo: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

type ResourceRow = {
  template_item_id: string;
  resource:
    | {
        id: string;
        scope_type: OperationalFileSharedResourceReference["scopeType"];
        visibility: OperationalFileSharedResourceReference["visibility"];
        title: string;
        description: string | null;
        provider: string;
        authority_label: string;
        external_url: string | null;
        teacher_document_id: string | null;
        academic_year: number | null;
        grade_from: number | null;
        grade_to: number | null;
        effective_from: string | null;
        effective_to: string | null;
        status: "active" | "archived";
      }
    | Array<{
        id: string;
        scope_type: OperationalFileSharedResourceReference["scopeType"];
        visibility: OperationalFileSharedResourceReference["visibility"];
        title: string;
        description: string | null;
        provider: string;
        authority_label: string;
        external_url: string | null;
        teacher_document_id: string | null;
        academic_year: number | null;
        grade_from: number | null;
        grade_to: number | null;
        effective_from: string | null;
        effective_to: string | null;
        status: "active" | "archived";
      }>
    | null;
};

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function effectiveOn(
  date: string,
  startsOn: string | null,
  endsOn: string | null,
): boolean {
  return (!startsOn || startsOn <= date) && (!endsOn || endsOn >= date);
}

export async function getOperationalFileSharedResourceReferences(input: {
  templateItemIds: string[];
  academicYear: number;
  effectiveOn: string;
  grade?: number | null;
}): Promise<Map<string, OperationalFileSharedResourceReference[]>> {
  const ids = [...new Set(input.templateItemIds)].filter(Boolean);
  if (!ids.length) return new Map();

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("operational_file_resource_bindings")
    .select(
      "template_item_id,resource:operational_file_resources(id,scope_type,visibility,title,description,provider,authority_label,external_url,teacher_document_id,academic_year,grade_from,grade_to,effective_from,effective_to,status)",
    )
    .in("template_item_id", ids);

  if (error) throw new Error("Unable to load operational-file shared resources.");

  const result = new Map<string, OperationalFileSharedResourceReference[]>();
  for (const row of (data ?? []) as unknown as ResourceRow[]) {
    const resource = one(row.resource);
    if (!resource || resource.status !== "active") continue;
    if (resource.academic_year !== null && resource.academic_year !== input.academicYear) continue;
    if (!effectiveOn(input.effectiveOn, resource.effective_from, resource.effective_to)) continue;
    if (
      input.grade !== null &&
      input.grade !== undefined &&
      ((resource.grade_from !== null && input.grade < resource.grade_from) ||
        (resource.grade_to !== null && input.grade > resource.grade_to))
    ) {
      continue;
    }

    const mapped: OperationalFileSharedResourceReference = {
      id: resource.id,
      templateItemId: row.template_item_id,
      scopeType: resource.scope_type,
      visibility: resource.visibility,
      title: resource.title,
      description: resource.description,
      provider: resource.provider,
      authorityLabel: resource.authority_label,
      externalUrl: resource.external_url,
      teacherDocumentId: resource.teacher_document_id,
      academicYear: resource.academic_year,
      gradeFrom: resource.grade_from,
      gradeTo: resource.grade_to,
      effectiveFrom: resource.effective_from,
      effectiveTo: resource.effective_to,
    };
    result.set(row.template_item_id, [...(result.get(row.template_item_id) ?? []), mapped]);
  }

  for (const [key, values] of result) {
    values.sort((a, b) =>
      [a.scopeType, a.authorityLabel, a.provider, a.title, a.id]
        .join("::")
        .localeCompare([b.scopeType, b.authorityLabel, b.provider, b.title, b.id].join("::")),
    );
    result.set(key, values);
  }

  return result;
}
