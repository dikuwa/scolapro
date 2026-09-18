import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

const dailyAction = source('features/attendance/server/actions.ts');
const weeklyAction = source('features/attendance/server/week-actions.ts');
const subjectAction = source('features/attendance/server/subject-actions.ts');
const absenceReviewsPage = source('app/school/absence-reviews/page.tsx');
const absenceReviewsWorkspace = source('features/attendance/server/absence-review-workspace.ts');

// Register submissions write the same authoritative daily/subject attendance
// records that the absence review workspace reads. Every dependent route must
// therefore be invalidated by the mutation itself, not by a client-side reload.
const ABSENCE_REVIEW_PATH = 'revalidatePath("/school/absence-reviews")';

const functionBody = (moduleSource, declaration) => {
  const body = moduleSource.split(declaration)[1];
  assert.ok(body, `expected ${declaration} in the module under test`);
  return body;
};

const dailyBody = functionBody(dailyAction, 'export async function submitDailyRegister');
const weeklyBody = functionBody(weeklyAction, 'export async function submitWeeklyRegister');
const subjectBody = functionBody(subjectAction, 'export async function submitSubjectAttendance');

const clientModules = {
  'features/attendance/daily-register.tsx': source('features/attendance/daily-register.tsx'),
  'features/attendance/weekly-register.tsx': source('features/attendance/weekly-register.tsx'),
  'features/attendance/subject-period-register.tsx': source('features/attendance/subject-period-register.tsx'),
  'features/attendance/absence-review-workspace.tsx': source('features/attendance/absence-review-workspace.tsx'),
  'app/school/absence-reviews/page.tsx': absenceReviewsPage,
};

const serverModules = {
  'features/attendance/server/actions.ts': dailyAction,
  'features/attendance/server/week-actions.ts': weeklyAction,
  'features/attendance/server/subject-actions.ts': subjectAction,
};

test('daily register submission invalidates the absence review route', () => {
  assert.ok(dailyBody.includes(ABSENCE_REVIEW_PATH), 'submitDailyRegister must invalidate /school/absence-reviews');
});

test('weekly register submission invalidates the absence review route', () => {
  assert.ok(weeklyBody.includes(ABSENCE_REVIEW_PATH), 'submitWeeklyRegister must invalidate /school/absence-reviews');
});

test('subject-period submission invalidates the absence review route', () => {
  assert.ok(subjectBody.includes(ABSENCE_REVIEW_PATH), 'submitSubjectAttendance must invalidate /school/absence-reviews');
});

test('existing attendance route revalidation is preserved', () => {
  assert.match(dailyBody, /revalidatePath\("\/attendance"\)/);
  assert.match(dailyBody, /revalidatePath\("\/"\)/);
  assert.match(weeklyBody, /revalidatePath\("\/attendance"\)/);
  assert.match(weeklyBody, /revalidatePath\("\/"\)/);
  assert.match(subjectBody, /revalidatePath\(`\/attendance\/lesson\/\$\{parsed\.data\.slotId\}`\)/);
});

test('no hard reload, forced redirect, global no-store or force-dynamic workaround is used', () => {
  const modules = { ...clientModules, ...serverModules };
  for (const [name, text] of Object.entries(modules)) {
    assert.doesNotMatch(text, /location\.reload/, `${name} must not reload the document`);
    assert.doesNotMatch(text, /window\.location\s*=\s*/, `${name} must not assign window.location`);
    assert.doesNotMatch(text, /location\.href\s*=/, `${name} must not assign location.href`);
    assert.doesNotMatch(text, /force-dynamic/, `${name} must not force dynamic rendering`);
    assert.doesNotMatch(text, /cache:\s*"no-store"/, `${name} must not disable caching globally`);
    assert.doesNotMatch(text, /clearMarks|performance\.measure\s*=/, `${name} must not patch the Performance API`);
  }
  assert.doesNotMatch(absenceReviewsPage, /export const dynamic/, 'the absence review route must not be forced dynamic');
});

test('the fix is server-action revalidation, not a router-refresh-only workaround', () => {
  // Subject-period attendance previously had no refresh path at all. The
  // dependent route must be invalidated by the action, so the lesson register
  // must not gain a client-side refresh as the mechanism.
  assert.doesNotMatch(clientModules['features/attendance/subject-period-register.tsx'], /router\.refresh\(\)/);
  assert.doesNotMatch(absenceReviewsPage, /router\.refresh\(\)/);
  assert.doesNotMatch(clientModules['features/attendance/absence-review-workspace.tsx'], /router\.refresh\(\)/);
  for (const [name, text] of Object.entries(clientModules)) {
    assert.doesNotMatch(text, /revalidatePath/, `${name} is a client module and must not revalidate paths`);
  }
});

test('no database, RLS, RPC or service-role surface is touched by the fix', () => {
  for (const [name, text] of Object.entries(serverModules)) {
    assert.doesNotMatch(text, /lib\/supabase\/admin|SERVICE_ROLE/, `${name} must not use a service-role client`);
    assert.doesNotMatch(text, /create policy|drop policy|alter table|create or replace function|security definer|grant execute/i, `${name} must not carry schema or policy changes`);
  }
});

test('absence review authorization and current-school scope remain governed', () => {
  assert.match(absenceReviewsPage, /getAbsenceReviewWorkspace/);
  assert.match(absenceReviewsPage, /getUserContext/);
  assert.match(absenceReviewsWorkspace, /rpc\("resolve_absence_review_scope"/);
  assert.match(absenceReviewsWorkspace, /\.eq\("school_id", schoolId\)/);
});
