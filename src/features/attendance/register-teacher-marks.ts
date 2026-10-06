export type RegisterTeacherMarkStatus = "present" | "absent" | "inactive";

export const REGISTER_TEACHER_PRESENT_MARK = "I";
export const REGISTER_TEACHER_ABSENT_MARK = "a";

/**
 * Physical-register convention: attendance marks are italic sans-serif glyphs.
 * The present mark is deliberately a plain italic I with no serifs.
 */
export const REGISTER_TEACHER_MARK_CLASS =
  "font-sans italic font-medium tabular-nums";

export function registerTeacherMark(status: RegisterTeacherMarkStatus): string {
  if (status === "present") return REGISTER_TEACHER_PRESENT_MARK;
  if (status === "absent") return REGISTER_TEACHER_ABSENT_MARK;
  return "";
}
