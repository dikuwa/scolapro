import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const button = readFileSync(new URL('../src/components/ui/button.tsx', import.meta.url), 'utf8');
const calendar = readFileSync(new URL('../src/features/calendar/teaching-impact-manager.tsx', import.meta.url), 'utf8');

test('canonical danger-ghost entry does not use filled background at rest', () => {
  assert.match(button, /"danger-ghost": "bg-transparent text-\[color:var\(--danger\)\]/);
  assert.match(button, /danger: "bg-danger-soft text-\[color:var\(--danger\)\]/);
});

test('Calendar uses unfilled Delete entry but filled confirmed destructive submission', () => {
  assert.match(calendar, /type="button" size="sm" variant="danger-ghost" onClick=\{\(\) => setConfirmDeleteDate\(item\.date\)\}/);
  assert.match(calendar, /type="submit" size="sm" variant="danger" loading=\{deletePending\}/);
  assert.match(calendar, /confirmDeleteDate === item\.date/);
  assert.match(calendar, /setConfirmDeleteDate\(null\)/);
});

const conduct = readFileSync(new URL('../src/features/conduct/policy-settings.tsx', import.meta.url), 'utf8');

test('conduct policy Delete entries remain unfilled until explicit confirmation', () => {
  assert.match(conduct, /variant="danger-ghost" size="sm" onClick=\{\(\) => setConfirmDelete\(\{ kind: "group"/);
  assert.match(conduct, /variant="danger-ghost" size="sm" onClick=\{\(\) => setConfirmDelete\(\{ kind: "item"/);
  assert.match(conduct, /variant="danger">Delete if unused<\/Button>/);
});

const offline = readFileSync(new URL('../src/components/offline/offline-sync-center.tsx', import.meta.url), 'utf8');

test('offline queue Discard entry is transparent until confirmation', () => {
  assert.match(offline, /setConfirmingId\(record\.id\)/);
  assert.match(offline, /bg-transparent px-2\.5 text-\[0\.68rem\] font-semibold text-\[color:var\(--danger\)\]/);
  assert.match(offline, /confirmingId === record\.id/);
});
