import "server-only";

import { Buffer } from "node:buffer";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { buildOfficialDocumentHeaderModel, type OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { createOfficialDocumentPdfResources, officialDocumentPdfSafeText } from "@/features/documents/server/official-document-pdf-header";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function text(value: unknown): string { return value == null ? "" : String(value).trim(); }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

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
    presentGrade: string;
    lastGradePassed: string;
    subjects: string[];
    schoolName: string;
    schoolEmisNumber: string;
    schoolTown: string;
    newSchool: string;
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
  const root=record(value);
  if (text(root.documentType)!=="learner_transfer_form" || text(root.templateContract)!==TRANSFER_FORM_TEMPLATE_CONTRACT) {
    throw new Error("Stored learner transfer-form snapshot has an unsupported template contract.");
  }
  const source=record(root.source);
  const school=record(source.school);
  const verified=record(root.verifiedFields);
  const headerRaw=record(root.header);
  const header=buildOfficialDocumentHeaderModel({
    schoolName:text(headerRaw.schoolName)||text(school.schoolName),
    schoolEmisNumber:text(headerRaw.schoolEmisNumber)||text(school.emisNumber),
    formerName:text(headerRaw.formerName),
    logoUrl:text(headerRaw.logoUrl),
    logoStoragePath:text(headerRaw.logoStoragePath),
    physicalAddress:text(headerRaw.physicalAddress),
    telephone:text(headerRaw.telephone),
    fax:text(headerRaw.fax),
    email:text(headerRaw.email),
    postalAddress:text(headerRaw.postalAddress),
    town:text(headerRaw.town)||text(school.town),
    schoolNameFont:text(headerRaw.schoolNameFont)==="old_english"?"old_english":"default",
  },{mode:"external_correspondence",provenanceSource:"frozen_snapshot"});

  return {
    source:{
      learnerName:text(source.learnerName),
      dateOfBirth:text(source.dateOfBirth),
      presentGrade:text(source.presentGrade),
      lastGradePassed:text(source.lastGradePassed),
      subjects:array(source.subjects).map((item)=>text(record(item).subjectName)).filter(Boolean),
      schoolName:text(school.schoolName),
      schoolEmisNumber:text(school.emisNumber),
      schoolTown:text(school.town),
      newSchool:text(source.newSchool),
      departureDate:text(source.departureDate),
    },
    verified:{
      reasonForDeparture:text(verified.reasonForDeparture),
      mediumOfInstruction:text(verified.mediumOfInstruction),
      documentsAttached:text(verified.documentsAttached),
      behaviour:text(verified.behaviour),
      stateOfHealth:text(verified.stateOfHealth),
      otherRelevantInformation:text(verified.otherRelevantInformation),
      verificationNote:text(verified.verificationNote),
    },
    header,
    finalizedAt:text(root.finalizedAt),
  };
}

