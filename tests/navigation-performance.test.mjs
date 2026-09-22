import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("src/app/layout.tsx", "utf8");
const navigation = readFileSync("src/components/shell/navigation.tsx", "utf8");

test("root layout declares intentional smooth scroll behavior for Next navigation", () => {
  assert.match(layout, /<html lang="en" data-scroll-behavior="smooth">/);
});

test("primary internal navigation keeps Next.js route prefetch enabled", () => {
  assert.match(navigation, /from "next\/link"/);
  assert.doesNotMatch(navigation, /prefetch=\{false\}/);
  assert.match(navigation, /<Link[^>]+href=\{item\.href\}/);
});
