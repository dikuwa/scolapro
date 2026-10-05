import "server-only";

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  OFFICIAL_DOCUMENT_HTML_HEADER_RULE,
  OFFICIAL_DOCUMENT_PDF_GEOMETRY,
} from "@/features/documents/server/official-document-chrome";
import {
  buildOfficialDocumentHeaderModel,
  officialDocumentHeaderModeForType,
  type OfficialDocumentHeaderModel,
} from "@/features/documents/server/official-document-header";
import {
  escapeOfficialDocumentHtml,
  renderOfficialDocumentHtmlHeader,
} from "@/features/documents/server/official-document-html-header";
import {
  createOfficialDocumentPdfResources,
  drawOfficialDocumentPdfHeader,
  officialDocumentPdfSafeText,
} from "@/features/documents/server/official-document-pdf-header";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function text(value: unknown): string { return value == null ? "" : String(value).trim(); }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

export const TRANSFER_FORM_TEMPLATE_CONTRACT = "namibia-prescribed-transfer-form";
export const TRANSFER_FORM_TEMPLATE_VERSION = "1993-source-7-1-0093";

export const TRANSFER_FORM_INSTRUCTIONS = [
  "When a learner transfers to another school, the principal of the former school must complete this form in triplicate and hand the original to the learner or his parents for presentation at the new school.",
  "Whenever a new learner fails to present the transfer form, the principal of the new school must apply for it in writing from the former school. On receiving this request the first copy must be forwarded.",
  "Transfer forms must be mailed to the new school by certified post in the event of an application in writing (mentioned in paragraph 1(b)).",
  "The form should be completed in clear, legible writing and must be issued without any changes.",
] as const;

export type FinalizedLearnerTransferForm = {
  source: {
    learnerName: string;
    dateOfBirth: string;
    academicYear: number;
    presentGrade: string;
    lastGradePassed: string;
    subjects: string[];
    schoolName: string;
    schoolEmisNumber: string;
    schoolTown: string;
    newSchool: string;
    newSchoolAddress: string;
    departureDate: string;
  };
  verified: {
    reasonForDeparture: string;
    mediumOfInstruction: string;
    documentsAttached: string;
    behaviour: string;
    stateOfHealth: string;
    otherRelevantInformation: string;
    verificationNote: string;
  };
  header: OfficialDocumentHeaderModel;
  finalizedAt: string;
};

export function parseFinalizedLearnerTransferForm(value: unknown): FinalizedLearnerTransferForm {
  const root = record(value);
  if (text(root.documentType) !== "learner_transfer_form" || text(root.templateContract) !== TRANSFER_FORM_TEMPLATE_CONTRACT) {
    throw new Error("Stored learner transfer-form snapshot has an unsupported template contract.");
  }
  const source = record(root.source);
  const school = record(source.school);
  const verified = record(root.verifiedFields);
  const headerRaw = record(root.header);
  const header = buildOfficialDocumentHeaderModel({
    schoolName: text(headerRaw.schoolName) || text(school.schoolName),
    schoolEmisNumber: text(headerRaw.schoolEmisNumber) || text(school.emisNumber),
    formerName: text(headerRaw.formerName),
    logoUrl: text(headerRaw.logoUrl),
    logoStoragePath: text(headerRaw.logoStoragePath),
    physicalAddress: text(headerRaw.physicalAddress),
    telephone: text(headerRaw.telephone),
    fax: text(headerRaw.fax),
    email: text(headerRaw.email),
    postalAddress: text(headerRaw.postalAddress),
    town: text(headerRaw.town) || text(school.town),
    schoolNameFont: text(headerRaw.schoolNameFont) === "old_english" ? "old_english" : "default",
  }, { mode: officialDocumentHeaderModeForType("learner_transfer_form"), provenanceSource: "frozen_snapshot" });

  return {
    source: {
      learnerName: text(source.learnerName),
      dateOfBirth: text(source.dateOfBirth),
      academicYear: Number(source.academicYear ?? 0),
      presentGrade: text(source.presentGrade),
      lastGradePassed: text(source.lastGradePassed),
      subjects: array(source.subjects).map((item) => text(record(item).subjectName)).filter(Boolean),
      schoolName: text(school.schoolName),
      schoolEmisNumber: text(school.emisNumber),
      schoolTown: text(school.town),
      newSchool: text(source.newSchool),
      newSchoolAddress: text(source.newSchoolAddress),
      departureDate: text(source.departureDate),
    },
    verified: {
      reasonForDeparture: text(verified.reasonForDeparture),
      mediumOfInstruction: text(verified.mediumOfInstruction),
      documentsAttached: text(verified.documentsAttached),
      behaviour: text(verified.behaviour),
      stateOfHealth: text(verified.stateOfHealth),
      otherRelevantInformation: text(verified.otherRelevantInformation),
      verificationNote: text(verified.verificationNote),
    },
    header,
    finalizedAt: text(root.finalizedAt),
  };
}

