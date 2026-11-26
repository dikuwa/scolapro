import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RolloverBlocker = {
  code: string;
  configuration_kind: string;
  configuration_year: number;
  source_grade_id: string;
};

export type RolloverReadiness = {
  sourceGradeId: string;
  sourceGradeCode: string;
  sourceGradeName: string;
  nextAcademicYear: number;
  ready: boolean;
  nextGradeCount: number;
  nextRegisterClassCount: number;
  activeRuleSetLabel: string | null;
  blockers: RolloverBlocker[];
};

export async function getRolloverReadiness(schoolId: string, academicYear: number): Promise<RolloverReadiness[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_academic_rollover_readiness", {
    p_school_id: schoolId,
    p_academic_year: academicYear,
  });
  if (error) throw new Error("Unable to load academic rollover readiness.");
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    sourceGradeId: String(row.source_grade_id),
    sourceGradeCode: String(row.source_grade_code),
    sourceGradeName: String(row.source_grade_name),
    nextAcademicYear: Number(row.next_academic_year),
    ready: Boolean(row.ready),
    nextGradeCount: Number(row.next_grade_count ?? 0),
    nextRegisterClassCount: Number(row.next_register_class_count ?? 0),
    activeRuleSetLabel: row.active_rule_set_id ? `${String(row.active_rule_set_key)} v${String(row.active_rule_set_version)}` : null,
    blockers: Array.isArray(row.blockers) ? row.blockers.filter(Boolean) as RolloverBlocker[] : [],
  }));
}
