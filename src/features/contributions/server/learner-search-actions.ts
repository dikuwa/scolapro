"use server";

import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ContributionLearnerOption = {
  id: string;
  name: string;
  admissionNumber: string | null;
  grade: string;
  registerClass: string;
};

type ContributionLearnerRpcRow = {
  learner_id: string;
  learner_name: string;
  admission_number: string | null;
  grade_name: string;
  class_name: string;
};

const searchSchema = z.object({
  academicYear: z.number().int().min(2000).max(2200),
  query: z.string().trim().max(120),
});

export async function searchContributionLearners(
  academicYear: number,
  query: string,
): Promise<ContributionLearnerOption[]> {
  const parsed = searchSchema.safeParse({ academicYear, query });
  if (!parsed.success) return [];

  const context = await getUserContext();
  if (!context.user) return [];
  const membership = context.memberships[0];
  if (!membership || !["school_admin", "principal", "deputy_principal", "class_teacher"].includes(membership.roleKey)) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_contribution_eligible_learners", {
    p_school_id: membership.schoolId,
    p_academic_year: parsed.data.academicYear,
    p_query: parsed.data.query || null,
    p_limit: 20,
  });
  if (error) throw new Error(error.message || "Unable to search eligible learners.");

  return ((data ?? []) as ContributionLearnerRpcRow[]).map((row) => ({
    id: row.learner_id,
    name: row.learner_name,
    admissionNumber: row.admission_number,
    grade: row.grade_name,
    registerClass: row.class_name,
  }));
}