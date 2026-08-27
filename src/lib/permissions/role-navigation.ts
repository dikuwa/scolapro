export type SchoolRoleKey =
  | "school_admin"
  | "principal"
  | "deputy_principal"
  | "hod"
  | "teacher"
  | "class_teacher"
  | "counsellor"
  | "librarian"
  | "learner"
  | "parent"
  | "board_member";

export type NavigationItemKey =
  | "today"
  | "learners"
  | "teaching"
  | "assessment"
  | "attendance"
  | "department"
  | "reports"
  | "timetable"
  | "ltsm"
  | "support"
  | "communications"
  | "school-setup"
  | "statutory"
  | "settings";

const roleNavigation: Record<SchoolRoleKey, readonly NavigationItemKey[]> = {
  school_admin: [
    "today",
    "learners",
    "attendance",
    "assessment",
    "timetable",
    "ltsm",
    "communications",
    "reports",
    "statutory",
    "school-setup",
    "settings",
  ],
  principal: [
    "today",
    "learners",
    "attendance",
    "assessment",
    "timetable",
    "support",
    "communications",
    "reports",
    "statutory",
  ],
  deputy_principal: ["today", "learners", "attendance", "assessment", "timetable", "support", "reports"],
  hod: ["today", "department", "teaching", "assessment", "attendance", "reports"],
  teacher: ["today", "learners", "teaching", "assessment", "attendance", "reports"],
  class_teacher: ["today", "learners", "teaching", "assessment", "attendance", "support", "reports"],
  counsellor: ["today", "learners", "support", "communications", "reports"],
  librarian: ["today", "learners", "ltsm", "reports"],
  learner: ["today", "teaching", "assessment", "attendance", "timetable"],
  parent: ["today", "learners", "assessment", "attendance", "communications"],
  board_member: ["today", "reports"],
};

export function getNavigationForRole(role: string): readonly NavigationItemKey[] {
  if (role in roleNavigation) {
    return roleNavigation[role as SchoolRoleKey];
  }

  return ["today"];
}
