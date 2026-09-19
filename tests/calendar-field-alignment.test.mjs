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
    '@/features/calendar/server/actions': { saveTeachingImpact: async () => ({}) },
  });
  const { TeachingImpactManager } = load('@/features/calendar/teaching-impact-manager');
  return renderToStaticMarkup(React.createElement(TeachingImpactManager, {
    schoolId: 'school',
    year: 2026,
    schedules: [{ id: 'bs1', name: 'Exam day schedule', effectiveFrom: '2026-09-01' }],
    overrides: [],
  }));
}

test('teaching impact form aligns School date and Teaching impact on the shared field contract', () => {
  const html = renderTeachingImpactManager();
  // Bottom-aligning a mixed row drops the Picker below the DateField control: DateField always
  // carries a FormFieldFeedback reserve and Pickers do not, so the row must align to the start.
  assert.match(html, /md:items-start/);
  assert.doesNotMatch(html, /md:items-end/);
  // Shared 16px label box on every labelled field in the form — labels share one baseline.
  for (const label of ['School date', 'Teaching impact', 'Reason / note']) {
    assert.match(html, new RegExp(`<label[^>]*class="block h-4 text-xs font-medium leading-4"[^>]*>${label}`));
  }
  assert.doesNotMatch(html, /class="text-xs font-medium"/);
  // Shared 6px label-to-control offset on the DateField and Picker wrappers.
  assert.equal((html.match(/class="relative mt-1\.5"/g) || []).length, 2);
  // Same 40px control height: the DateField surface, the Picker trigger and the reason input
  // all own min-h-10; no control is taller or shorter inside the row.
  assert.match(html, /class="scolapro-control-surface flex min-h-10 w-full items-center overflow-hidden rounded-\[var\(--radius-sm\)\] hover:border-border"/);
  assert.match(html, /flex min-h-10 w-full items-center justify-between gap-2 rounded-\[var\(--radius-sm\)\] border border-border-subtle bg-surface-elevated px-3 text-left text-sm shadow-\[var\(--shadow-xs\)\]/);
  assert.match(html, /<input id="impact-reason"[^>]*class="min-h-10 [^"]*"[^>]*name="reason"/);
});

test('submit button rides the shared action geometry next to the reason field', () => {
  const html = renderTeachingImpactManager();
  // The button is offset from the label line by the shared action slot pattern (items-start
  // wrapper), sits at the shared 40px control height and uses the shared CTA treatment.
  assert.match(html, /class="flex items-start"/);
  assert.match(html, /class="scolapro-cta inline-flex min-h-10 items-center justify-center gap-2 bg-brand px-4 text-sm font-medium text-white disabled:opacity-50"/);
  // No per-field offset hacks anywhere in the component: no translate-y, no negative margins,
  // no arbitrary pixel nudges — alignment comes from the shared contract only.
  assert.doesNotMatch(managerSource, /translate-y|-translate|margin-top|-mt-|mt-\[/);
});

test('teaching impact form keeps behaviour and responsive stacking while removing browser-native controls', () => {
  const html = renderTeachingImpactManager();
  // Submitted field names are unchanged.
  assert.match(html, /name="schoolId" value="school"/);
  assert.match(html, /name="date" value="2026-01-01"/);
  assert.match(html, /name="impact" value="NORMAL"/);
  // No native select or date input anywhere in the form.
  assert.doesNotMatch(html, /<select|type="date"/);
  // Responsive: two columns side-by-side only from md; rows stack on mobile.
  assert.match(managerSource, /md:grid-cols-2/);
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
