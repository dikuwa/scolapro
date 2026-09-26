import { Buffer } from "node:buffer";
import * as XLSX from "xlsx";
import { buildOfficialClassListColumns } from "@/features/documents/server/class-list-document";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";
import type { ClassListWorkspaceData } from "@/features/learners/class-list-types";

type CfbEntry = {
  content?: Uint8Array;
  size?: number;
};

type CfbContainer = {
  FullPaths?: string[];
  FileIndex: CfbEntry[];
};

type CfbApi = {
  read: (data: Buffer, options: { type: "buffer" }) => CfbContainer;
  write: (cfb: CfbContainer, options: { type: "buffer"; fileType: "zip"; compression: boolean }) => Uint8Array;
  find: (cfb: CfbContainer, path: string) => CfbEntry | null;
  utils: {
    cfb_add: (cfb: CfbContainer, path: string, content: Buffer) => unknown;
  };
};

function excelColumnWidth(key: string): number {
  if (key === "number") return 7;
  if (key === "admissionNumber") return 14;
  if (key === "learner") return 28;
  if (key === "sex") return 7;
  if (key === "status") return 11;
  if (key === "registerClass") return 16;
  if (key === "guardianName") return 24;
  if (key === "guardianPhone") return 18;
  if (key === "emergencyContact") return 28;
  if (key.startsWith("blank-")) return 14;
  return 14;
}

function stylesXml(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="4">' +
    '<font><sz val="10"/><name val="Aptos"/></font>' +
    '<font><b/><sz val="10"/><name val="Aptos"/></font>' +
    '<font><b/><sz val="16"/><name val="Aptos Display"/></font>' +
    '<font><b/><sz val="12"/><name val="Aptos"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE9EDF3"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFB8BDC7"/></left><right style="thin"><color rgb="FFB8BDC7"/></right><top style="thin"><color rgb="FFB8BDC7"/></top><bottom style="thin"><color rgb="FFB8BDC7"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
    '</styleSheet>';
}

function setCellStyle(sheetXml: string, reference: string, styleId: number): string {
  const pattern = new RegExp('<c([^>]*\\\\br="' + reference + '"[^>]*)>', "g");
  return sheetXml.replace(pattern, (_match, attributes: string) => {
    const cleaned = attributes.replace(/\\s+s="\\d+"/g, "");
    return '<c' + cleaned + ' s="' + styleId + '">';
  });
}

function findEntry(CFB: CfbApi, cfb: CfbContainer, path: string): CfbEntry | null {
  const candidates = [path, "/" + path, "Root Entry/" + path, "/Root Entry/" + path];
  for (const candidate of candidates) {
    try {
      const found = CFB.find(cfb, candidate);
      if (found) return found;
    } catch {
      // Continue through alternate normalized package paths.
    }
  }
  const index = (cfb.FullPaths || []).findIndex((value: string) => value === path || value.endsWith("/" + path));
  return index >= 0 ? cfb.FileIndex[index] : null;
}

function readText(CFB: CfbApi, cfb: CfbContainer, path: string): string {
  const entry = findEntry(CFB, cfb, path);
  if (!entry || !entry.content) throw new Error("Unable to inspect generated Excel part: " + path);
  return Buffer.from(entry.content).toString("utf8");
}

function writePart(CFB: CfbApi, cfb: CfbContainer, path: string, content: Uint8Array | Buffer | string) {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  const entry = findEntry(CFB, cfb, path);
  if (entry) {
    entry.content = bytes;
    entry.size = bytes.length;
  } else {
    CFB.utils.cfb_add(cfb, path, bytes);
  }
}