function date(value:string):string {
  if(!value) return "";
  const parsed=new Date(`${value}T12:00:00+02:00`);
  return Number.isNaN(parsed.getTime())?value:new Intl.DateTimeFormat("en-NA",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Africa/Windhoek"}).format(parsed);
}
function line(label:string,value:string,extraClass="") {
  return `<div class="field ${extraClass}"><span class="num"></span><span class="label">${escapeHtml(label)}</span><span class="dots"><span>${escapeHtml(value)}</span></span></div>`;
}

export function renderOfficialLearnerTransferFormHtml(input:{
  form:FinalizedLearnerTransferForm;
  reference:string;
  verificationPath:string;
}):string {
  const f=input.form;
  const subjects=f.source.subjects.join(", ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Learner Transfer Form - ${escapeHtml(f.source.learnerName)}</title>
<style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:"Times New Roman",Times,serif;font-size:11pt;line-height:1.25}.page{min-height:273mm;position:relative}.crest{display:block;width:68px;height:68px;object-fit:contain;margin:0 auto 2px}.center{text-align:center}.republic{font-weight:700;font-size:11pt}.ministry{font-weight:700;font-size:15pt;margin-top:10px}.title{font-weight:700;font-size:14pt;margin-top:2px}.code{position:absolute;right:0;top:0;font-size:8pt}.source-school{text-align:center;font-size:8.5pt;margin-top:4px}.fields{margin-top:20px}.field{display:grid;grid-template-columns:24px max-content minmax(0,1fr);gap:7px;align-items:end;margin:10px 0}.field .dots{border-bottom:1px dotted #444;min-height:18px;padding:0 4px 2px}.field .dots span{background:#fff;padding:0 2px}.field.tall{align-items:start}.field.tall .dots{min-height:36px}.subfield{margin-left:52px}.declaration{margin-top:14px}.signature-row{display:flex;justify-content:space-between;align-items:end;margin-top:18px}.stamp{width:180px;height:125px;border:1px solid #222;display:flex;align-items:end;justify-content:center;padding:10px;font-weight:700}.principal{width:230px;text-align:center}.principal-line{border-top:1px dotted #333;padding-top:5px}.meta{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;font:7.5pt Arial,sans-serif;color:#444}.instructions{padding-top:32mm}.instructions h1{text-align:center;font-size:16pt;margin:0 0 25mm}.instruction{display:grid;grid-template-columns:28px 1fr;gap:8px;margin:0 0 14mm}.instruction.sub{margin-left:18px}.instruction p{margin:0}.verify{font:8pt Arial,sans-serif;color:#555;margin-top:22mm;border-top:1px solid #ccc;padding-top:8px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.page{break-after:page}.page:last-child{break-after:auto}}
</style></head><body>
<section class="page">
<div class="code">7-1/0093</div>
<img class="crest" src="/brand/governed/namibia-coat-of-arms.svg" alt="Coat of Arms of Namibia"/>
<div class="center republic">REPUBLIC OF NAMIBIA</div>
<div class="center ministry">MINISTRY OF BASIC EDUCATION AND CULTURE</div>
<div class="center title">TRANSFER FORM FOR LEARNER (USE ONE FORM FOR EACH LEARNER)</div>
<div class="fields">
${line("1. Name and address of new school:",f.source.newSchool,"tall")}
${line("2. Full names and surname of learner:",f.source.learnerName)}
${line("3. Date of birth:",date(f.source.dateOfBirth))}
${line("4. Present grade:",f.source.presentGrade)}
${line("5. Last grade passed:",f.source.lastGradePassed)}
${line("6. Medium of instruction (only grades 1, 2 & 3):",f.verified.mediumOfInstruction)}
${line("7. Subjects taken in last grade (secondary schools):",subjects,"tall")}
${line("8. Date of departure from school:",date(f.source.departureDate))}
${line("9. Reason for departure:",f.verified.reasonForDeparture)}
${line("10. General: (a) Behaviour",f.verified.behaviour,"tall")}
${line("(b) State of health",f.verified.stateOfHealth,"tall subfield")}
${line("(c) Any other information",f.verified.otherRelevantInformation,"tall subfield")}
${line("11. The following documents are attached",f.verified.documentsAttached,"tall")}
<div class="declaration">12. I hereby declare that this document has been completed without any changes.</div>
<div class="signature-row"><div class="stamp">SCHOOL STAMP</div><div class="principal"><div class="principal-line">PRINCIPAL</div></div></div>
</div>
<div class="meta"><span>Issued by ${escapeHtml(f.source.schoolName)} · ${escapeHtml(input.reference)}</span><span>${escapeHtml(input.verificationPath)}</span></div>
</section>
<section class="page instructions">
<h1>INSTRUCTIONS FOR COMPLETION OF TRANSFER FORMS</h1>
<div class="instruction"><strong>1. (a)</strong><p>${escapeHtml(TRANSFER_FORM_INSTRUCTIONS[0])}</p></div>
<div class="instruction sub"><strong>(b)</strong><p>${escapeHtml(TRANSFER_FORM_INSTRUCTIONS[1])}</p></div>
<div class="instruction"><strong>2.</strong><p>${escapeHtml(TRANSFER_FORM_INSTRUCTIONS[2])}</p></div>
<div class="instruction"><strong>3.</strong><p>${escapeHtml(TRANSFER_FORM_INSTRUCTIONS[3])}</p></div>
<div class="verify">ScolaPro finalized record · ${escapeHtml(input.reference)} · ${escapeHtml(input.verificationPath)}</div>
</section>
</body></html>`;
}

const PAGE_WIDTH=595.28, PAGE_HEIGHT=841.89, M=38, INK=rgb(.06,.06,.06), LINE=rgb(.25,.25,.25);
function wrap(font:PDFFont,value:string,size:number,width:number){
  const words=officialDocumentPdfSafeText(value).split(/\s+/).filter(Boolean);const out:string[]=[];let line="";
  for(const word of words){const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,size)<=width)line=next;else{if(line)out.push(line);line=word;}}
  if(line)out.push(line);return out.length?out:[""];
}
function centered(page:PDFPage,font:PDFFont,value:string,size:number,y:number){
  const safe=officialDocumentPdfSafeText(value);page.drawText(safe,{x:(PAGE_WIDTH-font.widthOfTextAtSize(safe,size))/2,y,size,font,color:INK});
}
function field(page:PDFPage,font:PDFFont,bold:PDFFont,label:string,value:string,y:number,height=19){
  page.drawText(label,{x:M,y,size:8.4,font:bold,color:INK});
  const labelW=Math.min(250,bold.widthOfTextAtSize(label,8.4)+8), x=M+labelW, w=PAGE_WIDTH-M-x;
  page.drawLine({start:{x,y:y-2},end:{x:x+w,y:y-2},thickness:.4,color:LINE,dashArray:[1.2,2]});
  const lines=wrap(font,value,8.3,w-8).slice(0,Math.max(1,Math.floor(height/10)));
  lines.forEach((t,i)=>page.drawText(t,{x:x+4,y:y-i*10,size:8.3,font,color:INK}));
  return y-height;
}

export async function renderOfficialLearnerTransferFormPdf(input:{
  form:FinalizedLearnerTransferForm;
  reference:string;
  verificationPath:string;
}):Promise<{bytes:Uint8Array;pageCount:number}> {
  const pdf=await PDFDocument.create();pdf.setTitle("Learner Transfer Form");pdf.setAuthor("ScolaPro");pdf.setCreator("ScolaPro official document renderer");pdf.setCreationDate(new Date(0));pdf.setModificationDate(new Date(0));
  const regular=await pdf.embedFont(StandardFonts.TimesRoman), bold=await pdf.embedFont(StandardFonts.TimesRomanBold);
  const resources=await createOfficialDocumentPdfResources(pdf,input.form.header);
  const page=pdf.addPage([PAGE_WIDTH,PAGE_HEIGHT]);
  if(resources.coatOfArms){const img=resources.coatOfArms,scale=Math.min(58/img.width,58/img.height),w=img.width*scale,h=img.height*scale;page.drawImage(img,{x:(PAGE_WIDTH-w)/2,y:PAGE_HEIGHT-92,width:w,height:h});}
  page.drawText("7-1/0093",{x:PAGE_WIDTH-M-42,y:PAGE_HEIGHT-M,size:7,font:regular,color:INK});
  centered(page,bold,"REPUBLIC OF NAMIBIA",9.5,PAGE_HEIGHT-105);
  centered(page,bold,"MINISTRY OF BASIC EDUCATION AND CULTURE",13,PAGE_HEIGHT-128);
  centered(page,bold,"TRANSFER FORM FOR LEARNER (USE ONE FORM FOR EACH LEARNER)",11.5,PAGE_HEIGHT-146);
  let y=PAGE_HEIGHT-178;
  const f=input.form;
  y=field(page,regular,bold,"1.  Name and address of new school:",f.source.newSchool,y,34);
  y=field(page,regular,bold,"2.  Full names and surname of learner:",f.source.learnerName,y,25);
  y=field(page,regular,bold,"3.  Date of birth:",date(f.source.dateOfBirth),y);
  y=field(page,regular,bold,"4.  Present grade:",f.source.presentGrade,y);
  y=field(page,regular,bold,"5.  Last grade passed:",f.source.lastGradePassed,y);
  y=field(page,regular,bold,"6.  Medium of instruction (only grades 1, 2 & 3):",f.verified.mediumOfInstruction,y);
  y=field(page,regular,bold,"7.  Subjects taken in last grade (secondary schools):",f.source.subjects.join(", "),y,38);
  y=field(page,regular,bold,"8.  Date of departure from school:",date(f.source.departureDate),y);
  y=field(page,regular,bold,"9.  Reason for departure:",f.verified.reasonForDeparture,y,28);
  y=field(page,regular,bold,"10. General: (a) Behaviour",f.verified.behaviour,y,35);
  y=field(page,regular,bold,"     (b) State of health",f.verified.stateOfHealth,y,35);
  y=field(page,regular,bold,"     (c) Any other information",f.verified.otherRelevantInformation,y,38);
  y=field(page,regular,bold,"11. The following documents are attached",f.verified.documentsAttached,y,34);
  page.drawText("12. I hereby declare that this document has been completed without any changes.",{x:M,y:y-2,size:8.4,font:bold,color:INK});
  const stampY=60;page.drawRectangle({x:M,y:stampY,width:155,height:100,borderWidth:.8,borderColor:INK});centered(page,bold,"",1,1);
  page.drawText("SCHOOL STAMP",{x:M+45,y:stampY+10,size:8.2,font:bold,color:INK});
  page.drawLine({start:{x:PAGE_WIDTH-M-190,y:stampY+18},end:{x:PAGE_WIDTH-M,y:stampY+18},thickness:.6,color:INK});
  page.drawText("PRINCIPAL",{x:PAGE_WIDTH-M-118,y:stampY+5,size:8,font:regular,color:INK});
  page.drawText(officialDocumentPdfSafeText(`Issued by ${f.source.schoolName} · ${input.reference}`),{x:M,y:26,size:5.8,font:regular,color:LINE});
  page.drawText(officialDocumentPdfSafeText(input.verificationPath),{x:PAGE_WIDTH-M-160,y:26,size:5.8,font:regular,color:LINE});

  const p2=pdf.addPage([PAGE_WIDTH,PAGE_HEIGHT]);
  centered(p2,bold,"INSTRUCTIONS FOR COMPLETION OF TRANSFER FORMS",14,PAGE_HEIGHT-125);
  let iy=PAGE_HEIGHT-190;
  const drawInstruction=(prefix:string,value:string,indent=0)=>{
    p2.drawText(prefix,{x:M+indent,y:iy,size:9,font:bold,color:INK});
    const lines=wrap(regular,value,9,PAGE_WIDTH-M*2-42-indent);
    lines.forEach((t,index)=>p2.drawText(t,{x:M+36+indent,y:iy-index*14,size:9,font:regular,color:INK}));
    iy-=Math.max(42,lines.length*14+16);
  };
  drawInstruction("1. (a)",TRANSFER_FORM_INSTRUCTIONS[0]);
  drawInstruction("(b)",TRANSFER_FORM_INSTRUCTIONS[1],18);
  drawInstruction("2.",TRANSFER_FORM_INSTRUCTIONS[2]);
  drawInstruction("3.",TRANSFER_FORM_INSTRUCTIONS[3]);
  p2.drawText(`ScolaPro finalized record · ${officialDocumentPdfSafeText(input.reference)}`,{x:M,y:34,size:6,font:regular,color:LINE});
  return {bytes:await pdf.save({useObjectStreams:false,addDefaultPage:false,objectsPerTick:50}),pageCount:2};
}
