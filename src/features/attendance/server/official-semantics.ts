export type OfficialAttendanceStatus = "present" | "absent";

export type OperationalAttendanceStatus =
  | OfficialAttendanceStatus
  | "late"
  | "excused"
  | "unknown";

/**
 * Projects an operational observation onto the official daily-register
 * vocabulary (Present/Absent only).
 *
 * - `late` is a school-level late arrival, not a full-day absence, so it stays
 *   present officially while its operational record remains separate.
 * - `excused` is a justified full-day absence. It is never promoted to present:
 *   the justification is carried by the reason/evidence attached to the
 *   absence, so the absence itself still counts.
 * - `unknown` cannot be classified and is excluded from both official states.
 */
export function officialCaptureStatusOf(
  status: OperationalAttendanceStatus | string | null | undefined,
): OfficialAttendanceStatus | null {
  if (status === "absent" || status === "excused") return "absent";
  if (status === "present" || status === "late") return "present";
  return null;
}

export function isOfficiallyPresent(
  status: OperationalAttendanceStatus | string | null | undefined,
) {
  return officialCaptureStatusOf(status) === "present";
}

export function isOfficiallyAbsent(
  status: OperationalAttendanceStatus | string | null | undefined,
) {
  return officialCaptureStatusOf(status) === "absent";
}
