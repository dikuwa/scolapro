import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ConductCategory, ConductDomain, ConductHistory, ConductLearner } from "../types";

export async function getConductCategories(schoolId: string): Promise<ConductCategory[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("conduct_policy_categories").select("id,domain,direction,code,display_name,default_severity,points,sort_order,active").eq("school_id", schoolId).order("sort_order").order("display_name");
  if (error) throw new Error("Unable to load conduct policy categories.");
  return data ?? [];
}
async function getRoster(schoolId: string, on: string): Promise<ConductLearner[]> {
  const db = await createSupabaseServerClient();
  const rows: ConductLearner[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await db.rpc("list_conduct_learners", { p_school_id: schoolId, p_on: on }).range(offset, offset + 499);
    if (result.error) throw new Error("Unable to load the conduct roster.");
    const page = (result.data ?? []) as ConductLearner[];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export async function getConductWorkspace(schoolId: string, on: string, domain: ConductDomain, learnerId: string | null, classId: string | null, gradeId: string | null, page: number) {
  const db = await createSupabaseServerClient();
  const [categories, roster, history] = await Promise.all([
    getConductCategories(schoolId),
    getRoster(schoolId, on),
    db.rpc("list_conduct_history", { p_school_id: schoolId, p_domain: domain, p_learner_id: learnerId, p_class_id: classId, p_grade_id: gradeId, p_page: page }),
  ]);
  if (history.error) throw new Error("Unable to load conduct history.");
  return { categories, learners: roster, history: history.data as ConductHistory };
}
