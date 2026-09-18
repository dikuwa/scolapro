import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaDateKey } from "@/lib/namibia-date";

// Read-only aggregation read model for the teacher professional-files hub.
//
// This module deliberately reuses existing canonical foundations and adds no
// new table, bucket, column, RPC or storage backend:
//   * allocation authority            -> public.teacher_allocations
//   * official document identity/print -> existing /api/official-documents/class-list
//   * teacher-owned planning records   -> public.lesson_preparations reached
//                                        through public.teaching_schedule_items
//
// Teacher ownership is enforced HERE, not merely hidden in the UI: the hub is
// resolved from the actor's own effective staff allocations, so a teacher can
// never enumerate another teacher's allocated classes or preparation records.
//
// Note on the layer below: public.teacher_allocations SELECT is intentionally
// school-scoped (app_private.has_school_access) because timetable, workload and
// statutory reporting legitimately read the allocation register. That policy is
// unchanged and is NOT widened by this module; the staff-member filter below is
// what narrows this hub to the signed-in teacher's own work.
//
// HOD/preparation review authority is deliberately NOT merged into this hub. It
// stays in the separate /teaching/reviews workspace.

/**
 * The official (Ministry/NIED) teacher-file taxonomy is not present in the
 * repository. Until verified authoritative source material exists, documents are
 * grouped by metadata that actually exists in the canonical model and anything
 * unclassified stays explicitly "Uncategorised" instead of inventing a required
 * table of contents. Only set this to true together with recorded source
 * material for the official taxonomy.
 */
export const OFFICIAL_TEACHER_FILE_TAXONOMY_SOURCED = false;

type PostgrestLike<T> = { data: T[] | null; error: { message: string } | null };

async function fetchRows<T>(
  builder: { then<U>(onFulfilled: (result: PostgrestLike<T>) => U): unknown } | null,
  message: string,
): Promise<T[]> {
  if (!builder) return [];
  const { data, error } = (await Promise.resolve(builder)) as PostgrestLike<T>;
  if (error) throw new Error(message);
  return data ?? [];
}

