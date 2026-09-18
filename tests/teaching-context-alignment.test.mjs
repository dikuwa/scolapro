import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const workspace = await read('src/features/teaching/teaching-workspace.tsx');
const fieldLayout = await read('src/components/ui/form-field-layout.tsx');

test('teaching context bar uses the shared mixed-field alignment contract', () => {
  assert.match(
    workspace,
    /FormFieldFeedback, formFieldControlOffsetClass, formFieldLabelClass, formRowAlignClass/,
  );
  assert.match(
    workspace,
    /grid gap-3 sm:grid-cols-2 xl:grid-cols-4 \$\{formRowAlignClass\}/,
  );
  assert.doesNotMatch(
    workspace,
    /Teaching context[\s\S]{0,2500}(?:items-end|justify-end|translate-y|-translate|mt-\[|-mt-)/,
  );

  assert.match(fieldLayout, /export const formFieldLabelClass = "block h-4 text-xs font-medium leading-4"/);
  assert.match(fieldLayout, /export const formFieldControlOffsetClass = "mt-1\.5"/);
  assert.match(fieldLayout, /export const formRowAlignClass = "items-start"/);
});

test('term status is a deliberate fourth field with aligned control and feedback reserve', () => {
  const context = workspace.match(
    /<section aria-label="Teaching context"[\s\S]*?<\/section>/,
  )?.[0];

  assert.ok(context, 'Teaching context section must exist');
  assert.match(context, /<p className=\{formFieldLabelClass\}>Term status<\/p>/);
  assert.match(context, /<div className=\{formFieldControlOffsetClass\}>/);
  assert.match(
    context,
    /flex min-h-10 min-w-0 items-center rounded-\[var\(--radius-sm\)\]/,
  );
  assert.match(context, /<FormFieldFeedback[\s\S]*?helper=\{<>Week of /);
});

test('term status preserves honest no-term semantics and responsive stacking', () => {
  const context = workspace.match(
    /<section aria-label="Teaching context"[\s\S]*?<\/section>/,
  )?.[0];

  assert.ok(context, 'Teaching context section must exist');
  assert.match(context, /"No term context configured yet\."/);
  assert.match(context, /sm:grid-cols-2/);
  assert.match(context, /xl:grid-cols-4/);
  assert.doesNotMatch(context, /currentTerm \? .*Term 1|fallback term|default term/i);
  assert.match(context, /<DateField label="Week of" name="plannerWeek" value=\{anchorDate\} onChange=\{setAnchorDate\} \/>/);
});
