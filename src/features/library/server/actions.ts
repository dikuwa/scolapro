"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/get-user-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LibraryActionState = { success?: boolean; message?: string; count?: number };

const libraryRoles = new Set(["school_admin", "principal", "deputy_principal", "librarian", "ltsm"]);
const uuidOrEmpty = z.string().uuid().optional().or(z.literal(""));

const issueSchema = z.object({
  copyId: z.string().uuid(),
  borrowerType: z.enum(["learner", "staff"]),
  borrowerId: z.string().uuid(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
});

const returnSchema = z.object({
  loanId: z.string().uuid(),
  returnedCondition: z.enum(["new", "good", "fair", "poor", "damaged", "lost"]),
  notes: z.string().trim().max(500).optional(),
});

const titleSchema = z.object({
  schoolId: z.string().uuid(),
  titleId: uuidOrEmpty,
  resourceType: z.enum(["textbook", "library_book", "teacher_resource", "device", "other"]),
  title: z.string().trim().min(1).max(240),
  author: z.string().trim().max(180).optional(),
  publisher: z.string().trim().max(180).optional(),
  isbn: z.string().trim().max(40).optional(),
  subjectId: uuidOrEmpty,
  gradeId: uuidOrEmpty,
  edition: z.string().trim().max(80).optional(),
  category: z.string().trim().max(120).optional(),
  status: z.enum(["active", "inactive", "archived"]),
});

const copyBatchSchema = z.object({
  schoolId: z.string().uuid(),
  titleId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(500),
  barcodePrefix: z.string().trim().max(80).optional(),
  assetPrefix: z.string().trim().max(80).optional(),
  condition: z.enum(["new", "good", "fair", "poor", "damaged", "lost"]),
  availability: z.enum(["available", "reserved", "repair", "lost", "withdrawn"]),
  locationLabel: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(500).optional(),
});

const importTitleRowSchema = z.object({
  resource_type: z.enum(["textbook", "library_book", "teacher_resource", "device", "other"]),
  title: z.string().trim().min(1).max(240),
  author: z.string().trim().max(180).optional().nullable(),
  publisher: z.string().trim().max(180).optional().nullable(),
  isbn: z.string().trim().max(40).optional().nullable(),
  subject_id: uuidOrEmpty.nullable(),
  grade_id: uuidOrEmpty.nullable(),
  edition: z.string().trim().max(80).optional().nullable(),
  category: z.string().trim().max(120).optional().nullable(),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
});

const importCopyRowSchema = z.object({
  title_id: z.string().uuid(),
  barcode: z.string().trim().max(80).optional().nullable(),
  asset_number: z.string().trim().max(80).optional().nullable(),
  condition: z.enum(["new", "good", "fair", "poor", "damaged", "lost"]).default("good"),
  availability: z.enum(["available", "reserved", "repair", "lost", "withdrawn"]).default("available"),
  location_label: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const bulkIssueSchema = z.object({
  schoolId: z.string().uuid(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
  pairs: z.array(z.object({ copy_id: z.string().uuid(), learner_id: z.string().uuid() })).min(1).max(200),
});

const bulkReturnSchema = z.object({
  schoolId: z.string().uuid(),
  items: z.array(z.object({
    loan_id: z.string().uuid(),
    condition: z.enum(["new", "good", "fair", "poor", "damaged", "lost"]),
    notes: z.string().trim().max(500).optional().nullable(),
  })).min(1).max(200),
});

async function hasLibraryAccess(schoolId: string) {
  const context = await getUserContext();
  if (!context.user) return false;
  return context.memberships.some((membership) => membership.schoolId === schoolId && libraryRoles.has(membership.roleKey));
}

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function operationFailure(message: string): LibraryActionState {
  return { message };
}

export async function issueLibraryResource(_state: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const parsed = issueSchema.safeParse({
    copyId: value(formData, "copyId"),
    borrowerType: value(formData, "borrowerType"),
    borrowerId: value(formData, "borrowerId"),
    dueOn: value(formData, "dueOn"),
    notes: value(formData, "notes"),
  });
  if (!parsed.success) return operationFailure("Choose an available copy, borrower and valid due date.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("issue_learning_resource", {
    p_copy_id: parsed.data.copyId,
    p_learner_id: parsed.data.borrowerType === "learner" ? parsed.data.borrowerId : null,
    p_staff_member_id: parsed.data.borrowerType === "staff" ? parsed.data.borrowerId : null,
    p_due_on: parsed.data.dueOn || null,
    p_notes: parsed.data.notes || null,
  });
  if (error) return operationFailure("The resource could not be issued. Check that the copy and borrower are still eligible.");

  revalidatePath("/library");
  return { success: true, message: "Resource issued." };
}

export async function returnLibraryResource(_state: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const parsed = returnSchema.safeParse({
    loanId: value(formData, "loanId"),
    returnedCondition: value(formData, "returnedCondition"),
    notes: value(formData, "notes"),
  });
  if (!parsed.success) return operationFailure("Choose a valid return condition.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("return_learning_resource", {
    p_loan_id: parsed.data.loanId,
    p_returned_condition: parsed.data.returnedCondition,
    p_notes: parsed.data.notes || null,
  });
  if (error) return operationFailure("The resource could not be returned. Refresh the page and try again.");

  revalidatePath("/library");
  return {
    success: true,
    message: parsed.data.returnedCondition === "lost" ? "Resource marked lost." : parsed.data.returnedCondition === "damaged" ? "Damaged return recorded." : "Resource returned.",
  };
}

export async function saveLibraryTitle(_state: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const parsed = titleSchema.safeParse({
    schoolId: value(formData, "schoolId"),
    titleId: value(formData, "titleId"),
    resourceType: value(formData, "resourceType"),
    title: value(formData, "title"),
    author: value(formData, "author"),
    publisher: value(formData, "publisher"),
    isbn: value(formData, "isbn"),
    subjectId: value(formData, "subjectId"),
    gradeId: value(formData, "gradeId"),
    edition: value(formData, "edition"),
    category: value(formData, "category"),
    status: value(formData, "status"),
  });
  if (!parsed.success) return operationFailure("Check the title fields and try again.");
  if (!(await hasLibraryAccess(parsed.data.schoolId))) return operationFailure("You do not have permission to manage this school library.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_learning_resource_title", {
    p_school_id: parsed.data.schoolId,
    p_resource_type: parsed.data.resourceType,
    p_title: parsed.data.title,
    p_title_id: parsed.data.titleId || null,
    p_author: parsed.data.author || null,
    p_publisher: parsed.data.publisher || null,
    p_isbn: parsed.data.isbn || null,
    p_subject_id: parsed.data.subjectId || null,
    p_grade_id: parsed.data.gradeId || null,
    p_edition: parsed.data.edition || null,
    p_category: parsed.data.category || null,
    p_status: parsed.data.status,
  });
  if (error) return operationFailure(parsed.data.status === "archived" ? "The title could not be archived. Make sure it has no active loans." : "The catalog title could not be saved. Check its school subject, grade and status.");

  revalidatePath("/library");
  return { success: true, message: parsed.data.titleId ? "Catalog title updated." : "Catalog title created." };
}

export async function addLibraryCopies(_state: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const parsed = copyBatchSchema.safeParse({
    schoolId: value(formData, "schoolId"),
    titleId: value(formData, "titleId"),
    quantity: value(formData, "quantity"),
    barcodePrefix: value(formData, "barcodePrefix"),
    assetPrefix: value(formData, "assetPrefix"),
    condition: value(formData, "condition"),
    availability: value(formData, "availability"),
    locationLabel: value(formData, "locationLabel"),
    notes: value(formData, "notes"),
  });
  if (!parsed.success) return operationFailure("Check the copy batch fields and quantity.");
  if (!(await hasLibraryAccess(parsed.data.schoolId))) return operationFailure("You do not have permission to add stock for this school.");

  const copies = Array.from({ length: parsed.data.quantity }, (_, index) => {
    const suffix = parsed.data.quantity === 1 ? "" : `-${String(index + 1).padStart(3, "0")}`;
    return {
      barcode: parsed.data.barcodePrefix ? `${parsed.data.barcodePrefix}${suffix}` : null,
      asset_number: parsed.data.assetPrefix ? `${parsed.data.assetPrefix}${suffix}` : null,
      condition: parsed.data.condition,
      availability: parsed.data.availability,
      location_label: parsed.data.locationLabel || null,
      notes: parsed.data.notes || null,
    };
  });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_learning_resource_copies", { p_title_id: parsed.data.titleId, p_copies: copies });
  if (error) return operationFailure("Stock could not be added. Check for duplicate barcode or asset numbers and try again.");

  revalidatePath("/library");
  return { success: true, message: `${copies.length} ${copies.length === 1 ? "copy" : "copies"} added.`, count: copies.length };
}

export async function importLibraryTitles(_state: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const schoolId = value(formData, "schoolId");
  const rows = parseJson(value(formData, "rowsJson"));
  const parsedSchool = z.string().uuid().safeParse(schoolId);
  const parsedRows = z.array(importTitleRowSchema).min(1).max(500).safeParse(rows);
  if (!parsedSchool.success || !parsedRows.success) return operationFailure("The title import preview is invalid. Re-upload the template and review row errors.");
  if (!(await hasLibraryAccess(schoolId))) return operationFailure("You do not have permission to import this school catalog.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("bulk_save_learning_resource_titles", { p_school_id: schoolId, p_rows: parsedRows.data });
  if (error) return operationFailure("No catalog rows were imported. Resolve duplicate or invalid school subject/grade mappings and try again.");

  revalidatePath("/library");
  return { success: true, message: `${parsedRows.data.length} catalog ${parsedRows.data.length === 1 ? "row" : "rows"} imported.`, count: parsedRows.data.length };
}

export async function importLibraryCopies(_state: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const schoolId = value(formData, "schoolId");
  const rows = parseJson(value(formData, "rowsJson"));
  const parsedSchool = z.string().uuid().safeParse(schoolId);
  const parsedRows = z.array(importCopyRowSchema).min(1).max(1000).safeParse(rows);
  if (!parsedSchool.success || !parsedRows.success) return operationFailure("The stock import preview is invalid. Re-upload the template and review row errors.");
  if (!(await hasLibraryAccess(schoolId))) return operationFailure("You do not have permission to import stock for this school.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("bulk_add_learning_resource_copies", { p_school_id: schoolId, p_rows: parsedRows.data });
  if (error) return operationFailure("No stock rows were imported. Resolve duplicate barcode/asset numbers or invalid title mappings and try again.");

  revalidatePath("/library");
  return { success: true, message: `${parsedRows.data.length} stock ${parsedRows.data.length === 1 ? "row" : "rows"} imported.`, count: parsedRows.data.length };
}

export async function bulkIssueLibraryResources(_state: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const parsed = bulkIssueSchema.safeParse({
    schoolId: value(formData, "schoolId"),
    dueOn: value(formData, "dueOn"),
    notes: value(formData, "notes"),
    pairs: parseJson(value(formData, "pairsJson")),
  });
  if (!parsed.success) return operationFailure("The bulk issue preview is invalid. Refresh the class allocation and try again.");
  if (!(await hasLibraryAccess(parsed.data.schoolId))) return operationFailure("You do not have permission to issue resources for this school.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("bulk_issue_learning_resources", {
    p_pairs: parsed.data.pairs,
    p_due_on: parsed.data.dueOn || null,
    p_notes: parsed.data.notes || null,
  });
  if (error) return operationFailure("Nothing was issued. A copy or learner changed eligibility; refresh the preview and try again.");

  revalidatePath("/library");
  return { success: true, message: `${parsed.data.pairs.length} ${parsed.data.pairs.length === 1 ? "resource" : "resources"} issued.`, count: parsed.data.pairs.length };
}

export async function bulkReturnLibraryResources(_state: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const parsed = bulkReturnSchema.safeParse({
    schoolId: value(formData, "schoolId"),
    items: parseJson(value(formData, "itemsJson")),
  });
  if (!parsed.success) return operationFailure("The bulk return preview is invalid. Refresh active issues and try again.");
  if (!(await hasLibraryAccess(parsed.data.schoolId))) return operationFailure("You do not have permission to return resources for this school.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("bulk_return_learning_resources", { p_items: parsed.data.items });
  if (error) return operationFailure("Nothing was returned. An issue changed state; refresh the preview and try again.");

  revalidatePath("/library");
  return { success: true, message: `${parsed.data.items.length} ${parsed.data.items.length === 1 ? "resource" : "resources"} returned.`, count: parsed.data.items.length };
}
