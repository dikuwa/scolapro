import "server-only";

import { Buffer } from "node:buffer";
import * as XLSX from "xlsx";
import type { OfficialDocumentHeaderModel } from "@/features/documents/server/official-document-header";

/**
 * Shared governed workbook chrome for ScolaPro official XLSX documents.
 *
 * Class lists and Sports/House rosters must not maintain parallel header or
 * style implementations. This module owns:
 *  - the canonical identity/header row composition and merge geometry,
 *  - the single workbook style sheet (strong, visible table borders),
 *  - optional logo drawing parts,
 *  - one deterministic OOXML post-processing pass and package validation.
 *
 * It intentionally does NOT own document-specific content rows. Callers build
 * their own content and pass the header/table coordinates in.
 */

type CfbEntry = { content?: Uint8Array; size?: number };
type CfbContainer = { FullPaths?: string[]; FileIndex: CfbEntry[] };
type CfbApi = {
  read: (data: Buffer, options: { type: "buffer" }) => CfbContainer;
  write: (
    cfb: CfbContainer,
    options: { type: "buffer"; fileType: "zip"; compression: boolean },
  ) => Uint8Array;
  find: (cfb: CfbContainer, path: string) => CfbEntry | null;
  utils: {
    cfb_add: (cfb: CfbContainer, path: string, content: Buffer) => unknown;
  };
};

function workbookPackageApi(): CfbApi | undefined {
  const xlsxModule = XLSX as unknown as {
    CFB?: CfbApi;
    default?: { CFB?: CfbApi };
  };
  return xlsxModule.CFB ?? xlsxModule.default?.CFB;
}

/** The identity/header block always occupies rows 1-6; the data header is row 7. */
export const OFFICIAL_DOCUMENT_WORKBOOK_HEADER_ROWS = 6;
export const OFFICIAL_DOCUMENT_WORKBOOK_TABLE_HEADER_ROW =
  OFFICIAL_DOCUMENT_WORKBOOK_HEADER_ROWS + 1;

export type OfficialDocumentWorkbookContext = {
  title: string;
  primaryContext?: string | null;
  secondaryContext?: string | null;
  summary?: string | null;
};

export type OfficialDocumentWorkbookHeaderInput = {
  header: OfficialDocumentHeaderModel;
  context: OfficialDocumentWorkbookContext;
  /** Total rendered columns including blank writable columns. */
  columnCount: number;
  /** 0-based index where the right-side document metadata begins. */
  metaStartColumn: number;
  /** Optional operational line rendered with the right-side document context (e.g. room/teacher). */
  operationalLine?: string | null;
};

export type OfficialDocumentWorkbookSheetSpec = {
  sheetNumber: number;
  tableHeaderRow: number;
  dataRowCount: number;
  /** Total rendered columns including blank writable columns. */
  columnCount: number;
  metaStartColumn: number;
  header: OfficialDocumentHeaderModel;
  /** 0-based data-header columns rendered vertically to preserve narrow numeric columns. */
  verticalHeaderColumns?: number[];
};

function escapeExcelXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * One shared style sheet. Border colour is intentionally darker than the old
 * `FFB8BDC7` grey so governed table rules read clearly in Excel and print.
 */
export function officialDocumentWorkbookStylesXml(
  schoolNameFont: OfficialDocumentHeaderModel["schoolNameFont"] = "default",
): string {
  const schoolNameFontFamily =
    schoolNameFont === "old_english" ? "Old English Text MT" : "Aptos Display";

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="4">' +
    '<font><sz val="10"/><name val="Aptos"/></font>' +
    '<font><b/><sz val="10"/><name val="Aptos"/></font>' +
    '<font><b/><sz val="16"/><name val="' +
    schoolNameFontFamily +
    '"/></font>' +
    '<font><b/><sz val="12"/><name val="Aptos"/></font>' +
    "</fonts>" +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE9EDF3"/><bgColor indexed="64"/></patternFill></fill>' +
    "</fills>" +
    '<borders count="2">' +
    "<border><left/><right/><top/><bottom/><diagonal/></border>" +
    '<border><left style="medium"><color rgb="FF4A4A4A"/></left><right style="medium"><color rgb="FF4A4A4A"/></right><top style="medium"><color rgb="FF4A4A4A"/></top><bottom style="medium"><color rgb="FF4A4A4A"/></bottom><diagonal/></border>' +
    "</borders>" +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="9">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" textRotation="90" wrapText="0"/></xf>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
    "</styleSheet>"
  );
}

