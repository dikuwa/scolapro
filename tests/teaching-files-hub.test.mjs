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

// Same in-process TS/TSX loader contract as the other repository UI tests; no
// test dependency and no production bypass is introduced.
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

// ---------------------------------------------------------------------------
// Read model: ownership is enforced by the read model itself, not by the UI.
// ---------------------------------------------------------------------------

function fakeSupabase(tables) {
  const calls = [];
  function from(table) {
    const state = { table, filters: [], select: null };
    calls.push(state);
    const builder = {
      select(columns) { state.select = columns; return builder; },
      eq(column, value) { state.filters.push(['eq', column, value]); return builder; },
      in(column, values) { state.filters.push(['in', column, values]); return builder; },
      order() { return builder; },
      then(onFulfilled) {
        let rows = tables[table] ?? [];
        for (const [op, column, value] of state.filters) {
          if (op === 'eq') rows = rows.filter(row => row[column] === value);
          if (op === 'in') rows = rows.filter(row => (value ?? []).includes(row[column]));
        }
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
      },
    };
    return builder;
  }
  return { client: { from }, calls };
}

const offering = (subjectName, gradeName) => ({ subject_id: `sub-${subjectName}`, curriculum_version_id: 'cv-1', subjects: { display_name: subjectName }, grades: { display_name: gradeName } });

const allocationRows = [
  { id: 'alloc-math', school_id: 'school-a', academic_year: 2026, staff_member_id: 'staff-1', register_class_id: 'class-8a', active_from: '2026-01-15', active_to: null, subject_offerings: offering('Mathematics', 'Grade 8'), register_classes: { display_name: '8A' } },
  { id: 'alloc-sci', school_id: 'school-a', academic_year: 2026, staff_member_id: 'staff-1', register_class_id: 'class-8a', active_from: '2026-02-01', active_to: null, subject_offerings: offering('Physical Science', 'Grade 8'), register_classes: { display_name: '8A' } },
  { id: 'alloc-ended', school_id: 'school-a', academic_year: 2026, staff_member_id: 'staff-1', register_class_id: 'class-9b', active_from: '2026-01-15', active_to: '2026-06-30', subject_offerings: offering('Science', 'Grade 9'), register_classes: { display_name: '9B' } },
  { id: 'alloc-other-teacher', school_id: 'school-a', academic_year: 2026, staff_member_id: 'staff-2', register_class_id: 'class-10c', active_from: '2026-01-15', active_to: null, subject_offerings: offering('Biology', 'Grade 10'), register_classes: { display_name: '10C' } },
];

const scheduleRows = [
  { id: 'sched-1', teacher_allocation_id: 'alloc-math', school_id: 'school-a', academic_year: 2026 },
];

const preparationRows = [
  { id: 'prep-owned', teaching_schedule_item_id: 'sched-1', planned_on: '2026-09-14', status: 'submitted', submitted_at: '2026-09-13T08:00:00Z', reviewed_at: null, review_note: null },
  { id: 'prep-orphan', teaching_schedule_item_id: 'sched-unknown', planned_on: '2026-09-15', status: 'draft', submitted_at: null, reviewed_at: null, review_note: null },
];

function hubLoader(overrides = {}) {
  const fake = fakeSupabase({ teacher_allocations: allocationRows, teaching_schedule_items: scheduleRows, lesson_preparations: preparationRows, ...overrides });
  const load = loader({
    '@/lib/supabase/server': { createSupabaseServerClient: async () => fake.client },
    '@/lib/namibia-date': { getNamibiaDateKey: () => '2026-09-18' },
  });
  return { hub: load('@/features/teaching/server/file-queries'), calls: fake.calls };
}

test('teaching files read model scopes to the actor own effective allocations only', async () => {
  const { hub, calls } = hubLoader();
  const result = await hub.getTeachingFilesHub({ schoolId: 'school-a', academicYear: 2026, staffMemberId: 'staff-1' });

  // Ownership filter is applied to the allocation register itself.
  const allocationCall = calls.find(call => call.table === 'teacher_allocations');
  assert.deepEqual(
    allocationCall.filters.filter(([op]) => op === 'eq'),
    [['eq', 'school_id', 'school-a'], ['eq', 'academic_year', 2026], ['eq', 'staff_member_id', 'staff-1']],
  );

  // The other teacher's allocation never enters the hub, and an ended placement
  // is not treated as a current allocation.
  assert.deepEqual(result.allocations.map(a => a.allocationId), ['alloc-math', 'alloc-sci']);
  assert.equal(result.allocations.some(a => a.subjectName === 'Biology'), false);
  assert.equal(result.allocations.some(a => a.className === '9B'), false);
});

