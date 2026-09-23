import type { JSONContent } from "@tiptap/core";

export const CORRESPONDENCE_FONTS = [
  "Aptos", "Arial", "Calibri", "Georgia", "Times New Roman", "Source Sans 3", "IBM Plex Sans", "Inter",
] as const;
export const CORRESPONDENCE_FONT_SIZES = ["10pt", "11pt", "12pt", "14pt", "16pt", "18pt"] as const;

const blockTypes = new Set(["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "table", "tableRow", "tableHeader", "tableCell", "hardBreak"]);
const markTypes = new Set(["bold", "italic", "underline", "link", "textStyle"]);
const alignments = new Set(["left", "center", "right", "justify"]);

function cleanText(value: unknown) {
  return typeof value === "string" ? value.slice(0, 20_000) : "";
}

function validateNode(value: unknown, depth: number, state: { nodes: number; text: number }): JSONContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 12 || state.nodes >= 2_000) return null;
  state.nodes += 1;
  const input = value as Record<string, unknown>;
  const type = typeof input.type === "string" ? input.type : "";
  if (type === "text") {
    const text = cleanText(input.text);
    state.text += text.length;
    if (state.text > 100_000) return null;
    const marks = Array.isArray(input.marks) ? input.marks.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const mark = candidate as Record<string, unknown>;
      if (typeof mark.type !== "string" || !markTypes.has(mark.type)) return [];
      if (mark.type === "link") {
        const href = typeof (mark.attrs as Record<string, unknown> | undefined)?.href === "string" ? String((mark.attrs as Record<string, unknown>).href) : "";
        if (!/^(https?:|mailto:)/i.test(href)) return [];
        return [{ type: "link", attrs: { href: href.slice(0, 1_000), target: "_blank", rel: "noopener noreferrer nofollow" } }];
      }
      if (mark.type === "textStyle") {
        const attrs = mark.attrs && typeof mark.attrs === "object" && !Array.isArray(mark.attrs) ? mark.attrs as Record<string, unknown> : {};
        const fontFamily = CORRESPONDENCE_FONTS.includes(attrs.fontFamily as typeof CORRESPONDENCE_FONTS[number]) ? attrs.fontFamily : undefined;
        const fontSize = CORRESPONDENCE_FONT_SIZES.includes(attrs.fontSize as typeof CORRESPONDENCE_FONT_SIZES[number]) ? attrs.fontSize : undefined;
        return fontFamily || fontSize ? [{ type: "textStyle", attrs: { ...(fontFamily ? { fontFamily } : {}), ...(fontSize ? { fontSize } : {}) } }] : [];
      }
      return [{ type: mark.type }];
    }) : undefined;
    return { type: "text", text, ...(marks?.length ? { marks } : {}) };
  }
  if (!blockTypes.has(type)) return null;
  const attrs = input.attrs && typeof input.attrs === "object" && !Array.isArray(input.attrs) ? input.attrs as Record<string, unknown> : {};
  const cleanAttrs: Record<string, unknown> = {};
  if ((type === "paragraph" || type === "heading") && alignments.has(String(attrs.textAlign))) cleanAttrs.textAlign = String(attrs.textAlign);
  if (type === "heading") cleanAttrs.level = attrs.level === 3 ? 3 : 2;
  if (type === "orderedList" && Number.isInteger(attrs.start) && Number(attrs.start) > 0 && Number(attrs.start) < 1_000) cleanAttrs.start = Number(attrs.start);
  if ((type === "tableCell" || type === "tableHeader") && Number.isInteger(attrs.colspan) && Number(attrs.colspan) >= 1 && Number(attrs.colspan) <= 12) cleanAttrs.colspan = Number(attrs.colspan);
  const content = Array.isArray(input.content)
    ? input.content.map((child) => validateNode(child, depth + 1, state)).filter((child): child is JSONContent => child !== null)
    : undefined;
  return { type, ...(Object.keys(cleanAttrs).length ? { attrs: cleanAttrs } : {}), ...(content?.length ? { content } : {}) };
}

export function validateCorrespondenceBody(value: unknown): JSONContent | null {
  const state = { nodes: 0, text: 0 };
  const node = validateNode(value, 0, state);
  return node?.type === "doc" ? node : null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function renderMarks(text: string, marks: JSONContent["marks"]) {
  return (marks ?? []).reduce((output, mark) => {
    if (mark.type === "bold") return `<strong>${output}</strong>`;
    if (mark.type === "italic") return `<em>${output}</em>`;
    if (mark.type === "underline") return `<u>${output}</u>`;
    if (mark.type === "link") return `<a href="${escapeHtml(mark.attrs?.href)}" rel="noopener noreferrer nofollow">${output}</a>`;
    if (mark.type === "textStyle") {
      const declarations = [mark.attrs?.fontFamily ? `font-family:${escapeHtml(mark.attrs.fontFamily)}` : "", mark.attrs?.fontSize ? `font-size:${escapeHtml(mark.attrs.fontSize)}` : ""].filter(Boolean).join(";");
      return declarations ? `<span style="${declarations}">${output}</span>` : output;
    }
    return output;
  }, escapeHtml(text));
}

function renderNode(node: JSONContent): string {
  if (node.type === "text") return renderMarks(node.text ?? "", node.marks);
  if (node.type === "hardBreak") return "<br />";
  const content = (node.content ?? []).map(renderNode).join("");
  const align = alignments.has(String(node.attrs?.textAlign)) ? ` style="text-align:${escapeHtml(node.attrs?.textAlign)}"` : "";
  if (node.type === "doc") return content;
  if (node.type === "paragraph") return `<p${align}>${content || "<br />"}</p>`;
  if (node.type === "heading") return `<h${node.attrs?.level === 3 ? 3 : 2}${align}>${content}</h${node.attrs?.level === 3 ? 3 : 2}>`;
  if (node.type === "bulletList") return `<ul>${content}</ul>`;
  if (node.type === "orderedList") return `<ol${node.attrs?.start && node.attrs.start !== 1 ? ` start="${Number(node.attrs.start)}"` : ""}>${content}</ol>`;
  if (node.type === "listItem") return `<li>${content}</li>`;
  if (node.type === "blockquote") return `<blockquote>${content}</blockquote>`;
  if (node.type === "table") return `<table><tbody>${content}</tbody></table>`;
  if (node.type === "tableRow") return `<tr>${content}</tr>`;
  if (node.type === "tableHeader") return `<th${node.attrs?.colspan ? ` colspan="${Number(node.attrs.colspan)}"` : ""}>${content}</th>`;
  if (node.type === "tableCell") return `<td${node.attrs?.colspan ? ` colspan="${Number(node.attrs.colspan)}"` : ""}>${content}</td>`;
  return content;
}

export function renderCorrespondenceBodyHtml(value: unknown) {
  const body = validateCorrespondenceBody(value);
  if (!body) throw new Error("Correspondence body is invalid.");
  return renderNode(body);
}

export function correspondenceBodyPlainText(value: unknown) {
  const body = validateCorrespondenceBody(value);
  if (!body) return "";
  function text(node: JSONContent): string {
    if (node.type === "text") return node.text ?? "";
    const joined = (node.content ?? []).map(text).join(node.type === "tableRow" ? " | " : "");
    return ["paragraph", "heading", "listItem", "tableRow"].includes(node.type ?? "") ? `${joined}\n` : joined;
  }
  return text(body).replace(/\n{3,}/g, "\n\n").trim();
}
