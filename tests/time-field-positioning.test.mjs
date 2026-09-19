import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function loadPositioning() {
  const source = await read('src/components/ui/time-field-positioning.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function('module', 'exports', compiled)(compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const timeField = await read('src/components/ui/time-field.tsx');
const planner = await read('src/features/late-arrivals/detention-planner.tsx');
const { resolveTimePanelPlacement } = await loadPositioning();

test('desktop TimeField placement stays within viewport at 768/1024/1440 widths', () => {
  for (const width of [768, 1024, 1440]) {
    const viewport = { left: 0, top: 0, width, height: 800 };
    const leftEdge = resolveTimePanelPlacement(
      { left: 8, right: 48, top: 160, bottom: 200 },
      { width: 256, height: 300 },
      viewport,
    );
    assert.ok(leftEdge.left >= 16, `panel must clear left viewport edge at ${width}px`);
    assert.ok(leftEdge.left + 256 <= width - 16, `panel must clear right viewport edge at ${width}px`);

    const rightEdge = resolveTimePanelPlacement(
      { left: width - 48, right: width - 8, top: 160, bottom: 200 },
      { width: 256, height: 300 },
      viewport,
    );
    assert.ok(rightEdge.left >= 16, `right-anchored panel must clear left edge at ${width}px`);
    assert.ok(rightEdge.left + 256 <= width - 16, `right-anchored panel must clear right edge at ${width}px`);
  }
});

test('desktop TimeField flips above when the panel would collide with the viewport bottom', () => {
  const placement = resolveTimePanelPlacement(
    { left: 300, right: 340, top: 700, bottom: 740 },
    { width: 256, height: 300 },
    { left: 0, top: 0, width: 1024, height: 768 },
  );
  assert.ok(placement.top < 700);
  assert.ok(placement.top >= 16);
  assert.ok(placement.top + 300 <= 752);
});

test('390px mobile behavior stays centered while every popup portals to document.body', () => {
  assert.match(timeField, /mobile: window\.matchMedia\("\(max-width: 639px\)"\)\.matches/);
  assert.match(timeField, /viewport\.mobile && "-translate-x-1\/2 -translate-y-1\/2"/);
  assert.match(timeField, /left: viewport\.left \+ viewport\.width \/ 2/);
  assert.match(timeField, /top: viewport\.top \+ viewport\.height \/ 2/);
  assert.match(timeField, /return createPortal\(panel, document\.body\);/);
  assert.doesNotMatch(timeField, /viewport\.mobile \? createPortal/);
});

test('TimeField repositions for scrolling/viewport changes and preserves close/focus behavior', () => {
  assert.match(timeField, /window\.addEventListener\("scroll", update, true\)/);
  assert.match(timeField, /window\.visualViewport\?\.addEventListener\("resize", update\)/);
  assert.match(timeField, /window\.visualViewport\?\.addEventListener\("scroll", update\)/);
  assert.match(timeField, /if \(event\.key === "Escape"\) closePanel\(\)/);
  assert.match(timeField, /triggerRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(timeField, /!rootRef\.current\?\.contains\(event\.target as Node\) && !panelRef\.current\?\.contains\(event\.target as Node\)/);
});

test('late-arrival planner uses the shared TimeField for both start and end controls', () => {
  assert.match(planner, /import \{ TimeField \} from "@\/components\/ui\/time-field"/);
  const startMatches = planner.match(/<TimeField label="Starts at"/g) ?? [];
  const endMatches = planner.match(/<TimeField label="Ends at"/g) ?? [];
  assert.ok(startMatches.length >= 2, 'start time must use shared TimeField in create and reschedule flows');
  assert.ok(endMatches.length >= 2, 'end time must use shared TimeField in create and reschedule flows');
});
