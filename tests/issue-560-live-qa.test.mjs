import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Issue #560 target surfaces retain bounded responsive, state and focus contracts", () => {
  const setup = read("src/app/school/setup/page.tsx");
  const conduct = read("src/features/conduct/conduct-workspace.tsx");
  const loading = read("src/app/conduct/loading.tsx");
  const error = read("src/app/conduct/error.tsx");

  assert.match(setup, /sm:grid-cols-3/);
  assert.match(setup, /overflow-hidden/);
  assert.match(conduct, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(conduct, /flex flex-wrap/);
  assert.match(conduct, /focus-visible:ring-4/);
  assert.match(conduct, /aria-busy=\{pending\}/);
  assert.match(conduct, /No learners are enrolled/);
  assert.match(conduct, /No conduct records found/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /RouteLoadingIndicator/);
  assert.match(error, /Try again/);
  assert.match(error, /onClick=\{reset\}/);
});

test("Issue #560 route loader is transparent and uses the shared brand token", () => {
  const loader = read("src/components/ui/route-loading-indicator.tsx");
  assert.match(loader, /pointer-events-none fixed inset-0/);
  assert.match(loader, /text-\[color:var\(--brand\)\]/);
  assert.doesNotMatch(loader, /bg-(?:background|surface|surface-elevated)/);
});

test("Issue #560 target surfaces use theme tokens rather than hard-coded colors", () => {
  const setup = read("src/app/school/setup/page.tsx");
  const conduct = read("src/features/conduct/conduct-workspace.tsx");
  const loader = read("src/components/ui/route-loading-indicator.tsx");

  for (const source of [setup, conduct, loader]) {
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
  }
});