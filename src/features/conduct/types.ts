export type ConductDomain = "conduct" | "achievement";
export type ConductPolicyType = "recognition" | "violation";
export type ConductPolicyGroup = {
  id: string; type: ConductPolicyType; code: string; display_name: string;
  default_points: number | null; default_severity: string | null;
  sort_order: number; active: boolean;
};
export type ConductCategory = {
  id: string; group_id: string | null; domain: ConductDomain; direction: "positive" | "negative" | null;
  code: string; display_name: string; default_severity: string | null;
  points: number | null; requires_management_attention: boolean; sort_order: number; active: boolean;
};
export type ConductLearner = { learner_id: string; learner_name: string; class_id: string | null; class_name: string | null; grade_id: string | null; grade_name: string | null };
export type ConductEvent = {
  id: string; learner_id: string; learner_name: string; event_group_id: string | null;
  event_date: string; title: string; details: string | null; category_code: string;
  category_snapshot: { display_name: string; points?: number | null; group?: { display_name?: string; type?: ConductPolicyType } | null } | null; direction: string; severity: string | null; status: string | null; level: string | null;
};
export type ConductHistory = { events: ConductEvent[]; hasMore: boolean };
export type ConductActionState = { success?: boolean; message?: string };
export const conductRoles = ["school_admin", "principal", "deputy_principal", "hod", "teacher", "class_teacher", "counsellor"];