test('teaching files read model dedupes the register-class official document and reuses the existing endpoint', async () => {
  const { hub } = hubLoader();
  const result = await hub.getTeachingFilesHub({ schoolId: 'school-a', academicYear: 2026, staffMemberId: 'staff-1' });

  // One official class list for Grade 8 / 8A even though two allocations share it.
  assert.equal(result.officialDocuments.length, 1);
  const [document] = result.officialDocuments;
  assert.equal(document.grade, 'Grade 8');
  assert.equal(document.registerClass, '8A');
  assert.deepEqual(document.subjectNames, ['Mathematics', 'Physical Science']);
  assert.match(document.printHref, /^\/api\/official-documents\/class-list\?/);
  assert.match(document.printHref, /grade=Grade\+8/);
  assert.match(document.printHref, /class=8A/);
  assert.match(document.printHref, /year=2026/);
  assert.doesNotMatch(document.printHref, /format=pdf/);
  assert.match(document.pdfHref, /format=pdf/);
});

test('teaching files read model keeps lesson preparations as connected records and drops unroutable rows', async () => {
  const { hub } = hubLoader();
  const result = await hub.getTeachingFilesHub({ schoolId: 'school-a', academicYear: 2026, staffMemberId: 'staff-1' });

  // Preparations are reached through the canonical schedule chain and are not
  // exposed as a file list.
  assert.deepEqual(result.preparationRecords.map(r => r.id), ['prep-owned']);
  assert.equal(result.preparationRecords[0].allocationId, 'alloc-math');
  assert.equal(result.preparationRecords[0].status, 'submitted');
  assert.equal('storagePath' in result.preparationRecords[0], false);
});

test('teaching files read model returns an honest empty hub without a governed staff identity', async () => {
  const { hub, calls } = hubLoader();
  const result = await hub.getTeachingFilesHub({ schoolId: 'school-a', academicYear: 2026, staffMemberId: null });
  assert.deepEqual(result.allocations, []);
  assert.deepEqual(result.officialDocuments, []);
  assert.deepEqual(result.preparationRecords, []);
  assert.equal(calls.length, 0, 'no school-wide read is issued without a governed staff identity');
});

