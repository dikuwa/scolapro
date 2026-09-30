import "server-only";

import { getTeachingFilesHub } from "@/features/teaching/server/file-queries";
import {
  getOperationalFileSharedResourceReferences,
  type OperationalFileSharedResourceReference,
} from "@/features/teaching/server/operational-file-shared-resources";
import type {
  OperationalFileResolverType,
  OperationalFileTemplateItem,
} from "@/features/teaching/server/operational-file-templates";
import { getUserContext } from "@/lib/auth/get-user-context";

export type OperationalFileEvidenceStatus =
  | "resolved"
  | "missing"
  | "unavailable"
  | "manual"
  | "external";

export type OperationalFileEvidenceReference = {
  id: string;
  label: string;
  href: string | null;
  sourceModule: string;
  provenance: Record<string, unknown>;
};

export type OperationalFileEvidenceResult = {
  resolverType: OperationalFileResolverType;
  status: OperationalFileEvidenceStatus;
  references: OperationalFileEvidenceReference[];
  reason: string | null;
};

type ResolverItem = Pick<
  OperationalFileTemplateItem,
  "id" | "itemKey" | "label" | "resolverType" | "resolverMetadata"
>;

type ResolveInput = {
  academicYear: number;
  item: ResolverItem;
};

type ResolveBatchInput = {
  academicYear: number;
  items: ResolverItem[];
  allocationIds?: Array<string | undefined>;
};

type TeachingFilesHub = Awaited<ReturnType<typeof getTeachingFilesHub>>;

function resourceResult(
  resolverType: OperationalFileResolverType,
  sourceModule: string,
  href: string,
  label: string,
  provenance: Record<string, unknown> = {},
): OperationalFileEvidenceResult {
  return {
    resolverType,
    status: "resolved",
    references: [{ id: resolverType, label, href, sourceModule, provenance }],
    reason: null,
  };
}

function unavailable(
  resolverType: OperationalFileResolverType,
  reason: string,
): OperationalFileEvidenceResult {
  return { resolverType, status: "unavailable", references: [], reason };
}

function missing(
  resolverType: OperationalFileResolverType,
  reason: string,
): OperationalFileEvidenceResult {
  return { resolverType, status: "missing", references: [], reason };
}

function safeExternalHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!/^https:\/\//i.test(href)) return null;
  return href;
}

