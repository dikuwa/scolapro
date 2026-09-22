import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("src/app/layout.tsx", "utf8");
const navigation = readFileSync("src/components/shell/navigation.tsx", "utf8");

test("root layout declares intentional smooth scroll behavior for Next navigation", () => {
  assert.match(layout, /<html lang="en" data-scroll-behavior="smooth">/);
});

test("primary navigation avoids viewport prefetch storms but prefetches on intent", () => {
  assert.match(navigation, /from "next\/link"/);
  assert.match(navigation, /prefetch=\{false\}/);
  assert.match(navigation, /router\.prefetch\(href\)/);
  assert.match(navigation, /onMouseEnter=\{\(\) => prefetchOnIntent\(item\.href\)\}/);
  assert.match(navigation, /onPointerDown=\{\(\) => prefetchOnIntent\(item\.href\)\}/);
});
