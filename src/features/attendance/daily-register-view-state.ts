import type { AttendanceLearnerRow, AttendanceSortDirection } from "@/features/attendance/server/register";

export type DailyRegisterSexFilter = "all" | "male" | "female";

const learnerNameCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export function getVisibleDailyRegisterRows(
  rows: AttendanceLearnerRow[],
  query: string,
  sexFilter: DailyRegisterSexFilter,
  sort: AttendanceSortDirection,
) {
  const needle = query.trim().toLowerCase();

  return rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .filter(({ row }) => {
      const searchMatch = !needle || `${row.name} ${row.admissionNumber ?? ""}`.toLowerCase().includes(needle);
      const sexMatch = sexFilter === "all" || (row.sex ?? "").toLowerCase() === sexFilter;
      return searchMatch && sexMatch;
    })
    .sort((left, right) => {
      const nameOrder = learnerNameCollator.compare(left.row.name, right.row.name);
      const admissionOrder = learnerNameCollator.compare(left.row.admissionNumber ?? "", right.row.admissionNumber ?? "");
      const order = nameOrder || admissionOrder;
      return order ? (sort === "desc" ? -order : order) : left.originalIndex - right.originalIndex;
    })
    .map(({ row }) => row);
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
