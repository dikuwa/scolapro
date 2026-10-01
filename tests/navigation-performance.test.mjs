import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("src/app/layout.tsx", "utf8");
const navigation = readFileSync("src/components/shell/navigation.tsx", "utf8");

test("root layout declares intentional smooth scroll behavior for Next navigation", () => {
  assert.match(layout, /<html lang="en" data-scroll-behavior="smooth">/);
});

test("dense primary navigation disables viewport prefetch and preserves intent prefetch", () => {
  assert.match(navigation, /from "next\/link"/);
  assert.match(navigation, /usePathname, useRouter/);
  assert.match(navigation, /prefetch=\{false\}/);
  assert.match(navigation, /onPointerEnter=\{\(\) =>/);
  assert.match(navigation, /onFocus=\{\(\) =>/);
  assert.match(navigation, /router\.prefetch\(item\.href\)/);
  assert.match(navigation, /<Link[^>]+href=\{item\.href\}/);
});
