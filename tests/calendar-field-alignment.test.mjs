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

// Same compile-and-load harness as the repository UI suite; server entries and
// toast feedback stay doubled in this file so no database or browser is needed.
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

const managerSource = fs.readFileSync(path.join(root, 'src/features/calendar/teaching-impact-manager.tsx'), 'utf8');

function renderTeachingImpactManager() {
  const load = loader({
    sonner: { toast: { success() {}, error() {} } },
    '@/features/calendar/server/actions': {
      saveTeachingImpact: async () => ({}),
      saveSchoolCalendarEvent: async () => ({}),
    },
  });
  const { TeachingImpactManager } = load('@/features/calendar/teaching-impact-manager');
  return renderToStaticMarkup(React.createElement(TeachingImpactManager, {
    schoolId: 'school',
    year: 2026,
    schedules: [{ id: 'bs1', name: 'Exam day schedule', effectiveFrom: '2026-09-01' }],
    events: [],
    overrides: [],
    audienceOptions: [{ value: 'all_learners', label: 'All learners' }],
    canManage: true,
  }));
}

test('learner event form aligns calendar and impact controls on the shared field contract', () => {
  const html = renderTeachingImpactManager();
  for (const label of ['Event title', 'Category', 'Starts on', 'Ends on', 'Learner audience', 'Teaching impact']) {
    assert.match(html, new RegExp(`<label[^>]*class="block h-4 text-xs font-medium leading-4"[^>]*>${label}`));
  }
  assert.match(html, /class="scolapro-control-surface flex min-h-10 w-full items-center overflow-hidden rounded-\[var\(--radius-sm\)\] hover:border-border"/);
  assert.match(html, /flex min-h-10 w-full items-center justify-between gap-2 rounded-\[var\(--radius-sm\)\] border border-border-subtle bg-surface-elevated px-3 text-left text-sm shadow-\[var\(--shadow-xs\)\]/);
});

test('event submit action uses the shared button and start-aligned action slot', () => {
  const html = renderTeachingImpactManager();
  assert.match(managerSource, /className="flex items-start lg:col-span-2"/);
  assert.match(html, /type="submit"[^>]*>Add school event<\/button>/);
  assert.doesNotMatch(managerSource, /translate-y|-translate|margin-top|-mt-|mt-\[/);
});

test('learner event form keeps submitted fields and responsive stacking without browser-native pickers', () => {
  const html = renderTeachingImpactManager();
  assert.match(html, /name="schoolId" value="school"/);
  assert.match(html, /name="startsOn" value="2026-01-01"/);
  assert.match(html, /name="endsOn" value="2026-01-01"/);
  assert.match(html, /name="impact" value="NORMAL"/);
  assert.match(html, /name="audience" value="all_learners"/);
  assert.doesNotMatch(html, /<select|type="date"|type="time"/);
  assert.match(managerSource, /lg:grid-cols-2/);
});

test('shared form-field contract tokens stay authoritative for mixed rows', () => {
  const layout = loader()('@/components/ui/form-field-layout');
  assert.equal(layout.formFieldLabelClass, 'block h-4 text-xs font-medium leading-4');
  assert.equal(layout.formFieldControlOffsetClass, 'mt-1.5');
  assert.equal(layout.formRowAlignClass, 'items-start');
});


test("calendar page resolves the governed school academic year instead of wall-clock year", () => {
  const source = fs.readFileSync(path.join(root, "src/app/calendar/page.tsx"), "utf8");
  assert.match(source, /getGovernedAcademicYear/);
  assert.match(source, /await getGovernedAcademicYear\(membership\.schoolId\)/);
  assert.doesNotMatch(source, /getNamibiaCalendarYear/);
});

test("calendar governed-year fallback is Namibia-local and calendar layout stays responsive", () => {
  const serverSource = fs.readFileSync(path.join(root, "src/features/calendar/server/calendar.ts"), "utf8");
  const pageSource = fs.readFileSync(path.join(root, "src/app/calendar/page.tsx"), "utf8");
  assert.match(serverSource, /getNamibiaCalendarYear\(\)/);
  assert.doesNotMatch(serverSource, /new Date\(\)\.getFullYear\(\)/);
  assert.match(pageSource, /sm:grid-cols-3/);
  assert.match(pageSource, /sm:grid-cols-\[8rem_1fr_1fr_auto\]/);
});
