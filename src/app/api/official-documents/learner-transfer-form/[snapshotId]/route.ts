import { Buffer } from "node:buffer";
import {
  parseFinalizedLearnerTransferForm,
  renderOfficialLearnerTransferFormHtml,
  renderOfficialLearnerTransferFormPdf,
} from "@/features/transfers/server/render-learner-transfer-form";
import { getLearnerTransferFormRenderSnapshot } from "@/features/transfers/server/transfer-form";
import { getUserContext } from "@/lib/auth/get-user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilePart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "learner-transfer-form";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ snapshotId: string }> },
) {
  const context = await getUserContext();
  if (!context.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { snapshotId } = await params;
  const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "html";

  try {
    const snapshot = await getLearnerTransferFormRenderSnapshot(snapshotId);
    const form = parseFinalizedLearnerTransferForm(snapshot.dataSnapshot);
    const input = { form, reference: snapshot.scolaproReference, verificationPath: snapshot.verificationPath };
    const fileBase = `${safeFilePart(form.source.learnerName)}-transfer-form-r${snapshot.revision}`;

    if (format === "pdf") {
      const rendered = await renderOfficialLearnerTransferFormPdf(input);
      return new Response(Buffer.from(rendered.bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "X-ScolaPro-Page-Count": String(rendered.pageCount),
        },
      });
    }

    return new Response(renderOfficialLearnerTransferFormHtml(input), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${fileBase}.html"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/permission|authority|scope/i.test(message)) {
      return Response.json({ error: "This finalized transfer form is outside your current authority." }, { status: 403 });
    }
    console.error("official learner transfer-form export failed", { message });
    return Response.json({ error: "Unable to generate the learner transfer form." }, { status: 500 });
  }
}