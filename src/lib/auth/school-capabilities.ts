/** Effective school authorization is additive across active memberships, never derived from a display role. */
export function hasAnySchoolRole(
  memberships: ReadonlyArray<{ schoolId: string; roleKey: string }>,
  schoolId: string,
  allowedRoles: ReadonlySet<string>,
): boolean {
  return memberships.some((membership) => membership.schoolId === schoolId && allowedRoles.has(membership.roleKey));
}

export const schoolLeadershipRoles = new Set(["school_admin", "principal", "deputy_principal"]);
