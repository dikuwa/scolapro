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
