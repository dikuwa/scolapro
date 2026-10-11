import type { SchoolMembershipContext } from "@/lib/auth/get-user-context";

const ADMIN_CORRECTION_ROLES = new Set(["school_admin", "principal", "deputy_principal"]);
const STAFF_CAPTURE_ROLES = new Set(["hod", "teacher", "class_teacher"]);

export type AttendanceCaptureActor = {
  memberships: Pick<SchoolMembershipContext, "schoolId" | "roleKey" | "staffMemberId">[];
  platformRoles: string[];
};

export type RegisterCaptureScope = {
  schoolId: string;
  registerTeacherStaffId: string | null;
};

export type SubjectPeriodCaptureScope = {
  schoolId: string;
  allocatedStaffMemberId: string;
  allocationActiveFrom: string;
  allocationActiveTo: string | null;
  slotStatus: string;
  isTeachingPeriod: boolean;
};

function isPlatformSupport(actor: AttendanceCaptureActor) {
  return actor.platformRoles.includes("platform_support");
}

export function canCaptureRegisterClass(actor: AttendanceCaptureActor, scope: RegisterCaptureScope) {
  if (isPlatformSupport(actor)) return false;
  if (actor.platformRoles.includes("platform_admin")) return true;

  const schoolMemberships = actor.memberships.filter((item) => item.schoolId === scope.schoolId);
  if (schoolMemberships.some((item) => ADMIN_CORRECTION_ROLES.has(item.roleKey))) return true;

  return scope.registerTeacherStaffId !== null && schoolMemberships.some(
    (item) => STAFF_CAPTURE_ROLES.has(item.roleKey) && item.staffMemberId === scope.registerTeacherStaffId,
  );
}

export function canCaptureSubjectPeriod(
  actor: AttendanceCaptureActor,
  scope: SubjectPeriodCaptureScope,
  attendanceDate: string,
) {
  if (isPlatformSupport(actor) || scope.slotStatus !== "active" || !scope.isTeachingPeriod) return false;
  if (attendanceDate < scope.allocationActiveFrom) return false;
  if (scope.allocationActiveTo && attendanceDate > scope.allocationActiveTo) return false;
  if (actor.platformRoles.includes("platform_admin")) return true;

  const schoolMemberships = actor.memberships.filter((item) => item.schoolId === scope.schoolId);
  if (schoolMemberships.some((item) => ADMIN_CORRECTION_ROLES.has(item.roleKey))) return true;

  return schoolMemberships.some(
    (item) => STAFF_CAPTURE_ROLES.has(item.roleKey) && item.staffMemberId === scope.allocatedStaffMemberId,
  );
}
