import "server-only";

import type { TeachingFileAllocation } from "@/features/teaching/server/file-queries";
import {
  resolveOperationalFileTemplate,
  type OperationalFileTemplate,
  type OperationalFileTemplateItem,
} from "@/features/teaching/server/operational-file-templates";
import {
  resolveOperationalFileEvidenceBatch,
  type OperationalFileEvidenceResult,
} from "@/features/teaching/server/operational-file-resolvers";

export type OperationalTeachingFileItem = {
  id: string;
  itemKey: string;
  label: string;
  sequenceNumber: number;
  resolverType: OperationalFileTemplateItem["resolverType"];
  evidence: OperationalFileEvidenceResult;
};

export type OperationalTeachingFileSection = {
  id: string;
  sectionKey: string;
  title: string;
  sequenceNumber: number;
  items: OperationalTeachingFileItem[];
};

export type OperationalTeachingFileType = {
  id: string;
  fileTypeKey: OperationalFileTemplate["fileTypes"][number]["fileTypeKey"];
  displayName: string;
  sequenceNumber: number;
  sections: OperationalTeachingFileSection[];
};

export type OperationalTeachingFileAllocation = {
  allocationId: string;
  subjectName: string;
  gradeName: string;
  className: string | null;
  templateId: string;
  sourceTitle: string;
  authority: string;
  templateVersion: number;
  phaseLabel: string | null;
  fileTypes: OperationalTeachingFileType[];
};

export type OperationalTeachingFilesWorkspace = {
  allocations: OperationalTeachingFileAllocation[];
  unsupportedAllocations: Array<{
    allocationId: string;
    subjectName: string;
    gradeName: string;
    className: string | null;
    reason: string;
  }>;
};

function normalizeSubject(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function subjectKeyForAllocation(subjectName: string): string | null {
  const normalized = normalizeSubject(subjectName);
  return normalized === "information and communication" ? "information-communication" : null;
}

function gradeNumber(gradeName: string): number | null {
  const match = gradeName.match(/\b(\d{1,2})\b/);
  if (!match) return null;
  const grade = Number(match[1]);
  return Number.isInteger(grade) && grade >= 0 && grade <= 20 ? grade : null;
}

export async function getOperationalTeachingFilesWorkspace(input: {
  academicYear: number;
  effectiveOn: string;
  allocations: TeachingFileAllocation[];
}): Promise<OperationalTeachingFilesWorkspace> {
  const supported: Array<{
    allocation: TeachingFileAllocation;
    grade: number;
    template: OperationalFileTemplate;
  }> = [];
  const unsupportedAllocations: OperationalTeachingFilesWorkspace["unsupportedAllocations"] = [];

  for (const allocation of input.allocations) {
    const subjectKey = subjectKeyForAllocation(allocation.subjectName);
    const grade = gradeNumber(allocation.gradeName);

    if (!subjectKey || grade === null) {
      unsupportedAllocations.push({
        allocationId: allocation.allocationId,
        subjectName: allocation.subjectName,
        gradeName: allocation.gradeName,
        className: allocation.className,
        reason: "No authoritative operational-file template is mapped for this subject and grade.",
      });
      continue;
    }

    const template = await resolveOperationalFileTemplate({
      subjectKey,
      grade,
      effectiveOn: input.effectiveOn,
    });

    if (!template) {
      unsupportedAllocations.push({
        allocationId: allocation.allocationId,
        subjectName: allocation.subjectName,
        gradeName: allocation.gradeName,
        className: allocation.className,
        reason: "No effective authoritative operational-file template is available.",
      });
      continue;
    }

    supported.push({ allocation, grade, template });
  }

  const flatItems = supported.flatMap(({ template }) =>
    template.fileTypes.flatMap((fileType) =>
      fileType.sections.flatMap((section) => section.items),
    ),
  );
  const allocationIdsForItems = supported.flatMap(({ allocation, template }) =>\n    template.fileTypes.flatMap((fileType) =>\n      fileType.sections.flatMap((section) => section.items.map(() => allocation.allocationId)),\n    ),\n  );

  const evidence = flatItems.length
    ? await resolveOperationalFileEvidenceBatch({
        academicYear: input.academicYear,
        items: flatItems,
        allocationIds: allocationIdsForItems,
      })
    : [];

  let evidenceIndex = 0;
  const allocations = supported.map(({ allocation, grade, template }) => {
    const phase =
      template.phases.find(
        (candidate) =>
          (candidate.gradeFrom === null || grade >= candidate.gradeFrom) &&
          (candidate.gradeTo === null || grade <= candidate.gradeTo),
      ) ?? null;

    return {
      allocationId: allocation.allocationId,
      subjectName: allocation.subjectName,
      gradeName: allocation.gradeName,
      className: allocation.className,
      templateId: template.id,
      sourceTitle: template.sourceTitle,
      authority: template.authority,
      templateVersion: template.templateVersion,
      phaseLabel: phase?.phaseLabel ?? null,
      fileTypes: template.fileTypes.map((fileType) => ({
        id: fileType.id,
        fileTypeKey: fileType.fileTypeKey,
        displayName: fileType.displayName,
        sequenceNumber: fileType.sequenceNumber,
        sections: fileType.sections.map((section) => ({
          id: section.id,
          sectionKey: section.sectionKey,
          title: section.title,
          sequenceNumber: section.sequenceNumber,
          items: section.items.map((item) => {
            const itemEvidence = evidence[evidenceIndex++];
            return {
              id: item.id,
              itemKey: item.itemKey,
              label: item.label,
              sequenceNumber: item.sequenceNumber,
              resolverType: item.resolverType,
              evidence: itemEvidence ?? {
                resolverType: item.resolverType,
                status: "unavailable" as const,
                references: [],
                reason: "Evidence resolution did not return a result.",
              },
            };
          }),
        })),
      })),
    };
  });

  return { allocations, unsupportedAllocations };
}