function contactByKey(header: OfficialDocumentHeaderModel) {
  return new Map(header.contactLines.map((line) => [line.key, line]));
}

/**
 * Governed identity rows 1-6 shared by every official workbook family.
 * Returns six rows sized to `columnCount`.
 */
export function buildOfficialDocumentWorkbookHeaderRows(
  input: OfficialDocumentWorkbookHeaderInput,
): Array<Array<string>> {
  const { header, context, columnCount, metaStartColumn } = input;
  const blankRow = () => Array.from({ length: columnCount }, () => "");
  const contact = contactByKey(header);
  const address = contact.get("address");
  const telephone = contact.get("telephone");
  const fax = contact.get("fax");
  const email = contact.get("email");
  const rows = [
    blankRow(),
    blankRow(),
    blankRow(),
    blankRow(),
    blankRow(),
    blankRow(),
  ];
  rows[0][1] = header.schoolName;
  rows[1][1] = header.formerName ? "(" + header.formerName + ")" : "";
  rows[2][1] = address ? address.label + ": " + address.value : "";
  rows[3][1] = [
    telephone ? telephone.label + ": " + telephone.value : "",
    fax ? fax.label + ": " + fax.value : "",
  ]
    .filter(Boolean)
    .join("   ");
  rows[4][1] = email ? email.label + ": " + email.value : "";
  rows[5][1] = "";
  rows[0][metaStartColumn] = context.title;
  rows[1][metaStartColumn] = context.primaryContext ?? "";
  rows[2][metaStartColumn] = context.summary ?? "";
  rows[3][metaStartColumn] = context.secondaryContext ?? "";
  rows[4][metaStartColumn] = input.operationalLine ?? "";
  return rows;
}

export function officialDocumentWorkbookHeaderMerges(
  columnCount: number,
  metaStartColumn: number,
): XLSX.Range[] {
  const lastColumn = Math.max(metaStartColumn, columnCount - 1);
  const leftEnd = Math.max(1, metaStartColumn - 1);
  const leftEndName = XLSX.utils.encode_col(leftEnd);
  const metaName = XLSX.utils.encode_col(metaStartColumn);
  const lastName = XLSX.utils.encode_col(lastColumn);
  return [
    XLSX.utils.decode_range("B1:" + leftEndName + "1"),
    XLSX.utils.decode_range("B2:" + leftEndName + "2"),
    XLSX.utils.decode_range("B3:" + leftEndName + "3"),
    XLSX.utils.decode_range("B4:" + leftEndName + "4"),
    XLSX.utils.decode_range("B5:" + leftEndName + "5"),
    XLSX.utils.decode_range("B6:" + leftEndName + "6"),
    XLSX.utils.decode_range(metaName + "1:" + lastName + "1"),
    XLSX.utils.decode_range(metaName + "2:" + lastName + "2"),
    XLSX.utils.decode_range(metaName + "3:" + lastName + "3"),
    XLSX.utils.decode_range(metaName + "4:" + lastName + "4"),
    XLSX.utils.decode_range(metaName + "5:" + lastName + "5"),
  ];
}

function setCellStyle(
  sheetXml: string,
  reference: string,
  styleId: number,
): string {
  const pattern = new RegExp('<c([^>]*\\br="' + reference + '"[^>]*)>', "g");
  return sheetXml.replace(pattern, (_match, attributes: string) => {
    const cleaned = attributes.replace(/\s+s="\d+"/g, "");
    return "<c" + cleaned + ' s="' + styleId + '">';
  });
}

