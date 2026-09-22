import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("src/app/layout.tsx", "utf8");
const navigation = readFileSync("src/components/shell/navigation.tsx", "utf8");

test("root layout declares intentional smooth scroll behavior for Next navigation", () => {
  assert.match(layout, /<html lang="en" data-scroll-behavior="smooth">/);
});

test("primary navigation delegates route-shell prefetching to Next 16.3", () => {
  assert.match(navigation, /from "next\/link"/);
  assert.doesNotMatch(navigation, /prefetch=\{false\}/);
  assert.doesNotMatch(navigation, /router\.prefetch/);
  assert.match(navigation, /<Link[^>]+href=\{item\.href\}/);
});
