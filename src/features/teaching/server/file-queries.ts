import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNamibiaDateKey } from "@/lib/namibia-date";

// Read-only aggregation read model for the teacher professional-files hub.
//
// This module deliberately reuses existing canonical foundations and reads the
// ONE teacher-owned professional-document model introduced by Issue #487:
//   * allocation authority             -> public.teacher_allocations
//   * official document identity/print -> existing /api/official-documents/class-list
//   * teacher-owned planning records   -> public.lesson_preparations reached
//                                         through public.teaching_schedule_items
//   * teacher-owned uploads            -> public.teacher_professional_documents
//
// Binary upload/download remains outside this read model and uses private signed
// storage access; the hub never creates a parallel storage subsystem.
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
  subjectId: string;
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

export type TeachingFileProfessionalDocument = {
  id: string;
  originalFilename: string;
  title: string | null;
  categoryLabel: string | null;
  mimeType: string;
  fileSize: number;
  status: "active" | "archived";
  createdAt: string;
  archivedAt: string | null;
  viewHref: string;
  downloadHref: string;
  reviewStatus: "submitted" | "returned" | "reviewed" | null;
  reviewSubjectId: string | null;
  reviewSubjectName: string | null;
  reviewNote: string | null;
};

export type TeachingFilesHub = {
  today: string;
  academicYear: number;
  allocations: TeachingFileAllocation[];
  officialDocuments: TeachingFileOfficialDocument[];
  preparationRecords: TeachingFilePreparationRecord[];
  professionalDocuments: TeachingFileProfessionalDocument[];
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
    professionalDocuments: [],
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
      subjectId: offering?.subject_id ?? "",
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

  const professionalRows = await fetchRows(
    supabase
      .from("teacher_professional_documents")
      .select("id,original_filename,title,category_label,mime_type,file_size,status,created_at,archived_at")
      .eq("school_id", input.schoolId)
      .eq("owner_staff_member_id", input.staffMemberId)
      .order("created_at", { ascending: false })
      .order("id"),
    "Unable to load your professional documents.",
  );

  const reviewRows = await fetchRows(
    supabase
      .from("teacher_professional_document_review_submissions")
      .select("document_id,subject_id,status,review_note,subjects(display_name)")
      .eq("school_id", input.schoolId)
      .eq("owner_staff_member_id", input.staffMemberId),
    "Unable to load professional document review state.",
  );
  const reviewByDocument = new Map(reviewRows.map((row) => [row.document_id, row]));

  const professionalDocuments: TeachingFileProfessionalDocument[] = professionalRows.map((row) => {
    const review = reviewByDocument.get(row.id);
    return {
      id: row.id,
      originalFilename: row.original_filename,
      title: row.title,
      categoryLabel: row.category_label,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      status: row.status === "archived" ? "archived" : "active",
      createdAt: row.created_at,
      archivedAt: row.archived_at,
      viewHref: `/api/teaching/files/${row.id}`,
      downloadHref: `/api/teaching/files/${row.id}?download=1`,
      reviewStatus: review?.status ?? null,
      reviewSubjectId: review?.subject_id ?? null,
      reviewSubjectName: review ? one(review.subjects)?.display_name ?? null : null,
      reviewNote: review?.review_note ?? null,
    };
  });

  return {
    today,
    academicYear: input.academicYear,
    allocations,
    officialDocuments: [...documentByClass.values()].sort((a, b) =>
      `${a.grade} ${a.registerClass}`.localeCompare(`${b.grade} ${b.registerClass}`),
    ),
    preparationRecords,
    professionalDocuments,
  };
}