function setCellRichText(
  sheetXml: string,
  reference: string,
  runs: Array<{ text: string; bold?: boolean }>,
): string {
  const pattern = new RegExp(
    '<c([^>]*\\br="' + reference + '"[^>]*)>[\\s\\S]*?<\\/c>',
  );
  return sheetXml.replace(pattern, (_match, attributes: string) => {
    const cleaned = attributes.replace(/\s+t="[^"]*"/g, "");
    const richText = runs
      .filter((run) => run.text.length > 0)
      .map(
        (run) =>
          "<r>" +
          '<rPr><rFont val="Aptos"/><sz val="10"/>' +
          (run.bold ? "<b/>" : "") +
          "</rPr>" +
          '<t xml:space="preserve">' +
          escapeExcelXmlText(run.text) +
          "</t>" +
          "</r>",
      )
      .join("");
    return "<c" + cleaned + ' t="inlineStr"><is>' + richText + "</is></c>";
  });
}

function findEntry(
  CFB: CfbApi,
  cfb: CfbContainer,
  path: string,
): CfbEntry | null {
  const candidates = [
    path,
    "/" + path,
    "Root Entry/" + path,
    "/Root Entry/" + path,
  ];
  for (const candidate of candidates) {
    try {
      const found = CFB.find(cfb, candidate);
      if (found) return found;
    } catch {
      // Continue through alternate normalized package paths.
    }
  }
  const index = (cfb.FullPaths || []).findIndex(
    (value: string) => value === path || value.endsWith("/" + path),
  );
  return index >= 0 ? cfb.FileIndex[index] : null;
}

function readText(CFB: CfbApi, cfb: CfbContainer, path: string): string {
  const entry = findEntry(CFB, cfb, path);
  if (!entry || !entry.content)
    throw new Error("Unable to inspect generated Excel part: " + path);
  return Buffer.from(entry.content).toString("utf8");
}

function writePart(
  CFB: CfbApi,
  cfb: CfbContainer,
  path: string,
  content: Uint8Array | Buffer | string,
) {
  const bytes =
    typeof content === "string"
      ? Buffer.from(content, "utf8")
      : Buffer.from(content);
  const entry = findEntry(CFB, cfb, path);
  if (entry) {
    entry.content = bytes;
    entry.size = bytes.length;
  } else {
    CFB.utils.cfb_add(cfb, path, bytes);
  }
}

function readImageDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (
    bytes.length > 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const width =
      ((bytes[16] << 24) >>> 0) +
      (bytes[17] << 16) +
      (bytes[18] << 8) +
      bytes[19];
    const height =
      ((bytes[20] << 24) >>> 0) +
      (bytes[21] << 16) +
      (bytes[22] << 8) +
      bytes[23];
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isSof) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return width > 0 && height > 0 ? { width, height } : null;
      }
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }
  return null;
}

