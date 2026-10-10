import type { AttendanceLearnerRow, AttendanceSortDirection } from "@/features/attendance/server/register";

export type DailyRegisterSexFilter = "all" | "male" | "female";

const learnerNameCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

type SurnameSortableRow = { name: string; admissionNumber: string | null };

/**
 * Shared surname A–Z / Z–A ordering for register rosters.
 *
 * Daily and weekly registers use the same display name ("Surname GivenNames"),
 * so both views order by the same collator and fall back to the admission
 * number to keep duplicates stable. Rows that compare equal keep their original
 * server order. Pure view projection: callers keep their draft state untouched.
 */
export function sortRegisterRowsBySurname<T extends SurnameSortableRow>(
  rows: T[],
  sort: AttendanceSortDirection,
) {
  return rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => {
      const nameOrder = learnerNameCollator.compare(left.row.name, right.row.name);
      const admissionOrder = learnerNameCollator.compare(left.row.admissionNumber ?? "", right.row.admissionNumber ?? "");
      const order = nameOrder || admissionOrder;
      return order ? (sort === "desc" ? -order : order) : left.originalIndex - right.originalIndex;
    })
    .map(({ row }) => row);
}

export function getVisibleDailyRegisterRows(
  rows: AttendanceLearnerRow[],
  query: string,
  sexFilter: DailyRegisterSexFilter,
  sort: AttendanceSortDirection,
) {
  const needle = query.trim().toLowerCase();

  const visible = rows.filter((row) => {
    const searchMatch = !needle || (
      `${row.name} ${row.admissionNumber ?? ""}`.toLowerCase().includes(needle) ||
      `${row.nameAlternate} ${row.admissionNumber ?? ""}`.toLowerCase().includes(needle)
    );
    const sexMatch = sexFilter === "all" || (row.sex ?? "").toLowerCase() === sexFilter;
    return searchMatch && sexMatch;
  });

  return sortRegisterRowsBySurname(visible, sort);
}

export function getDailyRegisterExceptions(rows: AttendanceLearnerRow[]) {
  return rows
    .filter((row) => row.status !== "present")
    .map((row) => ({
      enrolment_id: row.enrolmentId,
      status: row.status as Exclude<AttendanceLearnerRow["status"], "present">,
      reason_id: row.reasonId,
      note: row.note,
    }));
}
