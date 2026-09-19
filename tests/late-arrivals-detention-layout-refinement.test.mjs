import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const planner = await readFile(
  new URL('../src/features/late-arrivals/detention-planner.tsx', import.meta.url),
  'utf8',
);

function between(start, end) {
  const from = planner.indexOf(start);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  const to = planner.indexOf(end, from);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return planner.slice(from, to);
}

test('top detention planning stepper keeps the full three-step sequence', () => {
  const stepper = between(
    'aria-label="Detention planning steps"',
    '<div className="mb-5 rounded-[var(--radius-md)]',
  );

  assert.match(stepper, /<StepBadge number=\{1\} label="Session" \/>/);
  assert.match(stepper, /<StepBadge number=\{2\} label="Supervisors" \/>/);
  assert.match(stepper, /<StepBadge number=\{3\} label="Allocate learners" \/>/);
});

test('create-session form starts directly with Plan a detention date and has no duplicate Session badge', () => {
  const createForm = between(
    '<form action={createAction}',
    '<div>\n                <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Upcoming dates</h3>',
  );

  assert.match(createForm, /<h3 className="text-sm font-semibold">Plan a detention date<\/h3>/);
  assert.doesNotMatch(createForm, /<StepBadge number=\{1\} label="Session" \/>/);
  assert.match(createForm, /<DateField label="Detention date"/);
  assert.match(createForm, /<TimeField label="Starts at"/);
  assert.match(createForm, /<TimeField label="Ends at"/);
});

test('detention-cycle control wiring and save action remain unchanged', () => {
  const cycle = between(
    '<h3 className="text-sm font-semibold">Detention cycle</h3>',
    '<div className="grid gap-5 xl:grid-cols-',
  );

  assert.match(cycle, /<form action=\{cycleAction\}/);
  assert.match(cycle, /name="schoolId" value=\{schoolId\}/);
  assert.match(cycle, /name="scheduleMode" value=\{cycleMode\}/);
  assert.match(cycle, /name="weekdays" value=\{day\}/);
  assert.match(cycle, /setCycleMode\("configured_days"\)/);
  assert.match(cycle, /setCycleMode\("manual"\)/);
  assert.match(cycle, /setCycleDays/);
  assert.match(cycle, /loading=\{cyclePending\}/);
  assert.match(cycle, /disabled=\{cycleMode === "configured_days" && cycleDays.length === 0\}/);
  assert.match(cycle, /Save detention cycle/);
});

test('detention-cycle layout stacks on mobile and uses a two-part responsive grid without overflow-prone controls', () => {
  const cycle = between(
    '<div className="mb-5 rounded-[var(--radius-md)]',
    '<div className="grid gap-5 xl:grid-cols-',
  );

  assert.match(cycle, /grid gap-4 md:grid-cols-\[minmax\(0,0\.8fr\)_minmax\(0,1\.2fr\)\]/);
  assert.match(cycle, /<form action=\{cycleAction\} className="min-w-0">/);
  assert.match(cycle, /grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7/);
  assert.match(cycle, /min-h-10 min-w-0 rounded-\[var\(--radius-xs\)\]/);
  assert.doesNotMatch(cycle, /overflow-x|whitespace-nowrap|w-\[[0-9]+px\]/);
});
