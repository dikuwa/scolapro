import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

const coverageAction   = source('features/teaching/server/coverage-actions.ts');
const coverageQueries  = source('features/teaching/server/coverage-queries.ts');
const coverageWorkspace = source('features/teaching/coverage-workspace.tsx');
const coveragePage     = source('app/teaching/coverage/page.tsx');
const coverageLoading  = source('app/teaching/coverage/loading.tsx');
const coverageError    = source('app/teaching/coverage/error.tsx');

// ---------------------------------------------------------------------------
// Route structure
// ---------------------------------------------------------------------------

test('coverage route exists and requires authentication before loading data', () => {
  assert.match(coveragePage, /redirect\(["'`]\/login\?next=\/teaching\/coverage["'`]\)/,
    'unauthenticated visitors must be redirected to login');
  assert.match(coveragePage, /context\.platformMemberships\.length.*redirect/s,
    'platform roles must be excluded before loading data');
  assert.match(coveragePage, /getCoverageWorkspace/,
    'page must load workspace data');
  assert.match(coveragePage, /TeachingCoverageWorkspace/,
    'page must render the coverage workspace component');
  assert.match(coveragePage, /getGovernedAcademicYear/,
    'coverage must use the same governed academic year as canonical teaching planning');
  assert.doesNotMatch(coveragePage, /new Date\(\)\.getFullYear\(\)/,
    'coverage must not infer the school academic year from the wall clock');
});

test('coverage route uses force-dynamic so actuals are always fresh', () => {
  assert.match(coveragePage, /export const dynamic\s*=\s*["']force-dynamic["']/,
    'coverage page must be force-dynamic to prevent stale actuals');
});

test('coverage route denies platform roles before loading school data', () => {
  // Use the runtime guard position vs the await call (not the import statement).
  const platformCheck = coveragePage.indexOf('platformMemberships.length');
  const dataLoad = coveragePage.indexOf('await getCoverageWorkspace');
  assert.ok(platformCheck > -1, 'page must check platformMemberships.length');
  assert.ok(dataLoad > -1, 'page must await getCoverageWorkspace');
  assert.ok(platformCheck < dataLoad,
    'platform membership exclusion must come before the awaited data loading call');
});

test('coverage route restricts canRecord to teacher and class_teacher only', () => {
  assert.match(coveragePage, /RECORDER_ROLES.*Set.*\[.*teacher.*class_teacher.*\]/s,
    'only teacher and class_teacher should have write access');
  assert.match(coveragePage, /canRecord.*RECORDER_ROLES\.has/,
    'canRecord flag must derive from RECORDER_ROLES');
  assert.doesNotMatch(coveragePage, /RECORDER_ROLES.*hod/,
    'hod must not be in RECORDER_ROLES — HOD visibility must not imply write authority');
  assert.doesNotMatch(coveragePage, /RECORDER_ROLES.*school_admin/,
    'school_admin must not be in RECORDER_ROLES');
});

test('coverage route passes canRecord=false to workspace for leadership roles', () => {
  assert.match(coveragePage, /canRecord/,
    'canRecord prop must be passed to workspace');
  assert.match(coverageWorkspace, /canRecord.*false|!canRecord/s,
    'workspace must respect canRecord=false for read-only rendering');
});

// ---------------------------------------------------------------------------
// Server action — recordTeachingActual
// ---------------------------------------------------------------------------

test('coverage action is a server action module', () => {
  assert.match(coverageAction, /^["']use server["']/,
    'coverage-actions.ts must declare "use server"');
});

test('coverage action exports recordTeachingActual', () => {
  assert.match(coverageAction, /export async function recordTeachingActual/,
    'recordTeachingActual must be exported');
});

test('coverage action validates all required fields with zod', () => {
  assert.match(coverageAction, /z\.object/,
    'action must use zod for input validation');
  assert.match(coverageAction, /scheduleItemId.*uuid/s,
    'scheduleItemId must be validated as UUID');
  assert.match(coverageAction, /taughtOn/,
    'taughtOn must be validated');
  assert.match(coverageAction, /periodsUsed/,
    'periodsUsed must be validated');
  assert.match(coverageAction, /coverageState.*enum/s,
    'coverageState must be validated as enum');
});

test('coverage action validates all six canonical coverage states', () => {
  const states = ['not_started', 'started', 'partially_taught', 'taught', 'reinforcement_needed', 'assessed'];
  for (const state of states) {
    assert.match(coverageAction, new RegExp(state),
      `coverage state "${state}" must be present in the action`);
  }
});

test('coverage action excludes platform roles before the idempotent database mutation', () => {
  const platformCheck = coverageAction.indexOf('platformMemberships');
  const rpcIdx = coverageAction.indexOf('record_teaching_actual_idempotent');
  assert.ok(platformCheck > -1, 'action must check platformMemberships');
  assert.ok(rpcIdx > -1, 'action must call the governed idempotent RPC');
  assert.ok(platformCheck < rpcIdx,
    'platform membership exclusion must come before the database mutation');
});

test('coverage action verifies schedule item visibility before the idempotent mutation', () => {
  const itemLookup = coverageAction.indexOf('teaching_schedule_items');
  const rpcIdx = coverageAction.indexOf('record_teaching_actual_idempotent');
  assert.ok(itemLookup > -1, 'action must query teaching_schedule_items');
  assert.ok(itemLookup < rpcIdx,
    'schedule item lookup must precede the governed RPC');
});

test('coverage action delegates append-only teaching_actual provenance to the idempotent RPC', () => {
  assert.match(coverageAction, /record_teaching_actual_idempotent/,
    'action must use the idempotent teaching actual RPC');
  assert.match(coverageAction, /p_client_operation_id: parsed\.data\.clientMutationId/,
    'client operation identity must reach the server contract');
});

test('coverage action does not attempt UPDATE or DELETE on teaching_actuals', () => {
  assert.doesNotMatch(coverageAction, /\.update\s*\(/,
    'actuals are append-only; action must not call .update()');
  assert.doesNotMatch(coverageAction, /\.delete\s*\(/,
    'actuals are append-only; action must not call .delete()');
  assert.doesNotMatch(coverageAction, /ON CONFLICT DO UPDATE|on conflict do update/i,
    'no upsert path — historical actuals must not be silently overwritten');
});

test('coverage action revalidates /teaching/coverage after successful insert', () => {
  assert.match(coverageAction, /revalidatePath\(["'`]\/teaching\/coverage["'`]\)/,
    'action must revalidate /teaching/coverage on success');
});

test('coverage action does not modify teaching_schedule_items', () => {
  // Only reads the schedule item; never mutates it.
  const allScheduleRefs = [...coverageAction.matchAll(/teaching_schedule_items/g)];
  for (const match of allScheduleRefs) {
    const context = coverageAction.slice(Math.max(0, match.index - 60), match.index + 80);
    assert.doesNotMatch(context, /\.update|\.delete|\.upsert/,
      'teaching_schedule_items must never be mutated by the coverage action');
  }
});

test('coverage action does not touch lesson_preparations', () => {
  assert.doesNotMatch(coverageAction, /lesson_preparations/,
    'coverage action must not reference lesson_preparations — planned teaching stays separate');
});

test('coverage action carries no service-role or admin client bypass', () => {
  assert.doesNotMatch(coverageAction, /service_role|serviceRole|SUPABASE_SERVICE_KEY/,
    'coverage action must not use a service-role bypass');
  assert.doesNotMatch(coverageAction, /admin.*client|createAdminClient|createServiceClient/i,
    'coverage action must not use an admin client');
});

// ---------------------------------------------------------------------------
// Query helper
// ---------------------------------------------------------------------------

test('coverage query reads teaching_schedule_items under existing RLS boundary', () => {
  assert.match(coverageQueries, /teaching_schedule_items/,
    'query must read teaching_schedule_items');
  assert.doesNotMatch(coverageQueries, /service_role|serviceRole/,
    'query must not bypass RLS with a service-role client');
});

test('coverage query reads teaching_actuals without a new RPC', () => {
  assert.match(coverageQueries, /teaching_actuals/,
    'query must read teaching_actuals');
  assert.doesNotMatch(coverageQueries, /\.rpc\(/,
    'no custom RPC should be needed — direct table read under existing RLS is sufficient');
});

test('coverage query does not read sensitive learner or disciplinary data', () => {
  const sensitivePatterns = [
    /learner_profiles/,
    /health_records/,
    /disciplinary/,
    /guardian_relationships/,
    /crc_custody/,
  ];
  for (const pattern of sensitivePatterns) {
    assert.doesNotMatch(coverageQueries, pattern,
      `coverage query must not read sensitive learner data (${pattern})`);
  }
});

// ---------------------------------------------------------------------------
// Workspace component — client rules
// ---------------------------------------------------------------------------

test('coverage workspace is a client component', () => {
  assert.match(coverageWorkspace, /^["']use client["']/,
    'coverage-workspace.tsx must declare "use client"');
});

test('coverage workspace uses useActionState for the record form', () => {
  assert.match(coverageWorkspace, /useActionState/,
    'workspace must use useActionState for the server action form');
});

test('coverage workspace shows pending state during submission', () => {
  assert.match(coverageWorkspace, /pending/,
    'workspace must show a pending/loading state while the action is in flight');
  assert.match(coverageWorkspace, /aria-busy/,
    'form submit button must carry aria-busy for accessibility');
});

test('coverage workspace does not expose a native select, radio or checkbox for coverage state', () => {
  // Coverage state must use the shared Picker, not a native <select>.
  assert.doesNotMatch(coverageWorkspace, /<select[\s>]/,
    'coverage state must not use a native <select>');
  assert.match(coverageWorkspace, /Picker/,
    'coverage state must use the shared Picker component');
});

test('coverage workspace does not expose a native date input', () => {
  // Taught-on date must use the shared DateField.
  assert.doesNotMatch(coverageWorkspace, /type=["']date["']/,
    'coverage workspace must not expose a native date input');
  assert.match(coverageWorkspace, /DateField/,
    'coverage workspace must use the shared DateField component');
});

test('coverage workspace renders read-only for canRecord=false', () => {
  assert.match(coverageWorkspace, /canRecord/,
    'workspace must accept and use the canRecord prop');
  assert.doesNotMatch(coverageWorkspace, /canRecord.*=.*true/,
    'workspace must not hardcode canRecord=true');
});

test('coverage workspace shows toast feedback after action', () => {
  assert.match(coverageWorkspace, /toast\./,
    'workspace must use toast for success/error feedback');
  assert.match(coverageWorkspace, /toast\.success/,
    'workspace must show a success toast on successful record');
  assert.match(coverageWorkspace, /toast\.error/,
    'workspace must show an error toast on failure');
});

test('coverage workspace does not rewrite or mutate schedule items visually', () => {
  // The display of planned_on, planned_period_count stays read-only.
  assert.doesNotMatch(coverageWorkspace, /setPlannedOn|setPlannedPeriod/,
    'planned schedule values must not be editable state');
});

test('coverage workspace handles empty allocations state honestly', () => {
  assert.match(coverageWorkspace, /allocations\.length/,
    'workspace must check for empty allocations');
  assert.match(coverageWorkspace, /No teaching allocations/,
    'workspace must show an explicit message when no allocations are found');
});

test('coverage workspace has a mobile-friendly list layout without horizontal overflow', () => {
  assert.doesNotMatch(coverageWorkspace, /overflow-x-auto|overflow-x: auto/,
    'schedule item list must not introduce horizontal scroll');
  assert.match(coverageWorkspace, /sm:flex-row|flex-col/,
    'layout must stack vertically on mobile and row on wider screens');
});

// ---------------------------------------------------------------------------
// No surveillance score / ranking
// ---------------------------------------------------------------------------

test('no surveillance score, percentage grade or ranking is computed', () => {
  const modules = [coverageAction, coverageQueries, coverageWorkspace, coveragePage];
  const forbidden = [
    /score\s*[:=]/i,
    /ranking\s*[:=]/i,
    /performance.*grade/i,
    /teacher.*rating/i,
    /league.*table/i,
  ];
  for (const text of modules) {
    for (const pattern of forbidden) {
      assert.doesNotMatch(text, pattern,
        `coverage modules must not compute surveillance scores or rankings (${pattern})`);
    }
  }
});

// ---------------------------------------------------------------------------
// Loading and error boundaries
// ---------------------------------------------------------------------------

test('coverage loading skeleton uses aria-busy and aria-label', () => {
  assert.match(coverageLoading, /aria-busy/,
    'loading skeleton must carry aria-busy');
  assert.match(coverageLoading, /aria-label/,
    'loading skeleton must carry aria-label for screen readers');
});

test('coverage error boundary exports a default client component with reset', () => {
  assert.match(coverageError, /["']use client["']/,
    'error.tsx must be a client component');
  assert.match(coverageError, /reset\s*\(/,
    'error boundary must call reset() to retry');
  assert.match(coverageError, /ArrowLeft|href=["']\/teaching["']/,
    'error boundary must provide a back link to /teaching');
});
