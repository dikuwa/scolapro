const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');

// Exercise repository TS/TSX with the installed compiler; no test dependency or
// production bypass is introduced. Authentication/data doubles stay in this file.
function loader(mocks = {}) {
  const cache = new Map();
  function load(name, parent = root) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.') && !name.startsWith('@/') && !path.isAbsolute(name)) return require(name);
    let file = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(parent, name);
    file = [file, `${file}.ts`, `${file}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!file) throw new Error(`Missing module ${name}`);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', code)(dependency => load(dependency, path.dirname(file)), module, module.exports);
    return module.exports;
  }
  return load;
}
const navigation = { useRouter: () => ({ push() {}, refresh() {} }), redirect: destination => { throw new Error(`redirect:${destination}`); } };
const labels = { illness: 'Illness', medical_appointment: 'Medical appointment', compassionate: 'Compassionate', family: 'Family', transport: 'Transport', weather: 'Weather', school_activity: 'School activity', other: 'Other' };

test('absence server-action module exports only functions; reason vocabulary is unchanged', () => {
  const load = loader({ 'next/cache': { revalidatePath() {} }, '@/lib/supabase/server': { createSupabaseServerClient() { throw new Error('not called'); } } });
  const actions = load('@/features/parents/server/absence-actions');
  const { ensureServerEntryExports } = require('next/dist/build/webpack/loaders/next-flight-loader/action-validate');
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