function one<T>(value: T[] | T | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function isEffectiveOn(date: string, startsOn: string | null, endsOn: string | null): boolean {
  return (!startsOn || startsOn <= date) && (!endsOn || endsOn >= date);
}

export type TeachingFileAllocation = {
  allocationId: string;
  className: string | null;
  gradeName: string;
  subjectName: string;
  activeFrom: string;
  activeTo: string | null;
};

/**
 * An official document the running foundation already produces for this
 * teacher's governed allocation. Nothing is generated or stored here: the hrefs
 * point at the existing official document endpoint, which performs its own
 * current-school authorization.
 */
export type TeachingFileOfficialDocument = {
  /** Stable dedupe key: the official class list is register-class scoped. */
  id: string;
  grade: string;
  registerClass: string;
  academicYear: number;
  /** Subjects this teacher is allocated for the same register class. */
  subjectNames: string[];
  /** Dedicated print-ready official document template (existing endpoint). */
  printHref: string;
  /** Official PDF produced by the same existing endpoint. */
  pdfHref: string;
};

/** A teacher-owned canonical teaching record — deliberately not a stored file. */
export type TeachingFilePreparationRecord = {
  id: string;
  allocationId: string;
  plannedOn: string;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
};

export type TeachingFilesHub = {
  today: string;
  academicYear: number;
  allocations: TeachingFileAllocation[];
  officialDocuments: TeachingFileOfficialDocument[];
  preparationRecords: TeachingFilePreparationRecord[];
};

function officialClassListHref(grade: string, registerClass: string, academicYear: number, format: "html" | "pdf"): string {
  const params = new URLSearchParams({ grade, class: registerClass, year: String(academicYear) });
  if (format === "pdf") params.set("format", "pdf");
  return `/api/official-documents/class-list?${params.toString()}`;
}

export async function getTeachingFilesHub(input: {
  schoolId: string;
  academicYear: number;
  /** The signed-in member's own staff identity; ownership boundary for this hub. */
  staffMemberId: string | null;
}): Promise<TeachingFilesHub> {
  const today = getNamibiaDateKey();
  const supabase = await createSupabaseServerClient();

  const base: TeachingFilesHub = {
    today,
    academicYear: input.academicYear,
    allocations: [],
    officialDocuments: [],
    preparationRecords: [],
  };

  // A membership without a governed staff identity owns no teaching allocation,
  // so the hub renders its honest empty state rather than a school-wide view.
  if (!input.staffMemberId) return base;

  const allocationRows = await fetchRows(
    supabase
      .from("teacher_allocations")
      .select(
        "id,subject_offering_id,register_class_id,active_from,active_to,subject_offerings(subject_id,curriculum_version_id,subjects(display_name),grades(display_name)),register_classes(display_name)",
      )
      .eq("school_id", input.schoolId)
      .eq("academic_year", input.academicYear)
      .eq("staff_member_id", input.staffMemberId)
      .order("active_from")
      .order("id"),
    "Unable to load your teaching allocations.",
  );

  const allocations: TeachingFileAllocation[] = [];
  const classKeyByAllocation = new Map<string, string>();
  const documentByClass = new Map<string, TeachingFileOfficialDocument>();

  for (const row of allocationRows) {
    if (!isEffectiveOn(today, row.active_from, row.active_to)) continue;

    const offering = one(row.subject_offerings);
    const registerClass = one(row.register_classes);
    const allocation: TeachingFileAllocation = {
      allocationId: row.id,
      className: registerClass?.display_name ?? null,
      gradeName: offering ? one(offering.grades)?.display_name ?? "Grade" : "Grade",
      subjectName: offering ? one(offering.subjects)?.display_name ?? "Subject" : "Subject",
      activeFrom: row.active_from,
      activeTo: row.active_to,
    };
    allocations.push(allocation);

    // The official class list is register-class scoped, so allocations that
    // share a grade/class share one document. Capture once -> use everywhere.
    if (!allocation.className || allocation.gradeName === "Grade") continue;
    const key = `${allocation.gradeName}::${allocation.className}`;
    classKeyByAllocation.set(allocation.allocationId, key);
    const existing = documentByClass.get(key);
    if (existing) {
      if (!existing.subjectNames.includes(allocation.subjectName)) existing.subjectNames.push(allocation.subjectName);
      continue;
    }
    documentByClass.set(key, {
      id: key,
      grade: allocation.gradeName,
      registerClass: allocation.className,
      academicYear: input.academicYear,
      subjectNames: [allocation.subjectName],
      printHref: officialClassListHref(allocation.gradeName, allocation.className, input.academicYear, "html"),
      pdfHref: officialClassListHref(allocation.gradeName, allocation.className, input.academicYear, "pdf"),
    });
  }

  const allocationIds = allocations.map((allocation) => allocation.allocationId);

  // Lesson preparations are reached through the canonical schedule chain; they
  // remain structured teaching records and are never presented as stored files.
  const scheduleRows = await fetchRows(
    allocationIds.length
      ? supabase
          .from("teaching_schedule_items")
          .select("id,teacher_allocation_id")
          .eq("school_id", input.schoolId)
          .eq("academic_year", input.academicYear)
          .in("teacher_allocation_id", allocationIds)
      : null,
    "Unable to load your scheduled lessons.",
  );

  const allocationBySchedule = new Map(scheduleRows.map((row) => [row.id, row.teacher_allocation_id]));
  const scheduleIds = scheduleRows.map((row) => row.id);

  const preparationRows = await fetchRows(
    scheduleIds.length
      ? supabase
          .from("lesson_preparations")
          .select("id,teaching_schedule_item_id,planned_on,status,submitted_at,reviewed_at,review_note")
          .in("teaching_schedule_item_id", scheduleIds)
          .order("planned_on")
          .order("id")
      : null,
    "Unable to load your lesson preparations.",
  );

  const preparationRecords: TeachingFilePreparationRecord[] = preparationRows.flatMap((row) => {
    const allocationId = allocationBySchedule.get(row.teaching_schedule_item_id);
    if (!allocationId) return [];
    return [
      {
        id: row.id,
        allocationId,
        plannedOn: row.planned_on,
        status: row.status,
        submittedAt: row.submitted_at,
        reviewedAt: row.reviewed_at,
        reviewNote: row.review_note,
      },
    ];
  });

  return {
    today,
    academicYear: input.academicYear,
    allocations,
    officialDocuments: [...documentByClass.values()].sort((a, b) =>
      `${a.grade} ${a.registerClass}`.localeCompare(`${b.grade} ${b.registerClass}`),
    ),
    preparationRecords,
  };
}
