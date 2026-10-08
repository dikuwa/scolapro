import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/features/timetable/timetable-current-maintenance.tsx', import.meta.url), 'utf8');

test('cancel-slot entry stays unfilled while confirmation stays solid danger', () => {
  assert.match(source, /setConfirmCancel\(true\).*?className="[^"]*bg-transparent[^"]*text-\[color:var\(--danger\)\]/s);
  assert.match(source, /cancelAction/);
  assert.match(source, /type="submit" disabled=\{!selectedSlot \|\| cancelPending\} className="[^"]*bg-\[color:var\(--danger\)\]/);
  assert.match(source, /setConfirmCancel\(false\)/);
});