function resolveWithHub(input: {
  academicYear: number;
  item: ResolverItem;
  hub: TeachingFilesHub;
  ownerStaffMemberId: string | null;
  sharedResources: OperationalFileSharedResourceReference[];
  allocationId?: string;
}): OperationalFileEvidenceResult {
  const resourceById = new Map(input.hub.authoritativeResources.map((item) => [item.id, item]));
  const sharedResourceResult = (
    resolverType: "shared_resource" | "external_link" | "teacher_document",
  ): OperationalFileEvidenceResult | null => {
    if (!input.sharedResources.length) return null;

    const documentById = new Map<string, TeachingFilesHub["professionalDocuments"][number]>();
    for (const document of input.hub.professionalDocuments) {
      documentById.set(document.id, document);
    }
    const references = input.sharedResources.flatMap((shared) => {
      const ownedDocument = shared.teacherDocumentId
        ? documentById.get(shared.teacherDocumentId)
        : null;
      const href = shared.externalUrl ?? ownedDocument?.viewHref ?? null;
      if (!href) return [];
      return [{
        id: shared.id,
        label: shared.title,
        href,
        sourceModule:
          shared.scopeType === "national"
            ? "National resource"
            : shared.scopeType === "school"
              ? "School resource"
              : shared.scopeType === "subject_phase"
                ? "Subject resource"
                : "Teacher resource",
        provenance: {
          provider: shared.provider,
          authorityLabel: shared.authorityLabel,
          scopeType: shared.scopeType,
          visibility: shared.visibility,
          academicYear: shared.academicYear,
          effectiveFrom: shared.effectiveFrom,
          effectiveTo: shared.effectiveTo,
        },
      }];
    });

    if (!references.length) return null;
    return {
      resolverType,
      status: resolverType === "external_link" ? "external" : "resolved",
      references,
      reason: null,
    };
  };

  const resource = (
    key: string,
    resolverType: OperationalFileResolverType,
  ): OperationalFileEvidenceResult => {
    const found = resourceById.get(key);
    if (!found) return unavailable(resolverType, "Canonical source is not available for this actor.");
    if (found.availability !== "available") {
      return missing(resolverType, "No canonical evidence is available in the current teaching allocation.");
    }
    return resourceResult(
      resolverType,
      found.sourceModule,
      found.href,
      found.title,
      { authoritativeResourceId: found.id, academicYear: input.academicYear },
    );
  };

  switch (input.item.resolverType) {
    case "timetable":
      return resource("timetable", "timetable");

    case "curriculum": {
      const result = resource("syllabus", "curriculum");
      if (result.status !== "resolved" || !input.allocationId) return result;
      return { ...result, references: result.references.map((reference) => ({ ...reference, id: `${reference.id}:${input.allocationId}`, provenance: { ...reference.provenance, allocationId: input.allocationId } })) };
    }

    case "scheme": {
      const result = resource("scheme", "scheme");
      if (result.status !== "resolved" || !input.allocationId) return result;
      return { ...result, references: result.references.map((reference) => ({ ...reference, id: `${reference.id}:${input.allocationId}`, provenance: { ...reference.provenance, allocationId: input.allocationId } })) };
    }

    case "lesson_preparation": {
      const preparationRecords = input.allocationId
        ? input.hub.preparationRecords.filter((record) => record.allocationId === input.allocationId)
        : input.hub.preparationRecords;
      if (!preparationRecords.length) {
        return missing("lesson_preparation", "No canonical lesson preparation exists in the current teaching scope.");
      }
      return {
        resolverType: "lesson_preparation",
        status: "resolved",
        reason: null,
        references: preparationRecords.map((record) => ({
          id: record.id,
          label: `Lesson preparation · ${record.plannedOn}`,
          href: "/teaching/preparation",
          sourceModule: "Lesson preparation",
          provenance: {
            allocationId: record.allocationId,
            plannedOn: record.plannedOn,
            status: record.status,
            academicYear: input.academicYear,
          },
        })),
      };
    }

    case "class_list": {
      if (!input.hub.officialDocuments.length) {
        return missing("class_list", "No governed class list exists in the current teaching scope.");
      }
      return {
        resolverType: "class_list",
        status: "resolved",
        reason: null,
        references: input.hub.officialDocuments.map((document) => ({
          id: document.id,
          label: `${document.grade} · ${document.registerClass}`,
          href: document.pdfHref,
          sourceModule: "Class Lists",
          provenance: {
            academicYear: document.academicYear,
            subjectNames: document.subjectNames,
            printHref: document.printHref,
          },
        })),
      };
    }

    case "assessment":
      return resource("assessment", "assessment");

    case "calendar":
      return resource("calendar", "calendar");

    case "teacher_document": {
      const bound = sharedResourceResult("teacher_document");
      return bound ?? missing(
        "teacher_document",
        "No teacher-owned professional document is bound to this operational-file requirement.",
      );
    }

    case "external_link": {
      const shared = sharedResourceResult("external_link");
      if (shared) return shared;

      const href = safeExternalHref(input.item.resolverMetadata.href);
      if (!href) {
        return missing("external_link", "No governed external reference is recorded for this template item.");
      }
      return {
        resolverType: "external_link",
        status: "external",
        reason: null,
        references: [{
          id: input.item.itemKey,
          label: input.item.label,
          href,
          sourceModule: "External reference",
          provenance: { templateItemKey: input.item.itemKey },
        }],
      };
    }

    case "manual":
      return {
        resolverType: "manual",
        status: "manual",
        references: [],
        reason: "This requirement is intentionally manual and has no canonical resolver.",
      };

    case "shared_resource": {
      const shared = sharedResourceResult("shared_resource");
      return shared ?? missing(
        "shared_resource",
        "No applicable shared resource is recorded for this template item.",
      );
    }

    case "staff_profile":
    case "results":
    case "room_inventory":
      return unavailable(
        input.item.resolverType,
        "No canonical resolver is proven for this source yet; no evidence was inferred.",
      );
  }
}

export async function resolveOperationalFileEvidenceBatch(
  input: ResolveBatchInput,
): Promise<OperationalFileEvidenceResult[]> {
  if (!input.items.length) return [];

  const context = await getUserContext();
  if (!context.user || context.platformMemberships.length) {
    return input.items.map((item) => unavailable(item.resolverType, "School membership required."));
  }

  const membership = context.currentSchoolMembership;
  if (!membership) {
    return input.items.map((item) => unavailable(item.resolverType, "School membership required."));
  }

  const hub = await getTeachingFilesHub({
    schoolId: membership.schoolId,
    academicYear: input.academicYear,
    staffMemberId: membership.staffMemberId ?? null,
    canOpenLessonPreparations: ["teacher", "class_teacher"].includes(membership.roleKey),
  });
  const sharedResourcesByItem = await getOperationalFileSharedResourceReferences({
    templateItemIds: input.items.map((item) => item.id),
    academicYear: input.academicYear,
    effectiveOn: hub.today,
  });

  return input.items.map((item, index) =>
    resolveWithHub({
      academicYear: input.academicYear,
      item,
      hub,
      ownerStaffMemberId: membership.staffMemberId ?? null,
      sharedResources: sharedResourcesByItem.get(item.id) ?? [],
      allocationId: input.allocationIds?.[index],
    }),
  );
}

export async function resolveOperationalFileEvidence(
  input: ResolveInput,
): Promise<OperationalFileEvidenceResult> {
  const [result] = await resolveOperationalFileEvidenceBatch({
    academicYear: input.academicYear,
    items: [input.item],
  });
  return result;
}
