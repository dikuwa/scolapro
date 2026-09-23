import "server-only";

import type { JSONContent } from "@tiptap/core";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { OFFICIAL_DOCUMENT_PDF_GEOMETRY, officialDocumentPdfContentWidth } from "@/features/documents/server/official-document-chrome";
import { drawOfficialDocumentPdfFooter } from "@/features/documents/server/official-document-pdf-footer";
import { createOfficialDocumentPdfResources, drawOfficialDocumentPdfHeader, fitOfficialDocumentPdfText, officialDocumentPdfSafeText } from "@/features/documents/server/official-document-pdf-header";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import { validateCorrespondenceBody } from "@/features/correspondence/rich-text";
import type { CorrespondenceDocument } from "@/features/correspondence/types";

const { pageWidth: PAGE_WIDTH, pageHeight: PAGE_HEIGHT, margin: MARGIN } = OFFICIAL_DOCUMENT_PDF_GEOMETRY;
const CONTENT_WIDTH = officialDocumentPdfContentWidth();
const INK = rgb(.08,.08,.08); const LINE = rgb(.45,.45,.45);
type Block = { kind: "text"; text: string; style: "body"|"heading"|"list" } | { kind: "table"; rows: string[][] };

function nodeText(node: JSONContent): string { return node.type === "text" ? node.text ?? "" : (node.content ?? []).map(nodeText).join(""); }
function blocks(value: unknown): Block[] {
  const doc = validateCorrespondenceBody(value); if (!doc) throw new Error("Correspondence body is invalid.");
  const output: Block[] = [];
  function walk(node: JSONContent, listPrefix="") {
    if (node.type === "table") { output.push({ kind:"table", rows:(node.content ?? []).map((row) => (row.content ?? []).map(nodeText)) }); return; }
    if (node.type === "paragraph") { output.push({ kind:"text", text:nodeText(node), style:"body" }); return; }
    if (node.type === "heading") { output.push({ kind:"text", text:nodeText(node), style:"heading" }); return; }
    if (node.type === "listItem") { output.push({ kind:"text", text:`${listPrefix}${nodeText(node)}`, style:"list" }); return; }
    if (node.type === "bulletList" || node.type === "orderedList") { (node.content ?? []).forEach((item,index) => walk(item,node.type === "orderedList" ? `${index+1}. ` : "• ")); return; }
    (node.content ?? []).forEach((child) => walk(child,listPrefix));
  }
  walk(doc); return output;
}
function wrap(font: PDFFont,text:string,size:number,width:number) { const words=officialDocumentPdfSafeText(text).split(/\s+/).filter(Boolean); const lines:string[]=[]; let line=""; for(const word of words){const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,size)<=width)line=next;else{if(line)lines.push(line);line=word;}}if(line)lines.push(line);return lines.length?lines:[""]; }

