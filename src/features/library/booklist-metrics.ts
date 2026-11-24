export type BooklistRequirement = {
  id: string;
  gradeId: string;
  titleId: string;
  copiesPerLearner: number;
  status: "active" | "inactive";
};

export type BooklistStock = { id: string; titleId: string; availability: string; condition: string };
export type BooklistLoan = { copyId: string; borrowerId: string; borrowerType: "learner" | "staff"; status: string };

/** Preview demand for one grade without assigning school-wide shared stock twice within a title. */
export function deriveGradeBooklistDemand(
  requirements: BooklistRequirement[],
  learnerIds: readonly string[],
  copies: readonly BooklistStock[],
  loans: readonly BooklistLoan[],
) {
  const learners = new Set(learnerIds);
  const activeLoans = loans.filter((loan) => (loan.status === "open" || loan.status === "overdue") && loan.borrowerType === "learner" && learners.has(loan.borrowerId));
  const byCopyId = new Map(copies.map((copy) => [copy.id, copy]));
  return requirements.filter((requirement) => requirement.status === "active").map((requirement) => {
    const required = learners.size * requirement.copiesPerLearner;
    const allocated = activeLoans.filter((loan) => byCopyId.get(loan.copyId)?.titleId === requirement.titleId).length;
    const available = copies.filter((copy) => copy.titleId === requirement.titleId && copy.availability === "available" && copy.condition !== "lost" && copy.condition !== "damaged").length;
    const unallocated = Math.max(0, required - allocated);
    return {
      ...requirement,
      learners: learners.size,
      required,
      allocated,
      available,
      unallocated,
      potentialShortage: Math.max(0, unallocated - available),
    };
  });
}