test('teaching files read model adds no second file store or upload backend', () => {
  const source = fs.readFileSync(path.join(root, 'src/features/teaching/server/file-queries.ts'), 'utf8');
  assert.doesNotMatch(source, /storage\s*\.\s*from/);
  assert.doesNotMatch(source, /\.upload\(/);
  assert.doesNotMatch(source, /createSignedUrl/);
  assert.doesNotMatch(source, /\binsert\s+into\b/i);
  assert.doesNotMatch(source, /\bcreate table\b/i);
  // It reuses the existing official document endpoint rather than a new route.
  assert.match(source, /\/api\/official-documents\/class-list/);
  assert.equal(hubTaxonomyFlag(), false, 'official teacher-file taxonomy remains unsourced');
});

function hubTaxonomyFlag() {
  const { hub } = hubLoader();
  return hub.OFFICIAL_TEACHER_FILE_TAXONOMY_SOURCED;
}

// ---------------------------------------------------------------------------
// Hub component: honest states, existing actions only, no cross-teacher browse.
// ---------------------------------------------------------------------------

const allocationA = { allocationId: 'alloc-a', subjectId: 'subject-a', className: '8A', gradeName: 'Grade 8', subjectName: 'Mathematics', activeFrom: '2026-01-15', activeTo: null };
const officialA = {
  id: 'Grade 8::8A', grade: 'Grade 8', registerClass: '8A', academicYear: 2026, subjectNames: ['Mathematics'],
  printHref: '/api/official-documents/class-list?grade=Grade+8&class=8A&year=2026',
  pdfHref: '/api/official-documents/class-list?grade=Grade+8&class=8A&year=2026&format=pdf',
};
const recordA = { id: 'prep-a', allocationId: 'alloc-a', plannedOn: '2026-09-14', status: 'submitted', submittedAt: '2026-09-13T08:00:00Z', reviewedAt: null, reviewNote: null };

const professionalA = {
  id: 'doc-a',
  originalFilename: 'portfolio.pdf',
  title: 'Teaching portfolio',
  categoryLabel: null,
  mimeType: 'application/pdf',
  fileSize: 2048,
  status: 'active',
  createdAt: '2026-09-18T08:00:00Z',
  archivedAt: null,
  viewHref: '/api/teaching/files/doc-a',
  downloadHref: '/api/teaching/files/doc-a?download=1',
  reviewStatus: null,
  reviewSubjectId: null,
  reviewSubjectName: null,
  reviewNote: null,
};

function renderHub(overrides = {}) {
  const load = loader({
    'next/navigation': navigation,
    'sonner': { toast: { success() {}, error() {} } },
    '@/lib/supabase/client': { createSupabaseBrowserClient() { throw new Error('not called during render'); } },
    '@/features/teaching/server/professional-documents': {
      prepareTeacherProfessionalDocumentUpload() {},
      finalizeTeacherProfessionalDocument() {},
      archiveTeacherProfessionalDocument() {},
      submitTeacherProfessionalDocumentForReview() {},
    },
  });
  const { TeachingFilesHub } = load('@/features/teaching/components/teaching-files');
  return renderToStaticMarkup(React.createElement(TeachingFilesHub, {
    today: '2026-09-18',
    academicYear: 2026,
    allocations: [allocationA],
    officialDocuments: [officialA],
    preparationRecords: [recordA],
    professionalDocuments: [professionalA],
    taxonomySourced: false,
    ownerSchoolId: 'school-a',
    ownerStaffMemberId: 'staff-1',
    canUploadProfessionalDocuments: true,
    ...overrides,
  }));
}

test('teaching files hub offers governed owner upload without inventing official taxonomy', () => {
  const html = renderHub();
  assert.match(html, /Professional files/);
  assert.match(html, /My uploaded professional documents/);
  assert.match(html, /Official documents/);
  assert.match(html, /Your teaching records/);
  assert.match(html, /Taxonomy status/);
  assert.match(html, /official teacher-file taxonomy is not yet sourced/i);
  assert.match(html, /no Ministry\/NIED table of contents has been invented/i);
  assert.match(html, /type="file"/i);
  assert.match(html, /Optional neutral label/);
  assert.match(html, /Teaching portfolio/);
  assert.match(html, /Submit for HOD review/);
  assert.match(html, /Mathematics/);
  assert.match(html, /Uncategorised/);
  assert.doesNotMatch(html, /type="date"/i);
  assert.doesNotMatch(html, /<select/i);
  assert.doesNotMatch(html, /\bNIED required\b/i);
});

test('teaching files hub presents lesson preparations as records, not stored files', () => {
  const html = renderHub();
  assert.match(html, /canonical structured teaching records, not uploaded files/i);
  assert.match(html, /Lesson preparation/);
  assert.match(html, /Submitted/);
});

test('teaching files hub only links to existing governed routes', () => {
  const html = renderHub();
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.ok(
      href.startsWith('/api/official-documents/class-list') || href.startsWith('/api/teaching/files/') || href === '/teaching',
      `unexpected hub link: ${href}`,
    );
  }
  assert.match(html, /Open print view/);
  assert.match(html, /Download PDF/);
});

test('teaching files hub cannot surface another teacher allocation or record', () => {
  const html = renderHub({
    preparationRecords: [{ ...recordA, id: 'prep-other', allocationId: 'alloc-b' }],
  });
  assert.doesNotMatch(html, /Science/);
  assert.doesNotMatch(html, /9B/);
  assert.doesNotMatch(html, /Lesson preparation/);
});

test('teaching files hub keeps teacher-owned uploads available without effective allocations', () => {
  const html = renderHub({ allocations: [], officialDocuments: [], preparationRecords: [] });
  assert.match(html, /No effective teaching allocations/);
  assert.match(html, /Teaching portfolio/);
  assert.match(html, /type="file"/i);
});

