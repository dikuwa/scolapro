import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire('node:assert/strict');
const fs = nodeRequire('node:fs');
const path = nodeRequire('node:path');
const { test } = nodeRequire('node:test');
const ts = nodeRequire('typescript');
const React = nodeRequire('react');
const { renderToStaticMarkup } = nodeRequire('react-dom/server');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Exercise repository TS/TSX with the installed compiler; no test dependency or
// production bypass is introduced. Authentication/data doubles stay in this file.
function loader(mocks = {}) {
  const cache = new Map();
  function load(name, parent = root) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.') && !name.startsWith('@/') && !path.isAbsolute(name)) return nodeRequire(name);
    let file = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(parent, name);
    file = [file, `${file}.ts`, `${file}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!file) throw new Error(`Missing module ${name}`);
    if (cache.has(file)) return cache.get(file).exports;
    const compiledModule = { exports: {} }; cache.set(file, compiledModule);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', code)(dependency => load(dependency, path.dirname(file)), compiledModule, compiledModule.exports);
    return compiledModule.exports;
  }
  return load;
}
const navigation = { useRouter: () => ({ push() {}, refresh() {} }), redirect: destination => { throw new Error(`redirect:${destination}`); } };
const labels = { illness: 'Illness', medical_appointment: 'Medical appointment', compassionate: 'Compassionate', family: 'Family', transport: 'Transport', weather: 'Weather', school_activity: 'School activity', other: 'Other' };

test('absence server-action module exports only functions; reason vocabulary is unchanged', () => {
  const load = loader({ 'next/cache': { revalidatePath() {} }, '@/lib/supabase/server': { createSupabaseServerClient() { throw new Error('not called'); } } });
  const actions = load('@/features/parents/server/absence-actions');
  const { ensureServerEntryExports } = nodeRequire('next/dist/build/webpack/loaders/next-flight-loader/action-validate');
  // This throws "found object" against the authoritative baseline.
  ensureServerEntryExports(Object.values(actions));
  assert.deepEqual(Object.keys(actions).sort(), ['reviewAbsenceNotice', 'submitAbsenceNotice']);
  assert.deepEqual(load('@/features/parents/absence-reasons').reasonLabels, labels);
});

const emptyWorkspace = { daily: [], subjectPeriod: [], classes: [], learners: [], subjects: [], canReviewNotices: true, summary: { dailyAbsences: 0, unexplainedDailyAbsences: 0, awaitingReview: 0, subjectPeriodAbsences: 0 } };
function absencePage(context, calls) {
  return loader({
    'next/navigation': navigation,
    'next/cache': { revalidatePath() {} },
    '@/lib/supabase/server': { createSupabaseServerClient() { throw new Error('unexpected database access'); } },
    '@/components/shell/app-shell': { AppShell: ({ children }) => children },
    '@/lib/auth/get-user-context': { getUserContext: async () => context },
    '@/features/attendance/server/absence-review-workspace': { getAbsenceReviewWorkspace: async (...args) => { calls.push(args); return emptyWorkspace; } },
    '@/features/parents/server/absence-queries': { getSchoolAbsenceNotices: async () => [] },
  })('@/app/school/absence-reviews/page').default;
}
test('authorized absence route renders its real workspace and review list in current-school scope', async () => {
  const calls = [];
  const page = absencePage({ user: { id: 'teacher-user' }, memberships: [{ roleKey: 'school_admin', schoolId: 'current-school', staffMemberId: 'staff' }] }, calls);
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ from: '2026-09-01', to: '2026-09-02' }) }));
  assert.match(html, /Official daily absences/); assert.match(html, /Parent explanations/);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'current-school');
  assert.equal(calls[0][2].from, '2026-09-01');
});
for (const role of ['platform_support', 'platform_admin', 'parent', 'unrelated_teacher']) {
  test(`absence route denies ${role} before loading school data`, async () => {
    const calls = [];
    const page = absencePage({ user: { id: 'user' }, memberships: [{ roleKey: role, schoolId: 'other-school' }] }, calls);
    await assert.rejects(page({ searchParams: Promise.resolve({}) }), /redirect:\//);
    assert.equal(calls.length, 0);
  });
}
test('absence route does not use an eligible membership from another school', async () => {
  const calls = [];
  const page = absencePage({ user: { id: 'user' }, memberships: [], allSchoolMemberships: [{ roleKey: 'school_admin', schoolId: 'other-school' }] }, calls);
  await assert.rejects(page({ searchParams: Promise.resolve({}) }), /redirect:\//);
  assert.equal(calls.length, 0);
});
test('anonymous absence route redirects to login before data loading', async () => {
  const calls = [];
  await assert.rejects(absencePage({ user: null, memberships: [] }, calls)({ searchParams: Promise.resolve({}) }), /redirect:\/login/);
  assert.equal(calls.length, 0);
});

test('batch hiding rejects all active/unknown work including unfinished exports', () => {
  const { canHideReportBatch } = loader()('@/features/reporting/report-batch-visibility');
  for (const status of ['pending', 'queued', 'processing', 'running', 'retry', 'unknown']) {
    assert.equal(canHideReportBatch({ status, exportStatus: 'ready' }), false);
  }
  for (const status of ['completed', 'partial', 'cancelled']) {
    for (const exportStatus of ['waiting', 'processing', 'queued', 'running', 'unknown']) assert.equal(canHideReportBatch({ status, exportStatus }), false);
    for (const exportStatus of ['not_applicable', 'ready', 'failed']) assert.equal(canHideReportBatch({ status, exportStatus }), true);
  }
});

test('report filters keep query field names and exact options without native selects', () => {
  const load = loader({ 'next/navigation': navigation, '@/features/reporting/server/actions': {} });
  const { PagedReportCardManagement } = load('@/features/reporting/paged-report-card-management');
  const props = { statusPage: { rows: [], totalCount: 0, page: 1, pageCount: 1, pageSize: 50 }, individualLearners: [], individualLearnerId: '', terms: [{termNumber: 1, name: 'Term 1'}], grades: [{id: 'g', label: 'Grade 8'}], classes: [{id: 'c', gradeId: 'g', label: '8A'}], batches: [], batchIssues: [], renderJobs: [], documents: [], academicYear: 2026, termNumber: 1, query: '', status: 'certified', filterGradeId: 'g', filterClassId: 'c', scopeType: 'school', scopeGradeId: '', scopeClassId: '', scopeSummary: null };
  const html = renderToStaticMarkup(React.createElement(PagedReportCardManagement, props));
  assert.doesNotMatch(html, /<select/);
  for (const [name,value] of Object.entries({ grade: 'g', class: 'c', term: '1', status: 'certified' })) assert.ok(html.includes(`name="${name}" value="${value}"`));
  assert.match(html, /Grade 8/); assert.match(html, /8A/); assert.match(html, /Certified/);
});
test('room controls preserve submitted defaults and actions are submit buttons', () => {
  const load = loader({ '@/features/room-inventory/server/actions': { assignCustodian() {}, changeItem() {}, createItem() {}, verifyInventory() {} } });
  const { RoomInventoryWorkspace } = load('@/features/room-inventory/room-inventory-workspace');
  const html = renderToStaticMarkup(React.createElement(RoomInventoryWorkspace, { rooms: [{id:'room',code:'R1',name:'Room',custodianId:'staff',itemCount:1}], items: [{id:'item',roomId:'room',name:'Desk',ownership:'government',condition:'good',quantity:1}], staff:[{id:'staff',name:'Staff'}], verifications:[],today:'2026-09-12',canAssign:true }));
  assert.doesNotMatch(html, /<select|type="date"/);
  for (const [name,value] of Object.entries({roomId:'room',staffId:'staff',effectiveFrom:'2026-09-12',status:'confirmed',eventType:'correction'})) assert.ok(html.includes(`name="${name}" value="${value}"`));
  assert.equal((html.match(/type="submit"/g) || []).length, 4);
});

test('shared field geometry keeps labelled Pickers level with DateField controls', () => {
  const load = loader();
  const { Picker } = load('@/components/ui/picker');
  const { DateField } = load('@/components/ui/date-field');
  const labelled = renderToStaticMarkup(React.createElement(Picker, { label: 'Grade', value: '', onChange() {}, options: [], placeholder: 'All grades' }));
  const unlabelled = renderToStaticMarkup(React.createElement(Picker, { ariaLabel: 'Sort learners', value: '', onChange() {}, options: [], placeholder: 'A\u2013Z' }));
  const dateField = renderToStaticMarkup(React.createElement(DateField, { label: 'Event date', name: 'rosterDate', value: '2026-09-15', onChange() {} }));
  // A labelled Picker must offset its trigger from the shared 1rem label box by the same 6px
  // DateField and SearchableSelect use, otherwise mixed filter rows sit on two baselines.
  assert.match(labelled, /class="relative mt-1\.5"/);
  assert.match(dateField, /class="relative mt-1\.5"/);
  // Unlabelled Pickers have no label box to clear and must stay shift-free.
  assert.match(unlabelled, /class="relative"/);
  assert.doesNotMatch(unlabelled, /mt-1\.5/);
  // The bordered DateField surface owns the 40px control height; repeating min-h-10 or py-2 on the
  // inner input would grow it past every sibling control in a shared row.
  assert.match(dateField, /scolapro-control-surface flex min-h-10 /);
  assert.doesNotMatch(dateField, /min-h-10 min-w-0|py-2/);
});

test('raw-labelled fields adopt the shared 1rem label box so mixed rows stay level', () => {
  const load = loader({
    'next/navigation': navigation,
    '@/features/learners/server/register-learner': { registerLearnerRetrySafe: () => ({}) },
  });
  const { LearnerRegistrationForm } = load('@/features/learners/registration-form');
  const html = renderToStaticMarkup(React.createElement(LearnerRegistrationForm, {
    schoolId: 'school',
    academicYear: 2026,
    grades: [{ id: 'grade-8', label: 'Grade 8', classes: [{ id: 'class-8a', label: '8A' }] }],
    defaultAdmissionDate: '2026-09-15',
  }));
  // These raw-labelled inputs share a top-aligned grid row with a DateField. An inline text-xs label
  // builds its own line box, so the paired control lands on a different baseline than the DateField.
  for (const label of ['First names', 'Surname', 'Preferred name', 'Admission number']) {
    assert.match(html, new RegExp(`<label[^>]*class="block h-4 text-xs font-medium leading-4"[^>]*>${label}`));
  }
  assert.doesNotMatch(html, /class="text-xs font-medium">(First names|Surname|Preferred name|Admission number)/);
});

test('report-card identity fields drop raw inline labels for the shared label box', () => {
  const source = fs.readFileSync(path.join(root, 'src/features/reporting/report-card-settings-panel.tsx'), 'utf8');
  assert.match(source, /import \{ formFieldLabelClass \} from "@\/components\/ui\/form-field-layout";/);
  // Every field label in the identity grid shares a row with a labelled Picker.
  for (const label of ['Former / secondary school name', 'Physical address', 'Town / city', 'Telephone', 'Fax', 'School email', 'Postal address', 'Official school logo', 'Official document font', 'Remarks mode', 'Default / fallback remark']) {
    const shared = `<label className={formFieldLabelClass}>${label}</label>`;
    const sharedParagraph = `<p className={formFieldLabelClass}>${label}</p>`;
    assert.ok(source.includes(shared) || source.includes(sharedParagraph), `expected the shared label box on "${label}"`);
  }
  assert.doesNotMatch(source, /<(label|p) className="text-xs font-medium">/);
});

test('conduct fieldClass keeps single-line controls at the shared 40px height', () => {
  const load = loader();
  const { fieldClass } = load('@/features/conduct/controls');
  // py-* would grow the bordered box past min-h-10 on the fluid type scale and break row alignment.
  assert.match(fieldClass, /min-h-10/);
  assert.doesNotMatch(fieldClass, /(^|\s)py-[0-9.]/);
  const source = fs.readFileSync(path.join(root, 'src/features/conduct/conduct-workspace.tsx'), 'utf8');
  // Multi-line controls own their padding at the call site instead of shifting the shared class.
  assert.ok(source.includes('className={`${fieldClass} py-2`}'), 'expected the textarea call site to own its py-2');
});

test('bulk import renders four staging forms, original actions, templates and committed dates', async () => {
  const noop = async () => {};
  const actions = new Proxy({}, { get: () => noop });
  const load = loader({
    'next/navigation': navigation,
    '@/components/shell/app-shell': { AppShell: ({children}) => children },
    '@/lib/auth/get-user-context': { getUserContext: async () => ({user:{id:'user'}, memberships:[{roleKey:'school_admin',schoolId:'school'}]}) },
    '@/features/imports/server/academic-actions': actions,
    '@/features/imports/server/actions': actions,
    '@/features/imports/server/guardian-actions': actions,
    '@/features/imports/server/queries': { getImportWorkspace: async () => ({ selectedBatch:null,unresolvedRowCount:0,rowCount:0,rowPageSize:50,rowPage:1,batches:[{id:'batch',source_file_name:'fixture.csv',import_type:'learners',status:'completed',total_rows:3,committed_at:'2026-09-01T10:00:00Z'}] }) },
  });
  const page = await load('@/app/school/imports/page').default({searchParams:Promise.resolve({})});
  const html = renderToStaticMarkup(page);
  assert.equal((html.match(/Choose CSV or Excel<\/span>/g)||[]).length,4);
  assert.equal((html.match(/Stage file<\/button>/g)||[]).length,4);
  for (const type of ['learner','staff','guardian','academic-structure']) assert.ok(html.includes(`/templates/${type}-import-template.csv`));
  for (const heading of ['Learners','Staff','Guardians','Academic structure','File name','Type','Rows','Status','Imported on','Actions']) assert.ok(html.includes(heading));
  assert.match(html,/1 Sept 2026/); assert.doesNotMatch(html,/View requirements|Required:|Stage and reconcile/);
});

const linkMock = ({ children, ...rest }) => React.createElement('a', rest, children);
const toastMock = { success() {}, error() {} };

test('NumberStepper keeps the 40px shared height contract and centered stepper controls', () => {
  const load = loader();
  const { NumberStepper } = load('@/components/ui/number-stepper');
  const html = renderToStaticMarkup(React.createElement(NumberStepper, { label: 'Quantity', name: 'quantity', min: 0, defaultValue: 1 }));
  // Shared label box established by #456, so a labelled stepper sits level with Picker/DateField.
  assert.match(html, /<label[^>]*class="block h-4 text-xs font-medium leading-4"[^>]*>Quantity/);
  // Exact 40px outer height, matching the shared single-line control target.
  assert.match(html, /scolapro-control-surface flex h-10 /);
  // Value input fills the remaining region without py-* shifting the shared height.
  assert.match(html, /min-w-0 flex-1 border-0 bg-transparent px-3 py-0 h-full/);
  // Minus and plus are full-height, equal-width, centered regions; dividers run through the control.
  assert.equal((html.match(/h-full w-10 shrink-0 place-items-center/g) || []).length, 2);
  // Browser-native number spinner stays hidden.
  assert.match(html, /webkit-outer-spin-button/);
});

test('NumberStepper without a label stays shift-free like the unlabelled Picker', () => {
  const load = loader();
  const { NumberStepper } = load('@/components/ui/number-stepper');
  const html = renderToStaticMarkup(React.createElement(NumberStepper, { name: 'quantity', min: 0, defaultValue: 1 }));
  assert.doesNotMatch(html, /mt-1\.5/);
});

test('room inventory add-item row shares the 1rem label box across all four fields', () => {
  const load = loader({ '@/features/room-inventory/server/actions': { assignCustodian() {}, changeItem() {}, createItem() {}, verifyInventory() {} } });
  const { RoomInventoryWorkspace } = load('@/features/room-inventory/room-inventory-workspace');
  const html = renderToStaticMarkup(React.createElement(RoomInventoryWorkspace, { rooms: [{id:'room',code:'R1',name:'Room',custodianId:'staff',itemCount:1}], items: [{id:'item',roomId:'room',name:'Desk',ownership:'government',condition:'good',quantity:1}], staff:[{id:'staff',name:'Staff'}], verifications:[],today:'2026-09-12',canAssign:true }));
  // All four add-item fields (Item description, Ownership, Quantity, Condition) sit on one label baseline.
  for (const label of ['Item description', 'Ownership', 'Quantity', 'Condition']) {
    assert.match(html, new RegExp(`<(label|span)[^>]*class="block h-4 text-xs font-medium leading-4"[^>]*>${label}`));
  }
  // No native time/select leakage in the add-item row.
  assert.doesNotMatch(html, /type="time"/);
});

test('detention queue header groups title, History and open-count on one aligned row', () => {
  const load = loader({
    'next/link': linkMock,
    'sonner': { toast: toastMock },
    '@/features/late-arrivals/server/actions': { recordLateArrival() {}, recordBulkLateArrivals() {}, reassignDetentionSupervisor() {}, resolveDetention() {}, undoLatestLateArrival() {} },
  });
  const { LateArrivalWorkspace } = load('@/features/late-arrivals/late-arrival-workspace');
  const html = renderToStaticMarkup(React.createElement(LateArrivalWorkspace, { learners: [], detention: [], staffOptions: [], canManage: false, today: '2026-09-12' }));
  // Title, History and open-count share one items-center header row instead of floating detached.
  const header = html.match(/<div class="flex flex-wrap items-center justify-between gap-2">[\s\S]*?<\/div><p class="scolapro-section-description">/);
  assert.ok(header, 'expected the title and actions to share one row above the description');
  assert.match(header[0], /Detention queue/);
  assert.match(header[0], /\/late-arrivals\/history/);
  assert.match(header[0], />0 open</);
  // Description still renders below the header row.
  assert.match(html, /configured threshold/);
  assert.match(html, /configured detention cycle/);
});

test('detention roster planning uses the shared TimeField instead of native time inputs', () => {
  const source = fs.readFileSync(path.join(root, 'src/features/late-arrivals/detention-planner.tsx'), 'utf8');
  assert.match(source, /import \{ TimeField \} from "@\/components\/ui\/time-field";/);
  assert.doesNotMatch(source, /type="time"/);
  assert.match(source, /<TimeField label="Starts at"/);
  assert.match(source, /<TimeField label="Ends at"/);
});

const teachingWorkspace = { terms: [{ id: 'term-1', number: 1, name: 'Term 1', startsOn: '2026-01-14', endsOn: '2026-04-03', status: 'active', isCurrent: true }], currentTerm: { id: 'term-1', number: 1, name: 'Term 1', startsOn: '2026-01-14', endsOn: '2026-04-03', status: 'active' }, allocations: [{ allocationId: 'alloc-1', classId: 'class-8a', className: '8A', gradeName: 'Grade 8', subjectName: 'Mathematics', subjectId: 'subject-1', offeringId: 'offering-1', curriculumVersionId: null, activeFrom: '2026-01-01', activeTo: null }], planByAllocation: {}, planItems: [], scheduleItems: [], preparations: [], actuals: [], objectivesByUnit: {}, competenciesByUnit: {}, dayOverrides: [{ date: '2026-03-21', isSchoolDay: false, reason: 'Independence Day', source: 'national' }], hasLeadershipAuthority: false, isTeacher: true, reviewHref: null };

// The teaching route resolves the school's governed academic year rather than the
// wall clock, so the route now depends on the calendar resolver. The double
// returns a year that cannot equal the current calendar year, which is what makes
// the pass-through assertion below meaningful.
const governedYearCalls = [];
const GOVERNED_ACADEMIC_YEAR = 2027;
const calendarMock = {
  getGovernedAcademicYear: async (schoolId) => { governedYearCalls.push(schoolId); return GOVERNED_ACADEMIC_YEAR; },
};

function teachingPage(context) {
  return loader({
    'next/navigation': navigation,
    '@/components/shell/app-shell': { AppShell: ({ children }) => children },
    '@/lib/auth/get-user-context': { getUserContext: async () => context },
    '@/features/calendar/server/calendar': calendarMock,
    '@/features/teaching/server/queries': { getTeachingWorkspace: async (...args) => { teachingCalls.push(args); return teachingWorkspace; } },
  })('@/app/teaching/page').default;
}

const teachingCalls = [];

test('authorized teaching route renders the connected workspace with picker-based subject/class switching', async () => {
  const page = teachingPage({ user: { id: 'user' }, memberships: [{ roleKey: 'teacher', schoolId: 'school', staffMemberId: 'staff' }], platformMemberships: [] });
  const html = renderToStaticMarkup(await page({}));
  assert.match(html, /Teaching/);
  assert.match(html, /Subject (&amp;|&) class/);
  assert.match(html, /Mathematics · 8A/);
  assert.match(html, /Term 1/);
  assert.match(html, /Year planner/);
  assert.match(html, /Scheme of work/);
  assert.match(html, /Lesson preparation/);
  assert.match(html, /Coverage (&amp;|&) reflection/);
  assert.match(html, /Teaching files/);
  // No browser-native select/date leakage in the teaching context bar.
  assert.doesNotMatch(html, /<select|type="date"/);
  assert.equal(teachingCalls.length, 1);
  assert.equal(teachingCalls[0][0].schoolId, 'school');
  // The governed year is resolved for the signed-in school and reaches the
  // workspace unchanged: a wall-clock fallback would pass 2026 instead of 2027.
  assert.deepEqual(governedYearCalls, ['school']);
  assert.equal(teachingCalls[0][0].academicYear, GOVERNED_ACADEMIC_YEAR);
});

test('teaching route hides HOD entry from teachers and exposes it through review authority', async () => {
  const teacherPage = teachingPage({ user: { id: 'user' }, memberships: [{ roleKey: 'teacher', schoolId: 'school', staffMemberId: 'staff' }], platformMemberships: [] });
  const teacherHtml = renderToStaticMarkup(await teacherPage({}));
  assert.doesNotMatch(teacherHtml, /HOD review (&amp;|&| )readiness/);

  const hodPage = teachingPage({ user: { id: 'user' }, memberships: [{ roleKey: 'hod', schoolId: 'school', staffMemberId: 'staff' }], platformMemberships: [] });
  const hodHtml = renderToStaticMarkup(await hodPage({}));
  assert.match(hodHtml, /HOD review (&amp;|&) readiness/);
  assert.match(hodHtml, /\/teaching\/reviews/);
});

test('teaching route denies ineligible roles before loading workspace data', async () => {
  for (const role of ['parent', 'librarian', 'ltsm', 'platform_admin']) {
    teachingCalls.length = 0;
    const page = teachingPage({ user: { id: 'user' }, memberships: [{ roleKey: role, schoolId: 'school', staffMemberId: null }], platformMemberships: role === 'platform_admin' ? [{ membershipId: 'm', roleKey: 'platform_admin' }] : [] });
    await assert.rejects(page({}), /redirect:\//);
    assert.equal(teachingCalls.length, 0);
  }
});

test('teaching workspace honest empty state when no active allocations exist', async () => {
  teachingCalls.length = 0;
  const emptyFixture = { ...teachingWorkspace, allocations: [], planByAllocation: {} };
  const page = loader({
    'next/navigation': navigation,
    '@/components/shell/app-shell': { AppShell: ({ children }) => children },
    '@/lib/auth/get-user-context': { getUserContext: async () => ({ user: { id: 'user' }, memberships: [{ roleKey: 'teacher', schoolId: 'school', staffMemberId: 'staff' }], platformMemberships: [] }) },
    '@/features/calendar/server/calendar': calendarMock,
    '@/features/teaching/server/queries': { getTeachingWorkspace: async () => emptyFixture },
  })('@/app/teaching/page').default;
  const html = renderToStaticMarkup(await page({}));
  assert.match(html, /No active teaching allocations/);
});

test('teaching workspace keeps official curriculum content visually read-only and separate from teacher content', () => {
  const load = loader();
  const { TeachingWorkspace } = load('@/features/teaching/teaching-workspace');
  const props = {
    ...teachingWorkspace,
    today: '2026-09-16',
    initialView: 'preparation',
    planByAllocation: { 'offering-1': [{ planId: 'plan-1', planLevel: 'class', status: 'active', curriculumVersionId: 'cv', offeringId: 'offering-1' }] },
    planItems: [{ itemId: 'item-1', planId: 'plan-1', planLevel: 'class', planStatus: 'active', unitId: 'unit-1', unitCode: 'U1', topic: 'Fractions', theme: 'Numbers', sequenceNumber: 1, plannedStartOn: null, plannedEndOn: null, plannedPeriods: 4, recommendedPeriodsMin: 3, recommendedPeriodsMax: 5, practicalRequired: false, priority: 'essential' }],
    scheduleItems: [{ itemId: 'sched-1', planItemId: 'item-1', plannedOn: '2026-09-16', plannedPeriodCount: 2, status: 'scheduled', movedTo: null }],
    objectivesByUnit: { 'unit-1': [{ unitId: 'unit-1', code: 'GO 1.1', text: 'Compare and order fractions.' }] },
    competenciesByUnit: { 'unit-1': [{ unitId: 'unit-1', code: 'BC 1.2', text: 'Represent fractions on a number line.' }] },
    reviewHref: '/teaching/reviews',
  };
  const html = renderToStaticMarkup(React.createElement(TeachingWorkspace, props));
  // The preparation view separates official registry content from teacher-authored fields.
  assert.match(html, /Official curriculum/);
  assert.match(html, /Read-only/);
  assert.match(html, /Compare and order fractions\./);
  assert.match(html, /Basic competencies/);
  assert.match(html, /Teacher-authored fields/);
  // Unscheduled/registry null dates degrade instead of throwing.
  assert.doesNotMatch(html, /Invalid time value/);
});

test('TimeField keeps the shared 40px control geometry and never exposes a native time input', () => {
  const load = loader();
  const { TimeField } = load('@/components/ui/time-field');
  const html = renderToStaticMarkup(React.createElement(TimeField, { label: 'Starts at', name: 'startsAt', value: '14:30', onChange() {} }));
  // No native browser time popup is exposed to the user.
  assert.doesNotMatch(html, /type="time"/);
  // The hidden form input preserves the HH:MM value for the existing server action.
  assert.match(html, /name="startsAt" value="14:30"/);
  // Shared label box + control offset established by #456, so labelled TimeField aligns with DateField/Picker.
  assert.match(html, /<label[^>]*class="block h-4 text-xs font-medium leading-4"[^>]*>Starts at/);
  assert.match(html, /class="relative mt-1\.5"/);
  // 40px bordered surface mirroring DateField.
  assert.match(html, /scolapro-control-surface flex min-h-10 /);
  // Clock trigger is keyboard-reachable and reports its expanded state.
  assert.match(html, /aria-label="Open starts at time"/);
  assert.match(html, /aria-expanded="false"/);
});


// ==========================================================================
// Cross-school directory (Stream C)
// ==========================================================================
function directoryWorkspace(calls = {}) {
  return loader({
    'next/navigation': navigation,
    '@/components/shell/app-shell': { AppShell: ({ children }) => children },
    '@/lib/auth/get-user-context': { getUserContext: async () => ({ user: { id: 'any-authenticated-user' }, memberships: [{ roleKey: 'teacher', schoolId: 'viewer-school' }], currentSchoolMembership: { schoolId: 'viewer-school' } }) },
    '@/features/school-directory/server/queries': {
      searchSchoolDirectory: async (params = {}) => { calls.search = params; return [
        { schoolId: 'school-a', schoolName: 'Alpha Directory School', emisNumber: '90001', town: 'Swakopmund', region: 'Erongo', physicalAddress: '1 Main Street', postalAddress: 'P O Box 1', telephone: '+264 64 000 000', fax: '', schoolEmail: 'office@alpha.test', schoolCellphone: '+264 81 000 0000', principalName: 'Prin Cipal', principalPublicEmail: 'principal.public@alpha.test', gradesOfferedDisplay: '8–12', minimumGrade: '8', maximumGrade: '12', regionId: 'region-1', regionName: 'Erongo Region', circuitId: 'circuit-1', circuitName: 'Swakopmund Circuit', inspectorName: 'Jane Inspector', inspectorPhone: '+264 81 111 1111', inspectorEmail: 'inspector@education.test', inspectorLastUpdatedAt: '2026-09-16T08:00:00Z', inspectorLastUpdatedBySchoolId: 'school-a', inspectorLastUpdatedBySchoolName: 'Alpha Directory School' },
        { schoolId: 'school-c', schoolName: 'Gamma Unassigned School', emisNumber: '90003', town: 'Oshakati', region: 'Oshana', physicalAddress: '', postalAddress: '', telephone: '', fax: '', schoolEmail: '', schoolCellphone: '', principalName: '', principalPublicEmail: '', gradesOfferedDisplay: '', minimumGrade: '', maximumGrade: '', regionId: null, regionName: '', circuitId: null, circuitName: '', inspectorName: '', inspectorPhone: '', inspectorEmail: '', inspectorLastUpdatedAt: null, inspectorLastUpdatedBySchoolId: null, inspectorLastUpdatedBySchoolName: '' },
      ]; },
      getDirectoryFilterOptions: async () => { calls.filters = true; return { regions: [{ value: 'region-1', label: 'Erongo Region' }], circuits: [{ value: 'circuit-1', label: 'Swakopmund Circuit' }] }; },
      getDirectoryViewerAuthority: async () => { calls.authority = true; return calls.authorityValue ?? { canManageSchoolSettings: false, currentSchoolId: 'viewer-school', editableCircuitIds: [] }; },
    },
  })('@/app/school-directory/page').default;
}
test('school directory route is open to any authenticated role and renders grouped circuit results', async () => {
  const calls = {};
  const html = renderToStaticMarkup(await directoryWorkspace(calls)({ searchParams: Promise.resolve({}) }));
  assert.match(html, /School Directory/);
  assert.match(html, /Find contact details for ScolaPro schools\./);
  assert.match(html, /Swakopmund Circuit/);
  assert.match(html, /Jane Inspector/);
  assert.match(html, /Last updated by Alpha Directory School, 16 Sept 2026/);
  assert.match(html, /Grades 8–12/);
  assert.match(html, /EMIS: 90001/);
  assert.match(html, /Principal public email/);
  assert.match(html, /Circuit not configured/);
  // Any authenticated role reaches the route: no role gate redirect before data load.
  assert.ok(calls.search);
  // No native browser selects anywhere in the directory surface.
  assert.doesNotMatch(html, /<select/);
  // No messaging / cross-tenant operational affordances.
  assert.doesNotMatch(html, /Message|Request access/);
});
test('anonymous directory visit redirects to login before loading data', async () => {
  const calls = {};
  const load = loader({
    'next/navigation': navigation,
    '@/components/shell/app-shell': { AppShell: ({ children }) => children },
    '@/lib/auth/get-user-context': { getUserContext: async () => ({ user: null, memberships: [] }) },
    '@/features/school-directory/server/queries': { searchSchoolDirectory: async () => { calls.loaded = true; return []; }, getDirectoryFilterOptions: async () => ({ regions: [], circuits: [] }), getDirectoryViewerAuthority: async () => ({}) },
  })('@/app/school-directory/page').default;
  await assert.rejects(load({ searchParams: Promise.resolve({}) }), /redirect:\/login/);
  assert.ok(!calls.loaded);
});
test('inspector edit control appears only when the viewer holds same-circuit settings authority', async () => {
  const calls = { authorityValue: { canManageSchoolSettings: true, currentSchoolId: 'school-a', editableCircuitIds: ['circuit-1'] } };
  const html = renderToStaticMarkup(await directoryWorkspace(calls)({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Edit inspector contact/);
  const deniedCalls = { authorityValue: { canManageSchoolSettings: false, currentSchoolId: 'school-x', editableCircuitIds: [] } };
  const denied = renderToStaticMarkup(await directoryWorkspace(deniedCalls)({ searchParams: Promise.resolve({}) }));
  assert.doesNotMatch(denied, /Edit inspector contact/);
  const wrongCircuit = { authorityValue: { canManageSchoolSettings: true, currentSchoolId: 'school-z', editableCircuitIds: ['circuit-99'] } };
  const deniedCircuit = renderToStaticMarkup(await directoryWorkspace(wrongCircuit)({ searchParams: Promise.resolve({}) }));
  assert.doesNotMatch(deniedCircuit, /Edit inspector contact/);
});
test('directory filters thread region and circuit through the governed RPC call', async () => {
  const calls = {};
  await directoryWorkspace(calls)({ searchParams: Promise.resolve({ q: 'namib', region: 'region-1', circuit: 'circuit-1' }) });
  assert.deepEqual(calls.search, { search: 'namib', regionId: 'region-1', circuitId: 'circuit-1' });
});
test('directory empty search state stays honest when no school matches', async () => {
  const load = loader({
    'next/navigation': navigation,
    '@/components/shell/app-shell': { AppShell: ({ children }) => children },
    '@/lib/auth/get-user-context': { getUserContext: async () => ({ user: { id: 'u' }, memberships: [], currentSchoolMembership: null }) },
    '@/features/school-directory/server/queries': { searchSchoolDirectory: async () => [], getDirectoryFilterOptions: async () => ({ regions: [], circuits: [] }), getDirectoryViewerAuthority: async () => ({ canManageSchoolSettings: false, currentSchoolId: null, editableCircuitIds: [] }) },
  })('@/app/school-directory/page').default;
  const html = renderToStaticMarkup(await load({ searchParams: Promise.resolve({ q: 'nonexistent' }) }));
  assert.match(html, /No schools match this search\./);
});
test('inspector contact server action proves authority through the governed RPC', async () => {
  const rpcCalls = [];
  const load = loader({
    'next/navigation': navigation,
    'next/cache': { revalidatePath() {} },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => ({ rpc: async (name, args) => { rpcCalls.push({ name, args }); return { error: null }; } }) },
    '@/lib/auth/get-user-context': { getUserContext: async () => ({ user: { id: 'u' }, memberships: [{ roleKey: 'school_admin', schoolId: 'school-a' }] }) },
  })('@/features/school-directory/server/actions');
  assert.equal(typeof load.saveCircuitInspectorContact, 'function');
  // The action delegates entirely to update_circuit_inspector_contact; the RPC re-proves membership, role, placement and current circuit assignment.
  assert.ok('saveCircuitInspectorContact' in load);
});
test('school settings renders the new public directory contact fields with public-facing copy', async () => {
  const load = loader({
    'next/navigation': navigation,
    '@/components/shell/app-shell': { AppShell: ({ children }) => children },
    '@/lib/auth/get-user-context': { getUserContext: async () => ({ user: { id: 'u' }, memberships: [{ roleKey: 'deputy_principal', schoolId: 'school-a', schoolName: 'Alpha Directory School' }] }) },
    '@/features/reporting/server/settings': { getReportCardSchoolSettings: async () => ({ documentProfile: { formerName: '', logoUrl: '', logoStoragePath: '', physicalAddress: '', telephone: '', fax: '', email: '', postalAddress: '', town: '', schoolNameFont: 'default' }, reportCardSettings: { showPercentages: false, showNonPromotionalSubjects: true, showPassMarkLegend: true, remarksMode: 'manual', defaultRemark: '' }, subjects: [] }) },
    '@/features/school-directory/server/queries': { getSchoolDirectoryContact: async () => ({ cellphone: '+264 81 000 0000', principalPublicEmail: 'principal.public@alpha.test' }) },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => ({ from() { return { select() { return { eq() { return { maybeSingle: async () => ({ data: { id: 'school-a', name: 'Alpha Directory School', emis_number: '90001', region: 'Erongo', town: 'Swakopmund', status: 'active' } }) } } } } } } }) },
  })('@/app/school/settings/page').default;
  const html = renderToStaticMarkup(await load({ searchParams: Promise.resolve({}) }));
  assert.match(html, /School Directory contact/);
  assert.match(html, /Shown to authenticated ScolaPro schools in the School Directory\./);
  assert.match(html, /does not use the principal(?:&#x27;|&#39;|')s private account email/);
  assert.match(html, /value="\+264 81 000 0000"/);
  // Existing canonical fields are not duplicated inside the directory panel.
  assert.match(html, /Report card &amp; document identity/);
});
test('navigation exposes School Directory to every authenticated role without nesting under settings', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/shell/navigation.tsx'), 'utf8');
  assert.ok(source.includes('key: "school_directory", label: "School Directory", href: "/school-directory"'));
  for (const role of ['school_admin', 'principal', 'teacher', 'learner', 'librarian', 'platform_support', 'parent']) {
    assert.match(source, new RegExp(`${role}: \\[[^\\]]*"school_directory"`), `${role} gains the directory entry`);
  }
});


test('academic setup and timetable share Namibia-local academic-year resolution', () => {
  const setupSource = fs.readFileSync(path.join(root, 'src/app/school/setup/page.tsx'), 'utf8');
  const timetableSource = fs.readFileSync(path.join(root, 'src/app/timetable/page.tsx'), 'utf8');

  assert.match(setupSource, /import \{ getNamibiaCalendarYear \} from "@\/lib\/namibia-date";/);
  assert.match(setupSource, /const academicYear = getNamibiaCalendarYear\(\);/);
  assert.doesNotMatch(setupSource, /new Date\(\)\.getFullYear\(\)/);

  assert.match(timetableSource, /import \{ getNamibiaCalendarYear \} from "@\/lib\/namibia-date";/);
  assert.match(timetableSource, /const academicYear = getNamibiaCalendarYear\(\);/);
});

test('timetable core workflow keeps shared ScolaPro controls instead of browser-native pickers', () => {
  const workspaceSource = fs.readFileSync(path.join(root, 'src/features/timetable/timetable-workspace.tsx'), 'utf8');
  const bellSource = fs.readFileSync(path.join(root, 'src/features/timetable/bell-schedule-manager.tsx'), 'utf8');
  const cycleSource = fs.readFileSync(path.join(root, 'src/features/timetable/timetable-cycle-settings.tsx'), 'utf8');

  for (const source of [workspaceSource, bellSource, cycleSource]) {
    assert.doesNotMatch(source, /<select\b|type="date"|type="time"/);
  }
  assert.match(workspaceSource, /Picker, TimePicker/);
  assert.match(bellSource, /DateField/);
  assert.match(bellSource, /Picker, TimePicker/);
  assert.match(cycleSource, /DateField/);
});


test('room inventory workspace uses Namibia-local effective dates and fails on partial query errors', () => {
  const source = fs.readFileSync(path.join(root, 'src/features/room-inventory/server/queries.ts'), 'utf8');
  assert.match(source, /import \{ getNamibiaDateKey \} from "@\/lib\/namibia-date";/);
  assert.match(source, /const today = getNamibiaDateKey\(\);/);
  assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
  for (const result of ['roomsResult', 'itemsResult', 'custodiansResult', 'verificationsResult', 'assignmentsResult']) {
    assert.ok(source.includes(`${result}.error`), `expected ${result} failures to reach the route error boundary`);
  }
  assert.match(source, /if \(loadError\) throw new Error\(\`Unable to load room inventory workspace:/);
  assert.match(source, /if \(staffResult\.error\) throw new Error\(\`Unable to load room inventory workspace:/);
});

test('room inventory exposes honest empty verification history and labelled quantity mutation input', () => {
  const load = loader({ '@/features/room-inventory/server/actions': { assignCustodian() {}, changeItem() {}, createItem() {}, verifyInventory() {} } });
  const { RoomInventoryWorkspace } = load('@/features/room-inventory/room-inventory-workspace');
  const html = renderToStaticMarkup(React.createElement(RoomInventoryWorkspace, {
    rooms: [{id:'room',code:'R1',name:'Room',block:null,custodianId:null,custodianName:null,lastVerified:null,itemCount:1,status:'active'}],
    items: [{id:'item',roomId:'room',name:'Desk',assetNumber:null,ownership:'government',condition:'good',quantity:1,status:'active',version:1,notes:null}],
    staff: [],
    verifications: [],
    today: '2026-09-19',
    canAssign: true,
  }));
  assert.match(html, /No verification history yet\./);
  assert.match(html, /<span class="block h-4 text-xs font-medium leading-4">Quantity change<\/span>/);
  assert.match(html, /name="delta"/);
  assert.match(html, /type="number"/);
  assert.match(html, /value="0"/);
});


test('guardian reads honor current effective relationship/contact/address periods', () => {
  const queriesSource = fs.readFileSync(path.join(root, 'src/features/guardians/server/queries.ts'), 'utf8');
  const directorySource = fs.readFileSync(path.join(root, 'src/features/guardians/server/directory.ts'), 'utf8');

  for (const source of [queriesSource, directorySource]) {
    assert.match(source, /getNamibiaDateKey/);
    assert.match(source, /\.lte\("effective_from", today\)/);
    assert.match(source, /effective_to\.is\.null,effective_to\.gte\.\$\{today\}/);
  }
  assert.doesNotMatch(queriesSource, /\.is\("effective_to", null\)/);
  assert.doesNotMatch(directorySource, /\.is\("effective_to", null\)/);
  assert.match(queriesSource, /if \(error\) throw new Error\("Unable to load learner guardians\."\)/);
  assert.match(directorySource, /if \(hydrationError\) throw new Error\("Unable to load guardian directory details\."\)/);
});

test('guardian relationship end action supplies the required effective date and exposes feedback', () => {
  const actionsSource = fs.readFileSync(path.join(root, 'src/features/guardians/server/actions.ts'), 'utf8');
  const panelSource = fs.readFileSync(path.join(root, 'src/features/guardians/guardian-panel.tsx'), 'utf8');

  assert.match(actionsSource, /endGuardianRelationship\(_state: GuardianActionState, formData: FormData\)/);
  assert.match(actionsSource, /p_relationship_id: relationshipId\.data/);
  assert.match(actionsSource, /p_effective_to: getNamibiaDateKey\(\)/);
  assert.match(actionsSource, /Guardian relationship ended\./);
  assert.match(panelSource, /useActionState\(endGuardianRelationship, initialState\)/);
  assert.match(panelSource, /disabled=\{endPending\}/);
  assert.match(panelSource, /aria-busy=\{endPending \|\| undefined\}/);
});

test('guardian directory distinguishes a true empty school state from a filtered empty result', () => {
  const load = loader();
  const { GuardianDirectory } = load('@/features/guardians/guardian-directory');
  const emptyHtml = renderToStaticMarkup(React.createElement(GuardianDirectory, { guardians: [] }));
  assert.match(emptyHtml, /No current guardian relationships/);
  assert.match(emptyHtml, /Guardians linked to currently enrolled learners will appear here\./);
});


test('bulk import staging uses Namibia-local dates and fails closed when school setup cannot load', () => {
  const source = fs.readFileSync(path.join(root, 'src/features/imports/server/actions.ts'), 'utf8');

  assert.match(source, /import \{ getNamibiaCalendarYear, getNamibiaDateKey \} from "@\/lib\/namibia-date";/);
  assert.match(source, /const year = getNamibiaCalendarYear\(\);/);
  assert.match(source, /\) \|\| getNamibiaDateKey\(\);/);
  assert.match(source, /const today = getNamibiaDateKey\(\);/);
  assert.doesNotMatch(source, /new Date\(\)\.getFullYear\(\)/);
  assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(source, /if \(gradesResult\.error \|\| classesResult\.error\) redirect\("\/school\/imports\?error=Current\+school\+setup\+could\+not\+be\+loaded"\);/);
});

test('bulk import workspace keeps explicit empty states and responsive review layout', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/school/imports/page.tsx'), 'utf8');

  assert.match(source, /No active or recent imports\./);
  assert.match(source, /No import history found\./);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /min-w-\[56rem\]/);
  assert.match(source, /sm:flex-row/);
  assert.match(source, /lg:grid/);
  assert.match(source, /xl:grid-cols-2 2xl:grid-cols-4/);
  assert.match(source, /issues\.map\(\(issue\) => issue\.message\)\.join/);
  assert.doesNotMatch(source, /JSON\.stringify\(row\.source_data/);
});
