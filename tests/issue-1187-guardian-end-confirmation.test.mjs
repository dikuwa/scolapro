import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/features/guardians/guardian-panel.tsx', import.meta.url), 'utf8');

test('guardian relationship termination requires a separate explicit confirmation', () => {
  assert.match(source, /const \[confirmEnd, setConfirmEnd\] = useState\(false\)/);
  assert.match(source, /confirmEnd \? <form action=\{endAction\}/);
  assert.match(source, /onClick=\{\(\) => setConfirmEnd\(true\)\}/);
  assert.match(source, /onClick=\{\(\) => setConfirmEnd\(false\)\}/);
  assert.match(source, /type="submit" disabled=\{endPending\} aria-busy=\{endPending \|\| undefined\}/);
  assert.match(source, /Yes, end/);
});