// ---------------------------------------------------------------------------
// Route: same current-school teaching authority boundary as /teaching.
// ---------------------------------------------------------------------------

function filesPage(context, calls) {
  return loader({
    'next/navigation': navigation,
    '@/components/shell/app-shell': { AppShell: ({ children }) => children },
    '@/lib/auth/get-user-context': { getUserContext: async () => context },
    '@/features/calendar/server/calendar': { getGovernedAcademicYear: async () => 2026 },
    'sonner': { toast: { success() {}, error() {} } },
    '@/lib/supabase/client': { createSupabaseBrowserClient() { throw new Error('not called during render'); } },
    '@/features/teaching/server/professional-documents': {
      prepareTeacherProfessionalDocumentUpload() {},
      finalizeTeacherProfessionalDocument() {},
      archiveTeacherProfessionalDocument() {},
      submitTeacherProfessionalDocumentForReview() {},
    },
    '@/features/teaching/server/file-queries': {
      getTeachingFilesHub: async (...args) => {
        calls.push(args);
        return {
          today: '2026-09-18',
          academicYear: 2026,
          allocations: [allocationA],
          officialDocuments: [officialA],
          preparationRecords: [recordA],
          professionalDocuments: [professionalA],
        };
      },
      OFFICIAL_TEACHER_FILE_TAXONOMY_SOURCED: false,
    },
  })('@/app/teaching/files/page').default;
}

test('teaching files route renders the real hub in the membership own staff scope', async () => {
  const calls = [];
  const page = filesPage({ user: { id: 'teacher-user' }, memberships: [{ roleKey: 'teacher', schoolId: 'school-a', staffMemberId: 'staff-1' }], platformMemberships: [] }, calls);
  const html = renderToStaticMarkup(await page({}));

  assert.match(html, /Teaching files/);
  assert.match(html, /Professional files/);
  assert.match(html, /official class list/i);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].schoolId, 'school-a');
  assert.equal(calls[0][0].staffMemberId, 'staff-1');
  assert.equal(typeof calls[0][0].academicYear, 'number');
  // Shared pickers remain browser-select free; governed teacher upload is now expected.
  assert.doesNotMatch(html, /<select|type="date"/);
  assert.match(html, /type="file"/);
});

test('teaching files route denies ineligible roles before loading hub data', async () => {
  for (const roleKey of ['parent', 'librarian', 'ltsm', 'platform_admin', 'guardian']) {
    const calls = [];
    const page = filesPage({ user: { id: 'user' }, memberships: [{ roleKey, schoolId: 'school-a', staffMemberId: 'staff-1' }], platformMemberships: [] }, calls);
    await assert.rejects(() => page({}), /redirect:\//, `expected ${roleKey} to be redirected`);
    assert.equal(calls.length, 0, `${roleKey} must not load hub data`);
  }
});

test('teaching files route requires authentication and blocks platform-only sessions', async () => {
  const anonymousCalls = [];
  const anonymous = filesPage({ user: null, memberships: [], platformMemberships: [] }, anonymousCalls);
  await assert.rejects(() => anonymous({}), /redirect:\/login\?next=\/teaching\/files/, 'anonymous access must redirect to login');
  assert.equal(anonymousCalls.length, 0);

  const platformCalls = [];
  const platform = filesPage({ user: { id: 'user' }, memberships: [{ roleKey: 'teacher', schoolId: 'school-a', staffMemberId: 'staff-1' }], platformMemberships: [{ roleKey: 'platform_admin' }] }, platformCalls);
  await assert.rejects(() => platform({}), /redirect:\/$/, 'platform-only sessions must not reach the school hub');
  assert.equal(platformCalls.length, 0);
});

test('teaching files route keeps HOD review authority in its own workspace', async () => {
  const calls = [];
  const page = filesPage({ user: { id: 'hod-user' }, memberships: [{ roleKey: 'hod', schoolId: 'school-a', staffMemberId: 'staff-9' }], platformMemberships: [] }, calls);
  const html = renderToStaticMarkup(await page({}));
  assert.match(html, /teacher-owned files/i);
  assert.doesNotMatch(html, /href="\/teaching\/reviews"/);
  assert.equal(calls[0][0].staffMemberId, 'staff-9');
});
