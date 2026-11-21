import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Exercise the actual HTML renderer's CSS, without touching real learner data.
const renderer = readFileSync(new URL("../src/features/documents/server/render-official-class-list-html.ts", import.meta.url), "utf8");
function cssRule(selector: string) {
  const line = renderer.split("\n").find((value) => value.trim().startsWith(selector + " {"));
  if (line?.includes("}")) return line;
  const start = renderer.indexOf(selector + " {");
  if (start < 0) throw new Error("Missing class-list CSS: " + selector);
  return renderer.slice(start, renderer.indexOf("}", start) + 1);
}
const css = [
  cssRule(".class-list th, .class-list td"),
  cssRule(".class-list td"),
  cssRule(".class-list td.column-learner"),
  cssRule(".class-list td.column-learner .learner-name"),
].join("\n");

test("synthetic extreme names stay inside their A4 class-list cells in preview and print", async ({ page }) => {
  const names = [
    "Nghiwedua-Mukoya ".repeat(15),
    "Surnamefirst Verylong Multicomponent Learnername ".repeat(12),
    "A".repeat(20_000),
  ];
  for (const viewport of [375, 768, 1440]) {
    await page.setViewportSize({ width: viewport, height: 800 });
    for (const columnWidth of [72, 168]) {
      for (const name of names) {
      for (const media of ["screen", "print"] as const) {
        await page.setContent(`
          <style>
          * { box-sizing: border-box; }
          .class-list { border-collapse: collapse; table-layout: fixed; width: min(100%, 680px); }
          .class-list td { font-size: 7.2px; line-height: 1.2; }
          ${css}
          </style>
          <table class="class-list">
            <colgroup><col style="width:${columnWidth}px"/><col style="width:55px"/></colgroup>
            <tbody><tr><td class="column-learner"><span class="learner-name" title="${name}">${name}</span></td><td class="column-sex">F</td></tr></tbody>
          </table>
        `);
        await page.emulateMedia({ media });
        const layout = await page.evaluate(() => {
          const cell = document.querySelector<HTMLElement>(".column-learner")!;
          const span = document.querySelector<HTMLElement>(".learner-name")!;
          const next = document.querySelector<HTMLElement>(".column-sex")!;
          const bound = cell.getBoundingClientRect();
          const adjacent = next.getBoundingClientRect();
          const height = parseFloat(getComputedStyle(span).lineHeight);
          return {
            cellRight: bound.right,
            adjacentLeft: adjacent.left,
            scrollWidth: cell.scrollWidth,
            clientWidth: cell.clientWidth,
            spanHeight: span.getBoundingClientRect().height,
            lineHeight: height,
            overflow: getComputedStyle(span).overflow,
            text: span.textContent,
            title: span.title,
            adjacent: next.textContent,
          };
        });
        expect(layout.cellRight).toBeLessThanOrEqual(layout.adjacentLeft + 1);
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 2);
        expect(layout.spanHeight).toBeLessThanOrEqual(layout.lineHeight * 3 + 2);
        expect(layout.overflow).toBe("hidden");
        expect(layout.text).toBe(name);
        expect(layout.title).toBe(name);
        expect(layout.adjacent).toBe("F");
      }
      }
    }
  }
});
