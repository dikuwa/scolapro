import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nextConfig = readFileSync("next.config.ts", "utf8");
const navigation = readFileSync("src/components/shell/navigation.tsx", "utf8");
const loading = readFileSync("src/app/loading.tsx", "utf8");

test("Next 16.3 instant navigation foundations are enabled", () => {
  assert.match(nextConfig, /cacheComponents:\s*true/);
  assert.match(nextConfig, /partialPrefetching:\s*true/);
});

test("primary navigation allows reusable route-shell prefetching", () => {
  assert.doesNotMatch(navigation, /prefetch=\{false\}/);
  assert.doesNotMatch(navigation, /router\.prefetch/);
  assert.match(navigation, /from "next\/link"/);
});

test("route-level streaming fallback remains available", () => {
  assert.match(loading, /RouteLoadingIndicator/);
  assert.match(loading, /aria-busy="true"/);
});