function styleSheet(
  CFB: CfbApi,
  cfb: CfbContainer,
  spec: OfficialDocumentWorkbookSheetSpec,
): string {
  const sheetPath = `xl/worksheets/sheet${spec.sheetNumber}.xml`;
  let sheetXml = readText(CFB, cfb, sheetPath);

  sheetXml = sheetXml.replace(
    /<worksheet\b([^>]*)>/,
    (match, attributes: string) =>
      attributes.includes("xmlns:r=")
        ? match
        : "<worksheet" +
          attributes +
          ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
  );
  sheetXml = sheetXml.replace(
    /<sheetView\b([^>]*)>/,
    (_match, attributes: string) => {
      const normalized = attributes.replace(/\s+showGridLines="[^"]*"/g, "");
      const selfClosing = /\/\s*$/.test(normalized);
      const cleaned = selfClosing
        ? normalized.replace(/\/\s*$/, "")
        : normalized;
      return (
        "<sheetView" +
        cleaned +
        ' showGridLines="0"' +
        (selfClosing ? "/>" : ">")
      );
    },
  );

  const metaColumn = XLSX.utils.encode_col(spec.metaStartColumn);
  sheetXml = setCellStyle(sheetXml, "B1", 1);
  sheetXml = setCellStyle(sheetXml, "B2", 7);
  sheetXml = setCellStyle(sheetXml, "B3", 7);
  sheetXml = setCellStyle(sheetXml, "B4", 7);
  sheetXml = setCellStyle(sheetXml, "B5", 7);
  sheetXml = setCellStyle(sheetXml, "B6", 7);

  const contact = contactByKey(spec.header);
  const address = contact.get("address");
  const telephone = contact.get("telephone");
  const fax = contact.get("fax");
  const email = contact.get("email");
  if (address) {
    sheetXml = setCellRichText(sheetXml, "B3", [
      { text: address.label + ":", bold: true },
      { text: " " + address.value },
    ]);
  }
  if (telephone || fax) {
    sheetXml = setCellRichText(sheetXml, "B4", [
      ...(telephone
        ? [
            { text: telephone.label + ":", bold: true },
            { text: " " + telephone.value },
          ]
        : []),
      ...(telephone && fax ? [{ text: "   " }] : []),
      ...(fax
        ? [{ text: fax.label + ":", bold: true }, { text: " " + fax.value }]
        : []),
    ]);
  }
  if (email) {
    sheetXml = setCellRichText(sheetXml, "B5", [
      { text: email.label + ":", bold: true },
      { text: " " + email.value },
    ]);
  }

  sheetXml = setCellStyle(sheetXml, metaColumn + "1", 2);
  sheetXml = setCellStyle(sheetXml, metaColumn + "2", 3);
  sheetXml = setCellStyle(sheetXml, metaColumn + "3", 3);
  sheetXml = setCellStyle(sheetXml, metaColumn + "4", 3);
  sheetXml = setCellStyle(sheetXml, metaColumn + "5", 3);

  const verticalHeaderColumns = new Set(spec.verticalHeaderColumns ?? []);
  for (let columnIndex = 0; columnIndex < spec.columnCount; columnIndex += 1) {
    sheetXml = setCellStyle(
      sheetXml,
      XLSX.utils.encode_col(columnIndex) + spec.tableHeaderRow,
      verticalHeaderColumns.has(columnIndex) ? 8 : 4,
    );
  }
  for (
    let row = spec.tableHeaderRow + 1;
    row <= spec.tableHeaderRow + spec.dataRowCount;
    row += 1
  ) {
    for (
      let columnIndex = 0;
      columnIndex < spec.columnCount;
      columnIndex += 1
    ) {
      sheetXml = setCellStyle(
        sheetXml,
        XLSX.utils.encode_col(columnIndex) + row,
        columnIndex === 0 ? 6 : 5,
      );
    }
  }
  writePart(CFB, cfb, sheetPath, sheetXml);
  return sheetPath;
}

function attachLogo(
  CFB: CfbApi,
  cfb: CfbContainer,
  logoBytes: Uint8Array,
  sheetNumber: number,
  contentTypesState: { xml: string },
) {
  const isJpeg = logoBytes[0] === 0xff && logoBytes[1] === 0xd8;
  const imageExtension = isJpeg ? "jpg" : "png";
  const imageContentType = isJpeg ? "image/jpeg" : "image/png";
  const imagePath = "xl/media/class-list-logo." + imageExtension;
  const drawingPath = `xl/drawings/drawing${sheetNumber}.xml`;
  const drawingRelsPath = `xl/drawings/_rels/drawing${sheetNumber}.xml.rels`;
  const worksheetRelsPath = `xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`;
  const drawingRelationshipId = "rIdClassListDrawing";
  const imageRelationshipId = "rIdClassListLogo";

  writePart(CFB, cfb, imagePath, logoBytes);
  const dimensions = readImageDimensions(logoBytes) ?? { width: 1, height: 1 };
  const targetHeightEmu = 700000;
  const targetWidthEmu = Math.round(
    targetHeightEmu * (dimensions.width / dimensions.height),
  );
  writePart(
    CFB,
    cfb,
    drawingPath,
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      "<xdr:oneCellAnchor>" +
      "<xdr:from><xdr:col>0</xdr:col><xdr:colOff>19050</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from>" +
      '<xdr:ext cx="' +
      targetWidthEmu +
      '" cy="' +
      targetHeightEmu +
      '"/>' +
      '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="School crest"/><xdr:cNvPicPr/></xdr:nvPicPr>' +
      '<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="' +
      imageRelationshipId +
      '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
      '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/>' +
      "</xdr:oneCellAnchor></xdr:wsDr>",
  );
  writePart(
    CFB,
    cfb,
    drawingRelsPath,
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="' +
      imageRelationshipId +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/class-list-logo.' +
      imageExtension +
      '"/>' +
      "</Relationships>",
  );

  const existingWorksheetRels = findEntry(CFB, cfb, worksheetRelsPath)
    ? readText(CFB, cfb, worksheetRelsPath)
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const target = `../drawings/drawing${sheetNumber}.xml`;
  const worksheetRels = existingWorksheetRels.includes(target)
    ? existingWorksheetRels
    : existingWorksheetRels.replace(
        "</Relationships>",
        '<Relationship Id="' +
          drawingRelationshipId +
          '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="' +
          target +
          '"/></Relationships>',
      );
  writePart(CFB, cfb, worksheetRelsPath, worksheetRels);

  const sheetPath = `xl/worksheets/sheet${sheetNumber}.xml`;
  let sheetXml = readText(CFB, cfb, sheetPath);
  if (!sheetXml.includes("<drawing ")) {
    sheetXml = sheetXml.replace(
      "</worksheet>",
      '<drawing r:id="' + drawingRelationshipId + '"/></worksheet>',
    );
    writePart(CFB, cfb, sheetPath, sheetXml);
  }

  let contentTypes = contentTypesState.xml;
  if (!contentTypes.includes('Extension="' + imageExtension + '"')) {
    contentTypes = contentTypes.replace(
      "</Types>",
      '<Default Extension="' +
        imageExtension +
        '" ContentType="' +
        imageContentType +
        '"/></Types>',
    );
  }
  if (
    !contentTypes.includes(
      'PartName="/xl/drawings/drawing' + sheetNumber + '.xml"',
    )
  ) {
    contentTypes = contentTypes.replace(
      "</Types>",
      '<Override PartName="/xl/drawings/drawing' +
        sheetNumber +
        '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
    );
  }
  contentTypesState.xml = contentTypes;
}

