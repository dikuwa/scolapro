import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const editor = readFileSync(new URL('../src/features/library/booklist-requirements.tsx', import.meta.url), 'utf8');

test('a completed save only closes the editor it was submitted from', () => {
  // The submitted requirement is captured at submit time and compared with the
  // currently open editor before closing, so a refresh cannot discard a draft
  // the user opened while the previous save was still pending.
  assert.match(editor, /submittedTitleIdRef\.current = editingTitleId/);
  assert.match(editor, /submittedTitleIdRef\.current === editingTitleIdRef\.current/);
  assert.match(editor, /if \(submittedTitleIdRef\.current === editingTitleIdRef\.current\) queueMicrotask\(\(\) => setEditing\(false\)\)/);
  assert.match(editor, /useEffect\(\(\) => \{ editingTitleIdRef\.current = editingTitleId; \}, \[editingTitleId\]\)/);
});

test('editor switching is disabled while a save is pending', () => {
  assert.match(editor, /disabled=\{savePending\} onClick=\{\(\) => editing \? setEditing\(false\) : edit\(\)\}/);
  assert.match(editor, /disabled=\{savePending\} onClick=\{\(\) => edit\(item\)\}/);
  assert.match(editor, /disabled=\{savePending\} onClick=\{\(\) => setConfirmRemoveId\(item\.id\)\}/);
});