export async function renderCorrespondencePdf(input:{document:CorrespondenceDocument;header:OfficialDocumentHeaderModel;logoBytes?:Uint8Array|null}) {
  const pdf=await PDFDocument.create(); pdf.setTitle(input.document.subject||"Official correspondence"); pdf.setAuthor("ScolaPro"); pdf.setCreator("ScolaPro official document renderer"); pdf.setCreationDate(new Date(0)); pdf.setModificationDate(new Date(0));
  const resources=await createOfficialDocumentPdfResources(pdf,input.header,input.logoBytes); const {regular,bold}=resources;
  let page:PDFPage=pdf.addPage([PAGE_WIDTH,PAGE_HEIGHT]); let y=drawOfficialDocumentPdfHeader(page,input.header,resources)-18;
  const newPage=()=>{page=pdf.addPage([PAGE_WIDTH,PAGE_HEIGHT]);y=drawOfficialDocumentPdfHeader(page,input.header,resources)-18;return page;};
  const ensure=(height:number)=>{if(y-height<42)newPage();};
  const line=(label:string,value:string,right=false)=>{ensure(14);const text=`${label}: ${value||"-"}`;page.drawText(fitOfficialDocumentPdfText(regular,text,8.5,CONTENT_WIDTH),{x:right?PAGE_WIDTH-MARGIN-regular.widthOfTextAtSize(fitOfficialDocumentPdfText(regular,text,8.5,CONTENT_WIDTH/2),8.5):MARGIN,y,size:8.5,font:regular,color:INK});y-=14;};
  line("Date",new Intl.DateTimeFormat("en-NA",{dateStyle:"long",timeZone:"Africa/Windhoek"}).format(new Date(`${input.document.documentDate}T12:00:00+02:00`)));
  line("Reference",input.document.referenceNumber??"Assigned on finalization"); y-=5; line("To",input.document.recipient); if(input.document.attention)line("Attention",input.document.attention); y-=7;
  ensure(26); const subject=`RE: ${officialDocumentPdfSafeText(input.document.subject||"Untitled correspondence").toUpperCase()}`; wrap(bold,subject,10,CONTENT_WIDTH).forEach((text)=>{page.drawText(text,{x:MARGIN,y,size:10,font:bold,color:INK});y-=13;});y-=6;
  for(const block of blocks(input.document.body)){
    if(block.kind==="text"){const size=block.style==="heading"?11:9;const font=block.style==="heading"?bold:regular;const indent=block.style==="list"?10:0;const lines=wrap(font,block.text,size,CONTENT_WIDTH-indent);ensure(lines.length*(size+4)+8);for(const text of lines){page.drawText(text,{x:MARGIN+indent,y,size,font,color:INK});y-=size+4;}y-=5;continue;}
    const rows=block.rows; const cols=Math.max(1,...rows.map((row)=>row.length));const colWidth=CONTENT_WIDTH/cols;const rowHeight=22;
    for(let rowIndex=0;rowIndex<rows.length;rowIndex++){ensure(rowHeight+(rowIndex>0?rowHeight:0)); if(rowIndex>0&&y>PAGE_HEIGHT-MARGIN-110&&rows[0]){const header=rows[0];header.forEach((cell,index)=>{page.drawRectangle({x:MARGIN+index*colWidth,y:y-rowHeight,width:colWidth,height:rowHeight,borderWidth:.5,borderColor:LINE});page.drawText(fitOfficialDocumentPdfText(bold,cell,6.5,colWidth-6),{x:MARGIN+index*colWidth+3,y:y-14,size:6.5,font:bold,color:INK});});y-=rowHeight;}
      rows[rowIndex].forEach((cell,index)=>{page.drawRectangle({x:MARGIN+index*colWidth,y:y-rowHeight,width:colWidth,height:rowHeight,borderWidth:.5,borderColor:LINE});page.drawText(fitOfficialDocumentPdfText(rowIndex===0?bold:regular,cell,6.5,colWidth-6),{x:MARGIN+index*colWidth+3,y:y-14,size:6.5,font:rowIndex===0?bold:regular,color:INK});});y-=rowHeight;
    } y-=8;
  }
  ensure(75); page.drawText(officialDocumentPdfSafeText(input.document.closing),{x:MARGIN,y,size:9,font:regular,color:INK});y-=input.document.includeSignatureBlock?42:16; if(input.document.includeSignatureBlock)page.drawLine({start:{x:MARGIN,y:y+8},end:{x:MARGIN+180,y:y+8},thickness:.5,color:LINE}); page.drawText(officialDocumentPdfSafeText(input.document.signatoryName),{x:MARGIN,y,size:9,font:bold,color:INK});y-=13;page.drawText(officialDocumentPdfSafeText(input.document.signatoryPosition),{x:MARGIN,y,size:8.5,font:regular,color:INK});y-=18;
  if(input.document.attachments.length){ensure(20+input.document.attachments.length*12);page.drawText("Attachments:",{x:MARGIN,y,size:8,font:bold,color:INK});y-=12;input.document.attachments.forEach((item,index)=>{page.drawText(fitOfficialDocumentPdfText(regular,`${index+1}. ${item}`,7.5,CONTENT_WIDTH-10),{x:MARGIN+10,y,size:7.5,font:regular,color:INK});y-=11;});}
  const pages=pdf.getPages(); pages.forEach((current,index)=>drawOfficialDocumentPdfFooter({page:current,font:regular,pageNumber:index+1,pageCount:pages.length,primaryLeft:`${input.document.referenceNumber??"DRAFT"} · Revision ${input.document.revisionNumber}`,secondaryLeft:input.document.status==="finalized"?`Finalized by ${input.document.authorSnapshot?.displayName??"School staff"}`:"DRAFT — NOT FINAL",clearArea:true}));
  return {bytes:await pdf.save({useObjectStreams:false,addDefaultPage:false,objectsPerTick:50}),pageCount:pages.length};
}