function date(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00+02:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-NA", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Windhoek" }).format(parsed);
}

function htmlLine(label: string, value: string, extraClass = "") {
  return `<div class="field ${extraClass}"><span class="label">${escapeOfficialDocumentHtml(label)}</span><span class="dots"><span>${escapeOfficialDocumentHtml(value)}</span></span></div>`;
}

function documentItems(value: string) {
  return value.split(" · ").map((item) => item.trim()).filter(Boolean);
}

function htmlChecklist(value: string) {
  const selected = new Set(documentItems(value));
  const canonical = [
    "Birth certificate",
    "Latest report card",
    "Previous report card(s)",
    "Certified ID / passport copy",
    "CRC / cumulative record package",
  ];
  const other = [...selected].find((item) => item.startsWith("Other:"));
  return `<div class="checklist">${canonical.map((label) => `<div class="check"><span class="box">${selected.has(label) ? "✓" : ""}</span><span>${escapeOfficialDocumentHtml(label)}</span></div>`).join("")}${other ? `<div class="check other"><span class="box">✓</span><span>${escapeOfficialDocumentHtml(other)}</span></div>` : ""}</div>`;
}

export function renderOfficialLearnerTransferFormHtml(input: {
  form: FinalizedLearnerTransferForm;
  reference: string;
  verificationPath: string;
}): string {
  const f = input.form;
  const subjects = f.source.subjects.join(", ");
  const destination = [f.source.newSchool, f.source.newSchoolAddress].filter(Boolean).join(" · ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Learner Transfer Form - ${escapeOfficialDocumentHtml(f.source.learnerName)}</title>
<style>
@page{size:A4;margin:10mm 12mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif;font-size:9.4pt;line-height:1.2}${OFFICIAL_DOCUMENT_HTML_HEADER_RULE}
.page{min-height:277mm;position:relative}.report{border:0;padding:0;min-height:277mm}.code{position:absolute;right:0;top:88px;font-size:7pt;font-weight:700}.document-title{text-align:center;font-size:13pt;font-weight:800;margin-top:8px}.document-subtitle{text-align:center;font-size:7.5pt;margin-top:2px;color:#444}.fields{margin-top:13px}.field{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px;align-items:end;margin:7px 0}.field .label{font-weight:700}.field .dots{border-bottom:1px dotted #444;min-height:17px;padding:0 4px 2px}.field .dots span{background:#fff;padding:0 2px}.field.tall{align-items:start}.field.tall .dots{min-height:29px}.subfield{margin-left:35px}.checklist{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin:8px 0 10px}.check{display:flex;align-items:center;gap:6px}.check .box{display:inline-grid;width:14px;height:14px;place-items:center;border:1px solid #222;font-size:9px;font-weight:800}.check.other{grid-column:1/-1}.declaration{margin-top:10px;font-weight:700}.signature-row{display:flex;justify-content:space-between;align-items:flex-end;margin-top:15px}.stamp{width:165px;height:95px;border:1px solid #222;display:flex;align-items:flex-end;justify-content:center;padding:8px;font-weight:700}.principal{width:235px;text-align:center}.principal-line{border-top:1px dotted #333;padding-top:5px}.meta{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;gap:12px;font-size:6.5pt;color:#555}.instructions{padding-top:24mm}.instructions h1{text-align:center;font-size:15pt;margin:0 0 18mm}.instruction{display:grid;grid-template-columns:28px 1fr;gap:8px;margin:0 0 11mm}.instruction.sub{margin-left:18px}.instruction p{margin:0}.verify{font-size:7pt;color:#555;margin-top:18mm;border-top:1px solid #ccc;padding-top:8px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.page{break-after:page}.page:last-child{break-after:auto}}
</style></head><body>
<section class="page report">
${renderOfficialDocumentHtmlHeader(f.header)}
<div class="code">Form 7-1/0093</div>
<div class="document-title">TRANSFER FORM FOR LEARNER</div>
<div class="document-subtitle">Use one form for each learner · Academic year ${escapeOfficialDocumentHtml(f.source.academicYear || "")}</div>
<div class="fields">
${htmlLine("1. Name and address of new school:",destination,"tall")}
${htmlLine("2. Full names and surname of learner:",f.source.learnerName)}
${htmlLine("3. Date of birth:",date(f.source.dateOfBirth))}
${htmlLine("4. Present grade:",f.source.presentGrade)}
${htmlLine("5. Last grade passed:",f.source.lastGradePassed)}
${htmlLine("6. Medium of instruction (only grades 1, 2 & 3):",f.verified.mediumOfInstruction)}
${htmlLine("7. Subjects taken in last grade (secondary schools):",subjects,"tall")}
${htmlLine("8. Date of departure from school:",date(f.source.departureDate))}
${htmlLine("9. Reason for departure:",f.verified.reasonForDeparture)}
${htmlLine("10. General: (a) Behaviour",f.verified.behaviour,"tall")}
${htmlLine("(b) State of health",f.verified.stateOfHealth,"tall subfield")}
${htmlLine("(c) Any other information",f.verified.otherRelevantInformation,"tall subfield")}
<div class="field"><span class="label">11. Documents attached:</span><span></span></div>
${htmlChecklist(f.verified.documentsAttached)}
<div class="declaration">12. I hereby declare that this document has been completed and verified without unauthorized changes.</div>
<div class="signature-row"><div class="stamp">SCHOOL STAMP</div><div class="principal"><div class="principal-line">PRINCIPAL / AUTHORIZED OFFICER</div></div></div>
</div>
<div class="meta"><span>Issued by ${escapeOfficialDocumentHtml(f.source.schoolName)} · ${escapeOfficialDocumentHtml(input.reference)}</span><span>${escapeOfficialDocumentHtml(input.verificationPath)}</span></div>
</section>
<section class="page instructions">
<h1>INSTRUCTIONS FOR COMPLETION OF TRANSFER FORMS</h1>
<div class="instruction"><strong>1. (a)</strong><p>${escapeOfficialDocumentHtml(TRANSFER_FORM_INSTRUCTIONS[0])}</p></div>
<div class="instruction sub"><strong>(b)</strong><p>${escapeOfficialDocumentHtml(TRANSFER_FORM_INSTRUCTIONS[1])}</p></div>
<div class="instruction"><strong>2.</strong><p>${escapeOfficialDocumentHtml(TRANSFER_FORM_INSTRUCTIONS[2])}</p></div>
<div class="instruction"><strong>3.</strong><p>${escapeOfficialDocumentHtml(TRANSFER_FORM_INSTRUCTIONS[3])}</p></div>
<div class="verify">ScolaPro finalized record · ${escapeOfficialDocumentHtml(input.reference)} · ${escapeOfficialDocumentHtml(input.verificationPath)}</div>
</section>
</body></html>`;
}

const { pageWidth: PAGE_WIDTH, pageHeight: PAGE_HEIGHT, margin: M } = OFFICIAL_DOCUMENT_PDF_GEOMETRY;
const INK = rgb(.06,.06,.06);
const LINE = rgb(.25,.25,.25);

function wrap(font: PDFFont, value: string, size: number, width: number) {
  const words = officialDocumentPdfSafeText(value).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next,size) <= width) line = next;
    else { if (line) out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

function centered(page: PDFPage, font: PDFFont, value: string, size: number, y: number) {
  const safe = officialDocumentPdfSafeText(value);
  page.drawText(safe,{x:(PAGE_WIDTH-font.widthOfTextAtSize(safe,size))/2,y,size,font,color:INK});
}

function pdfField(page: PDFPage, font: PDFFont, bold: PDFFont, label: string, value: string, y: number, height = 18) {
  page.drawText(label,{x:M,y,size:7.7,font:bold,color:INK});
  const labelW=Math.min(255,bold.widthOfTextAtSize(label,7.7)+8);
  const x=M+labelW;
  const w=PAGE_WIDTH-M-x;
  page.drawLine({start:{x,y:y-2},end:{x:x+w,y:y-2},thickness:.4,color:LINE,dashArray:[1.2,2]});
  const lines=wrap(font,value,7.6,w-8).slice(0,Math.max(1,Math.floor(height/9)));
  lines.forEach((t,i)=>page.drawText(t,{x:x+4,y:y-i*9,size:7.6,font,color:INK}));
  return y-height;
}

function drawPdfChecklist(page: PDFPage, font: PDFFont, bold: PDFFont, value: string, y: number) {
  const selected = new Set(documentItems(value));
  const labels = ["Birth certificate","Latest report card","Previous report card(s)","Certified ID / passport copy","CRC / cumulative record package"];
  page.drawText("11. Documents attached:",{x:M,y,size:7.7,font:bold,color:INK});
  y -= 15;
  const colWidth=(PAGE_WIDTH-M*2-12)/2;
  labels.forEach((label,index)=>{
    const col=index%2;
    const row=Math.floor(index/2);
    const x=M+col*(colWidth+12);
    const yy=y-row*16;
    page.drawRectangle({x,y:yy-1,width:9,height:9,borderWidth:.55,borderColor:INK});
    if(selected.has(label)) page.drawText("X",{x:x+1.7,y:yy+.3,size:6.5,font:bold,color:INK});
    page.drawText(label,{x:x+14,y:yy,size:6.9,font,color:INK});
  });
  const other=[...selected].find((item)=>item.startsWith("Other:"));
  const bottom=y-Math.ceil(labels.length/2)*16;
  if(other) {
    page.drawRectangle({x:M,y:bottom-1,width:9,height:9,borderWidth:.55,borderColor:INK});
    page.drawText("X",{x:M+1.7,y:bottom+.3,size:6.5,font:bold,color:INK});
    page.drawText(officialDocumentPdfSafeText(other),{x:M+14,y:bottom,size:6.9,font,color:INK});
    return bottom-14;
  }
  return bottom;
}

export async function renderOfficialLearnerTransferFormPdf(input: {
  form: FinalizedLearnerTransferForm;
  reference: string;
  verificationPath: string;
}): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const pdf=await PDFDocument.create();
  pdf.setTitle("Learner Transfer Form");
  pdf.setAuthor("ScolaPro");
  pdf.setCreator("ScolaPro official document renderer");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));

  const resources=await createOfficialDocumentPdfResources(pdf,input.form.header);
  const { regular, bold }=resources;
  const page=pdf.addPage([PAGE_WIDTH,PAGE_HEIGHT]);
  const f=input.form;
  let y=drawOfficialDocumentPdfHeader(page,f.header,resources,PAGE_HEIGHT-M);
  page.drawText("Form 7-1/0093",{x:PAGE_WIDTH-M-63,y:y-10,size:6.5,font:bold,color:INK});
  y-=20;
  centered(page,bold,"TRANSFER FORM FOR LEARNER",11.5,y);
  y-=11;
  centered(page,regular,`Use one form for each learner · Academic year ${f.source.academicYear || ""}`,6.5,y);
  y-=18;

  const destination=[f.source.newSchool,f.source.newSchoolAddress].filter(Boolean).join(" · ");
  y=pdfField(page,regular,bold,"1.  Name and address of new school:",destination,y,29);
  y=pdfField(page,regular,bold,"2.  Full names and surname of learner:",f.source.learnerName,y,22);
  y=pdfField(page,regular,bold,"3.  Date of birth:",date(f.source.dateOfBirth),y);
  y=pdfField(page,regular,bold,"4.  Present grade:",f.source.presentGrade,y);
  y=pdfField(page,regular,bold,"5.  Last grade passed:",f.source.lastGradePassed,y);
  y=pdfField(page,regular,bold,"6.  Medium of instruction (only grades 1, 2 & 3):",f.verified.mediumOfInstruction,y);
  y=pdfField(page,regular,bold,"7.  Subjects taken in last grade (secondary schools):",f.source.subjects.join(", "),y,32);
  y=pdfField(page,regular,bold,"8.  Date of departure from school:",date(f.source.departureDate),y);
  y=pdfField(page,regular,bold,"9.  Reason for departure:",f.verified.reasonForDeparture,y,24);
  y=pdfField(page,regular,bold,"10. General: (a) Behaviour",f.verified.behaviour,y,28);
  y=pdfField(page,regular,bold,"     (b) State of health",f.verified.stateOfHealth,y,28);
  y=pdfField(page,regular,bold,"     (c) Any other information",f.verified.otherRelevantInformation,y,30);
  y=drawPdfChecklist(page,regular,bold,f.verified.documentsAttached,y);
  y-=5;
  page.drawText("12. I hereby declare that this document has been completed and verified without unauthorized changes.",{x:M,y,size:7.2,font:bold,color:INK});

  const stampY=55;
  page.drawRectangle({x:M,y:stampY,width:148,height:86,borderWidth:.75,borderColor:INK});
  page.drawText("SCHOOL STAMP",{x:M+41,y:stampY+9,size:7.5,font:bold,color:INK});
  const signatureX=PAGE_WIDTH-M-205;
  page.drawLine({start:{x:signatureX,y:stampY+22},end:{x:PAGE_WIDTH-M,y:stampY+22},thickness:.6,color:INK});
  page.drawText("PRINCIPAL / AUTHORIZED OFFICER",{x:signatureX+27,y:stampY+8,size:6.8,font:regular,color:INK});
  page.drawText(officialDocumentPdfSafeText(`Issued by ${f.source.schoolName} · ${input.reference}`),{x:M,y:22,size:5.5,font:regular,color:LINE});
  page.drawText(officialDocumentPdfSafeText(input.verificationPath),{x:PAGE_WIDTH-M-150,y:22,size:5.5,font:regular,color:LINE});

  const p2=pdf.addPage([PAGE_WIDTH,PAGE_HEIGHT]);
  centered(p2,bold,"INSTRUCTIONS FOR COMPLETION OF TRANSFER FORMS",13.5,PAGE_HEIGHT-110);
  let iy=PAGE_HEIGHT-170;
  const drawInstruction=(prefix:string,value:string,indent=0)=>{
    p2.drawText(prefix,{x:M+indent,y:iy,size:8.5,font:bold,color:INK});
    const lines=wrap(regular,value,8.5,PAGE_WIDTH-M*2-42-indent);
    lines.forEach((t,index)=>p2.drawText(t,{x:M+36+indent,y:iy-index*13,size:8.5,font:regular,color:INK}));
    iy-=Math.max(38,lines.length*13+14);
  };
  drawInstruction("1. (a)",TRANSFER_FORM_INSTRUCTIONS[0]);
  drawInstruction("(b)",TRANSFER_FORM_INSTRUCTIONS[1],18);
  drawInstruction("2.",TRANSFER_FORM_INSTRUCTIONS[2]);
  drawInstruction("3.",TRANSFER_FORM_INSTRUCTIONS[3]);
  p2.drawText(`ScolaPro finalized record · ${officialDocumentPdfSafeText(input.reference)}`,{x:M,y:30,size:5.8,font:regular,color:LINE});
  return {bytes:await pdf.save({useObjectStreams:false,addDefaultPage:false,objectsPerTick:50}),pageCount:2};
}