function embedLogoAndStyles(
  workbookBytes: Buffer,
  logoBytes: Uint8Array | null,
  tableHeaderRow: number,
  dataRowCount: number,
  columnCount: number,
  metaStartColumn: number,
): Buffer {
  const CFB = (XLSX as unknown as { CFB?: CfbApi }).CFB;
  if (!CFB) return workbookBytes;
  const cfb = CFB.read(workbookBytes, { type: "buffer" });
  let sheetXml = readText(CFB, cfb, "xl/worksheets/sheet1.xml");

  sheetXml = sheetXml.replace(/<worksheet\\b([^>]*)>/, (match, attributes: string) =>
    attributes.includes("xmlns:r=")
      ? match
      : '<worksheet' + attributes + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
  );

  const metaColumn = XLSX.utils.encode_col(metaStartColumn);
  sheetXml = setCellStyle(sheetXml, "B1", 1);
  sheetXml = setCellStyle(sheetXml, metaColumn + "1", 2);
  sheetXml = setCellStyle(sheetXml, metaColumn + "2", 3);
  sheetXml = setCellStyle(sheetXml, metaColumn + "3", 3);

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    sheetXml = setCellStyle(sheetXml, XLSX.utils.encode_col(columnIndex) + tableHeaderRow, 4);
  }
  for (let row = tableHeaderRow + 1; row <= tableHeaderRow + dataRowCount; row += 1) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      sheetXml = setCellStyle(sheetXml, XLSX.utils.encode_col(columnIndex) + row, columnIndex === 0 ? 6 : 5);
    }
  }
  writePart(CFB, cfb, "xl/styles.xml", stylesXml());

  if (logoBytes && logoBytes.length) {
    const isJpeg = logoBytes[0] === 0xff && logoBytes[1] === 0xd8;
    const imageExtension = isJpeg ? "jpg" : "png";
    const imageContentType = isJpeg ? "image/jpeg" : "image/png";
    const imagePath = "xl/media/class-list-logo." + imageExtension;
    const drawingRelationshipId = "rIdClassListDrawing";
    const imageRelationshipId = "rIdClassListLogo";

    writePart(CFB, cfb, imagePath, logoBytes);
    writePart(CFB, cfb, "xl/drawings/drawing1.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      '<xdr:twoCellAnchor editAs="oneCell">' +
      '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
      '<xdr:to><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
      '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="School crest"/><xdr:cNvPicPr/></xdr:nvPicPr>' +
      '<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="' + imageRelationshipId + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
      '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/>' +
      '</xdr:twoCellAnchor></xdr:wsDr>');
    writePart(CFB, cfb, "xl/drawings/_rels/drawing1.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="' + imageRelationshipId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/class-list-logo.' + imageExtension + '"/>' +
      '</Relationships>');

    const worksheetRelsPath = "xl/worksheets/_rels/sheet1.xml.rels";
    const existingWorksheetRels = findEntry(CFB, cfb, worksheetRelsPath)
      ? readText(CFB, cfb, worksheetRelsPath)
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    const worksheetRels = existingWorksheetRels.includes("../drawings/drawing1.xml")
      ? existingWorksheetRels
      : existingWorksheetRels.replace(
          "</Relationships>",
          '<Relationship Id="' + drawingRelationshipId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
        );
    writePart(CFB, cfb, worksheetRelsPath, worksheetRels);

    if (!sheetXml.includes("<drawing ")) {
      sheetXml = sheetXml.replace("</worksheet>", '<drawing r:id="' + drawingRelationshipId + '"/></worksheet>');
    }

    let contentTypes = readText(CFB, cfb, "[Content_Types].xml");
    if (!contentTypes.includes('Extension="' + imageExtension + '"')) {
      contentTypes = contentTypes.replace("</Types>", '<Default Extension="' + imageExtension + '" ContentType="' + imageContentType + '"/></Types>');
    }
    if (!contentTypes.includes('PartName="/xl/drawings/drawing1.xml"')) {
      contentTypes = contentTypes.replace(
        "</Types>",
        '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
      );
    }
    writePart(CFB, cfb, "[Content_Types].xml", contentTypes);
  }

  writePart(CFB, cfb, "xl/worksheets/sheet1.xml", sheetXml);
  return Buffer.from(CFB.write(cfb, { type: "buffer", fileType: "zip", compression: true }));
}

export function renderClassListXlsx(
  input: ClassListWorkspaceData,
  header: OfficialDocumentHeaderModel,
  logoBytes: Uint8Array | null,
): ArrayBuffer {
  const columns = buildOfficialClassListColumns(input.configuration.columns, input.configuration.blankColumns);
  const columnCount = Math.max(columns.length, 6);
  const metaStartColumn = Math.max(3, Math.floor(columnCount * 0.58));
  const leftEndColumn = Math.max(1, metaStartColumn - 1);
  const lastColumn = columnCount - 1;
  const blankRow = () => Array.from({ length: columnCount }, () => "");
  const rows: Array<Array<string | number>> = [
    blankRow(),
    blankRow(),
    blankRow(),
    blankRow(),
    columns.map((column) => column.label),
    ...input.learners.map((learner, index) => columns.map((column) => column.value(learner, index))),
  ];

  rows[0][1] = header.schoolName;
  rows[0][metaStartColumn] = input.title;
  rows[1][metaStartColumn] = input.grade + " · " + input.className + " · " + input.academicYear;
  rows[2][metaStartColumn] = input.registerTeacherName ? "Register teacher: " + input.registerTeacherName : input.learners.length + " learners";

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const lastColumnName = XLSX.utils.encode_col(lastColumn);
  const leftEndColumnName = XLSX.utils.encode_col(leftEndColumn);
  const metaStartColumnName = XLSX.utils.encode_col(metaStartColumn);
  worksheet["!merges"] = [
    XLSX.utils.decode_range("B1:" + leftEndColumnName + "3"),
    XLSX.utils.decode_range(metaStartColumnName + "1:" + lastColumnName + "1"),
    XLSX.utils.decode_range(metaStartColumnName + "2:" + lastColumnName + "2"),
    XLSX.utils.decode_range(metaStartColumnName + "3:" + lastColumnName + "3"),
  ];
  worksheet["!cols"] = Array.from({ length: columnCount }, (_, index) => ({
    wch: columns[index] ? excelColumnWidth(columns[index].key) : 12,
  }));
  worksheet["!rows"] = [{ hpt: 22 }, { hpt: 18 }, { hpt: 18 }, { hpt: 6 }, { hpt: 21 }];
  worksheet["!margins"] = { left: 0.25, right: 0.25, top: 0.25, bottom: 0.35, header: 0.1, footer: 0.1 };
  (worksheet as XLSX.WorkSheet & { "!pageSetup"?: Record<string, unknown> })["!pageSetup"] = {
    orientation: "portrait",
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Class List");
  workbook.Props = { Title: input.title + " class list", Subject: "ScolaPro class list", Author: input.schoolName };
  const baseBytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true, cellStyles: true }) as Buffer;
  const rendered = embedLogoAndStyles(baseBytes, logoBytes, 5, input.learners.length, columns.length, metaStartColumn);
  return rendered.buffer.slice(rendered.byteOffset, rendered.byteOffset + rendered.byteLength) as ArrayBuffer;
}
