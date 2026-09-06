import "server-only";

import { listLearnerDirectoryPage, type LearnerListItem } from "@/features/learners/server/queries";

const CLASS_LIST_PAGE_SIZE = 100;
const MAX_CLASS_LIST_PAGES = 20;

export type OfficialClassListRoster = {
  grade: string;
  registerClass: string;
  learners: LearnerListItem[];
};

/**
 * Resolves a complete current class roster through the existing paged learner
 * directory boundary. A class is mandatory so an official export can never
 * accidentally turn into an unbounded whole-school learner dump.
 */
export async function getOfficialClassListRoster(
  schoolId: string,
  academicYear: number,
  grade: string,
  registerClass: string,
): Promise<OfficialClassListRoster> {
  const normalizedGrade = grade.trim();
  const normalizedClass = registerClass.trim();
  if (!normalizedGrade || !normalizedClass || normalizedGrade === "all" || normalizedClass === "all") {
    throw new Error("A specific grade and register class are required for an official class list.");
  }

  const learners: LearnerListItem[] = [];
  let page = 1;
  let pageCount = 1;

  do {
    const result = await listLearnerDirectoryPage(schoolId, academicYear, {
      status: "current",
      grade: normalizedGrade,
      registerClass: normalizedClass,
      sortOrder: "asc",
      page,
      pageSize: CLASS_LIST_PAGE_SIZE,
    });
    learners.push(...result.learners);
    pageCount = result.pageCount;
    page += 1;

    if (page > MAX_CLASS_LIST_PAGES + 1 && page <= pageCount) {
      throw new Error("This class list exceeds the supported official export size.");
    }
  } while (page <= pageCount);

  return {
    grade: normalizedGrade,
    registerClass: normalizedClass,
    learners,
  };
}
