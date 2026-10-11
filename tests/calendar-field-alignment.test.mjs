import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const nodeRequire = createRequire(import.meta.url);
const assert = nodeRequire('node:assert/strict');
const fs = nodeRequire('node:fs');
const path = nodeRequire('node:path');
const { test } = nodeRequire('node:test');
const ts = nodeRequire('typescript');
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

test('learner event form aligns calendar and impact controls on the shared field contract', () => {
  for (const label of ['Event title', 'Category', 'Starts on', 'Ends on', 'Learner audience', 'Teaching impact']) {
    assert.match(managerSource, new RegExp(`(?:label=|>)"?${label}`));
  }
  assert.match(managerSource, /formFieldLabelClass/);
  assert.match(managerSource, /<Picker label="Teaching impact"/);
  assert.match(managerSource, /<DateField label="Starts on"/);
});

test('event submit action uses the shared button and start-aligned action slot', () => {
  assert.match(managerSource, /className="flex justify-end gap-2 lg:col-span-2"/);
  assert.match(managerSource, /Add official date<\/Button>/);
  assert.doesNotMatch(managerSource, /translate-y|-translate|margin-top|-mt-|mt-\[/);
});

test('learner event form keeps submitted fields and responsive stacking without browser-native pickers', () => {
  assert.match(managerSource, /name="schoolId" value=\{schoolId\}/);
  assert.match(managerSource, /name="startsOn" value=\{startsOn\}/);
  assert.match(managerSource, /name="endsOn" value=\{endsOn\}/);
  assert.match(managerSource, /name="impact" value=\{impact\}/);
  assert.match(managerSource, /name="audience" value=\{audience\}/);
  assert.doesNotMatch(managerSource, /<select|type="date"|type="time"/);
  assert.match(managerSource, /lg:grid-cols-2/);
  assert.match(managerSource, /canManage && showAddEvent/);
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
  const managerSource = fs.readFileSync(path.join(root, "src/features/calendar/operational-calendar-manager.tsx"), "utf8");
  assert.match(serverSource, /getNamibiaCalendarYear\(\)/);
  assert.doesNotMatch(serverSource, /new Date\(\)\.getFullYear\(\)/);
  assert.match(pageSource, /grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5/);
  assert.match(pageSource, /col-span-2[^\n]*lg:col-span-1/);
  assert.match(managerSource, /sm:flex-row sm:items-center sm:justify-between/);
  assert.match(managerSource, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(managerSource, /mt-4 space-y-2\.5/);
  assert.match(managerSource, /activeTermId === term\.academicTermId/);
  assert.match(pageSource, /Academic year dates are not configured/);
});
