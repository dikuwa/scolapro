import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TeachingGroup = {
  id: string;
  tenantId: string;
  schoolId: string;
  academicYear: number;
  subjectOfferingId: string;
  code: string;
  name: string;
  status: "active" | "inactive";
  effectiveFrom: string;
  effectiveTo: string | null;
  learnerCount: number;
};

export type TeachingGroupMember = {
  teachingGroupId: string;
  enrolmentId: string;
  learnerId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string;
};

export async function resolveTeachingGroups(input: { schoolId: string; academicYear: number; subjectOfferingId?: string | null }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_teaching_groups", {
    p_school_id: input.schoolId,
    p_academic_year: input.academicYear,
    p_subject_offering_id: input.subjectOfferingId ?? null,
  });
  if (error) throw new Error("Unable to load teaching groups.");
  return ((data ?? []) as Array<Record<string, unknown>>).map((row): TeachingGroup => ({
    id: String(row.id), tenantId: String(row.tenant_id), schoolId: String(row.school_id), academicYear: Number(row.academic_year),
    subjectOfferingId: String(row.subject_offering_id), code: String(row.code), name: String(row.name), status: row.status === "inactive" ? "inactive" : "active",
    effectiveFrom: String(row.effective_from), effectiveTo: row.effective_to ? String(row.effective_to) : null, learnerCount: Number(row.learner_count ?? 0),
  }));
}

export async function resolveTeachingGroupMembers(teachingGroupId: string, referenceDate?: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_teaching_group_members", { p_teaching_group_id: teachingGroupId, p_reference_date: referenceDate ?? null });
  if (error) throw new Error("Unable to load teaching group members.");
  return ((data ?? []) as Array<Record<string, unknown>>).map((row): TeachingGroupMember => ({
    teachingGroupId: String(row.teaching_group_id), enrolmentId: String(row.enrolment_id), learnerId: String(row.learner_id),
    effectiveFrom: String(row.effective_from), effectiveTo: row.effective_to ? String(row.effective_to) : null, source: String(row.source),
  }));
}