/**
 * Undo the round-trip per-sheet mutation used previously. All sheet chrome is
 * applied inside ONE CFB read/write cycle so the package cannot drift between
 * sheets, then the relationship targets are asserted before returning bytes.
 */
export function finalizeOfficialDocumentWorkbook(
  workbookBytes: Buffer,
  sheets: OfficialDocumentWorkbookSheetSpec[],
  logoBytes: Uint8Array | null,
): Buffer {
  const CFB = workbookPackageApi();
  if (!CFB || !sheets.length) return workbookBytes;
  const cfb = CFB.read(workbookBytes, { type: "buffer" });

  writePart(
    CFB,
    cfb,
    "xl/styles.xml",
    officialDocumentWorkbookStylesXml(sheets[0]?.header.schoolNameFont ?? "default"),
  );

  const contentTypesState = { xml: readText(CFB, cfb, "[Content_Types].xml") };
  for (const spec of sheets) {
    styleSheet(CFB, cfb, spec);
    if (logoBytes && logoBytes.length)
      attachLogo(CFB, cfb, logoBytes, spec.sheetNumber, contentTypesState);
  }
  writePart(CFB, cfb, "[Content_Types].xml", contentTypesState.xml);

  validateOfficialDocumentWorkbook(
    CFB,
    cfb,
    sheets,
    Boolean(logoBytes?.length),
  );
  return Buffer.from(
    CFB.write(cfb, { type: "buffer", fileType: "zip", compression: true }),
  );
}

/**
 * Compatibility adapter for document families that already build their own
 * worksheet rows. The shared module still owns the single package mutation,
 * validation, styles and logo relationships.
 */
export function applyOfficialDocumentXlsxChrome(
  workbookBytes: Buffer,
  header: OfficialDocumentHeaderModel,
  logoBytes: Uint8Array | null,
  sheets: Array<{
    tableHeaderRow: number;
    dataRowCount: number;
    columnCount: number;
    metaStartColumn: number;
    sheetNumber?: number;
    verticalHeaderColumns?: number[];
  }>,
): Buffer {
  return finalizeOfficialDocumentWorkbook(
    workbookBytes,
    sheets.map((sheet, index) => ({
      ...sheet,
      sheetNumber: sheet.sheetNumber ?? index + 1,
      header,
    })),
    logoBytes,
  );
}

/**
 * Every worksheet must resolve its relationship targets and every declared
 * drawing/media part must exist. This is the guard that catches the kind of
 * broken package that makes Excel show a repair prompt.
 */
