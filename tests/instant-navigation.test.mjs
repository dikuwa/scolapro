import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nextConfig = readFileSync("next.config.ts", "utf8");
const navigation = readFileSync("src/components/shell/navigation.tsx", "utf8");
const loading = readFileSync("src/app/loading.tsx", "utf8");

test("navigation keeps production-safe Next defaults instead of globally enabling incompatible Cache Components", () => {
  assert.doesNotMatch(nextConfig, /cacheComponents:\s*true/);
  assert.doesNotMatch(nextConfig, /partialPrefetching:\s*true/);
});

test("dense primary navigation preserves client navigation while moving prefetch behind user intent", () => {
  assert.match(navigation, /from "next\/link"/);
  assert.match(navigation, /prefetch=\{false\}/);
  assert.match(navigation, /router\.prefetch\(item\.href\)/);
  assert.match(navigation, /onPointerEnter=/);
  assert.match(navigation, /onFocus=/);
});

test("route-level streaming fallback remains available", () => {
  assert.match(loading, /RouteLoadingIndicator/);
  assert.match(loading, /aria-busy="true"/);
});
