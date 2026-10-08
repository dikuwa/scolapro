import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dialog = readFileSync(new URL('../src/features/imports/import-discard-confirmation.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/app/school/imports/page.tsx', import.meta.url), 'utf8');

test('destructive import RPC form renders only after a deliberate confirmation', () => {
  assert.match(dialog, /const \[confirming, setConfirming\] = useState\(false\)/);
  assert.match(dialog, /if \(!confirming\)/);
  assert.match(dialog, /onClick=\{\(\) => setConfirming\(true\)\}/);
  assert.match(dialog, /<form action=\{discardImportBatch\}/);
  assert.match(dialog, /Yes, discard/);
  assert.match(dialog, /onClick=\{\(\) => setConfirming\(false\)\}/);
});

test('both bulk import cancel and start-over use the confirmation component', () => {
  assert.match(page, /canCancel \? <ImportDiscardConfirmation batchId=\{item\.id\}/);
  assert.match(page, /<ImportDiscardConfirmation batchId=\{batch\.id\} fileName=\{batch\.source_file_name\} label="Discard and start over"/);
  assert.doesNotMatch(page, /form action=\{discardImportBatch\}/);
});