function validateOfficialDocumentWorkbook(
  CFB: CfbApi,
  cfb: CfbContainer,
  sheets: OfficialDocumentWorkbookSheetSpec[],
  hasLogo: boolean,
) {
  const contentTypes = readText(CFB, cfb, "[Content_Types].xml");
  for (const spec of sheets) {
    const sheetPath = `xl/worksheets/sheet${spec.sheetNumber}.xml`;
    const sheetXml = readText(CFB, cfb, sheetPath);
    if (sheetXml.includes("<drawing ")) {
      const relsPath = `xl/worksheets/_rels/sheet${spec.sheetNumber}.xml.rels`;
      const rels = readText(CFB, cfb, relsPath);
      if (!rels.includes(`drawing${spec.sheetNumber}.xml`)) {
        throw new Error(
          `Workbook sheet ${spec.sheetNumber} references a drawing without a relationship target.`,
        );
      }
      if (!findEntry(CFB, cfb, `xl/drawings/drawing${spec.sheetNumber}.xml`)) {
        throw new Error(
          `Workbook sheet ${spec.sheetNumber} drawing part is missing.`,
        );
      }
      if (
        !contentTypes.includes(
          `PartName="/xl/drawings/drawing${spec.sheetNumber}.xml"`,
        )
      ) {
        throw new Error(
          `Workbook sheet ${spec.sheetNumber} drawing is missing from content types.`,
        );
      }
    }
  }
  if (
    hasLogo &&
    !contentTypes.includes('Extension="png"') &&
    !contentTypes.includes('Extension="jpg"')
  ) {
    throw new Error("Workbook logo media is missing from content types.");
  }
}

/** Builds a governed worksheet from header rows, a data header and content rows. */
export function buildOfficialDocumentWorkbookSheet(input: {
  header: OfficialDocumentHeaderModel;
  context: OfficialDocumentWorkbookContext;
  metaStartColumn: number;
  columnCount: number;
  columnWidths: number[];
  dataHeaders: string[];
  dataRows: Array<Array<string | number>>;
  /** Rows rendered below the bordered table (e.g. certification/sign-off blocks). */
  trailingRows?: Array<Array<string | number>>;
  rowHeights?: XLSX.RowInfo[];
  trailingRowHeights?: XLSX.RowInfo[];
  operationalLine?: string | null;
  landscape?: boolean;
}): XLSX.WorkSheet {
  const headerRows = buildOfficialDocumentWorkbookHeaderRows({
    header: input.header,
    context: input.context,
    columnCount: input.columnCount,
    metaStartColumn: input.metaStartColumn,
    operationalLine: input.operationalLine,
  });
  const trailingRows = input.trailingRows ?? [];
  const columns: Array<Array<string | number>> = [
    ...headerRows,
    input.dataHeaders,
    ...input.dataRows,
    ...trailingRows,
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(columns);
  worksheet["!merges"] = officialDocumentWorkbookHeaderMerges(
    input.columnCount,
    input.metaStartColumn,
  );
  worksheet["!cols"] = Array.from(
    { length: input.columnCount },
    (_, index) => ({
      wch: input.columnWidths[index] ?? 14,
    }),
  );
  const defaultDataHeight = 18;
  worksheet["!rows"] = [
    { hpt: 22 },
    { hpt: 9 },
    { hpt: 9 },
    { hpt: 9 },
    { hpt: 9 },
    { hpt: 11 },
    { hpt: 21 },
    ...(input.rowHeights ??
      input.dataRows.map(() => ({ hpt: defaultDataHeight }))),
    ...(input.trailingRowHeights ??
      trailingRows.map(() => ({ hpt: defaultDataHeight }))),
  ];
  worksheet["!margins"] = {
    left: 0.25,
    right: 0.25,
    top: 0.25,
    bottom: 0.35,
    header: 0.1,
    footer: 0.1,
  };
  (worksheet as XLSX.WorkSheet & { "!pageSetup"?: Record<string, unknown> })[
    "!pageSetup"
  ] = {
    orientation: input.landscape ? "landscape" : "portrait",
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };
  return worksheet;
}
