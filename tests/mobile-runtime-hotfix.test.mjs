import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const time = source('components/ui/time-field.tsx');
const nav = source('components/shell/navigation.tsx').split('export function MobileNavigation')[1];

test('time panel is always portaled; mobile stays centered and desktop uses collision-aware fixed positioning', () => {
  assert.match(time, /return createPortal\(panel, document\.body\)/);
  assert.match(time, /"fixed z-\[180\]/);
  assert.match(time, /viewport\.mobile && "-translate-x-1\/2 -translate-y-1\/2"/);
  assert.match(time, /left: viewport\.left \+ viewport\.width \/ 2/);
  assert.match(time, /top: viewport\.top \+ viewport\.height \/ 2/);
  assert.match(time, /resolveTimePanelPlacement/);
  assert.match(time, /left: desktopPosition\?\.left/);
  assert.match(time, /top: desktopPosition\?\.top/);
});
test('keyboard and visual viewport changes update positioning with listener cleanup', () => {
  for (const event of ['resize','scroll']) {
    assert.ok(time.includes(`window.visualViewport?.addEventListener("${event}", update)`));
    assert.ok(time.includes(`window.visualViewport?.removeEventListener("${event}", update)`));
  }
  assert.match(time, /panelRef\.current\?\.contains/);
  assert.match(time, /shrink-0 items-center justify-between/);
});
test('time column selection cannot scroll the page or invoke a native time input', () => {
  assert.doesNotMatch(time, /\.scrollIntoView\(/);
  assert.match(time, /list\.scrollTop/);
  assert.match(time, /length: 24/);
  assert.match(time, /length: 60/);
  assert.match(time, /onChange\(`\$\{hour\}:\$\{minute\}`\)/);
  assert.match(time, /<input type="hidden" name=\{name\} value=\{value\}/);
  assert.doesNotMatch(time, /type="time"\s/);
  assert.match(time, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.doesNotMatch(time, /inputRef.*focus\(/);
});
test('mobile navigation has bounded fractional tracks and usable targets without hiding overflow', () => {
  assert.match(nav, /w-full max-w-\[100vw\]/);
  assert.match(nav, /grid min-w-0 max-w-xl gap-1/);
  assert.match(nav, /minmax\(0, 1fr\)/);
  assert.equal((nav.match(/min-h-12 min-w-0/g) ?? []).length, 2);
  assert.match(nav, /env\(safe-area-inset-bottom\)/);
  assert.match(nav, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(nav, /min-w-0 break-words/);
  assert.doesNotMatch(nav, /overflow-x-hidden/);
});
test('absence route retains governed scope and an existing recoverable error boundary', () => {
  assert.match(source('app/school/absence-reviews/page.tsx'), /getAbsenceReviewWorkspace/);
  assert.match(source('features/attendance/server/absence-review-workspace.ts'), /rpc\("resolve_absence_review_scope"/);
  assert.match(source('app/error.tsx'), /onClick=\{reset\}/);
  for (const file of ['app/school/absence-reviews/page.tsx','components/ui/time-field.tsx']) {
    assert.doesNotMatch(source(file), /clearMarks|performance\.measure\s*=/);
  }
});
