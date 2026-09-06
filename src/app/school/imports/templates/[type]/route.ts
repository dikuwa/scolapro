import { getUserContext } from "@/lib/auth/get-user-context";
import { createCsvTemplate, importDefinitions, isImportTemplateType } from "@/features/imports/import-definitions";
import { createXlsxTemplate } from "@/features/imports/server/import-template-workbook";

export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const context = await getUserContext();
  const membership = context.memberships.find((item) => item.roleKey === "school_admin");
  if (!context.user || !membership) return new Response("School administrator access is required.", { status: 403 });

  const { type } = await params;
  if (!isImportTemplateType(type)) return new Response("Import template not found.", { status: 404 });

  const xlsx = new URL(request.url).searchParams.get("format") === "xlsx";
  const extension = xlsx ? "xlsx" : "csv";
  const filename = `${type.replaceAll("_", "-")}-import-template.${extension}`;
  const body = xlsx ? new Uint8Array(await createXlsxTemplate(type)) : createCsvTemplate(type);
  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-ScolaPro-Template": importDefinitions[type].label,
    },
  });
}
