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
  assert.match(html, /Every three cumulative late arrivals/);
});

test('detention roster planning uses the shared TimeField instead of native time inputs', () => {
  const source = fs.readFileSync(path.join(root, 'src/features/late-arrivals/detention-planner.tsx'), 'utf8');
  assert.match(source, /import \{ TimeField \} from "@\/components\/ui\/time-field";/);
  assert.doesNotMatch(source, /type="time"/);
  assert.match(source, /<TimeField label="Starts at"/);
  assert.match(source, /<TimeField label="Ends at"/);
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

