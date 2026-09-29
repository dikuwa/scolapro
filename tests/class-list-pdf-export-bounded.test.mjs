import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";

const PNG_GATE = "src/features/documents/server/official-document-png.ts";
const PDF_HEADER = "src/features/documents/server/official-document-pdf-header.ts";
const REPORT_PDF = "src/features/reporting/server/render-report-card-pdf.ts";
const CLASS_ROUTE = "src/app/api/official-documents/class-list/route.ts";
const LIVE_PROFILE = "src/features/documents/server/live-school-document-profile.ts";

test("optional PNG assets are proven complete before the bundled PDF decoder runs", () => {
  const gate = readFileSync(PNG_GATE, "utf8");
  assert.match(gate, /export function isBoundedDecodablePng/);
  assert.match(gate, /inflateRawSync\(imageData\.subarray\(2, imageData\.length - 4\)\)/);
  assert.match(gate, /return decoded\.length === expected/);

  const header = readFileSync(PDF_HEADER, "utf8");
  assert.match(header, /isBoundedDecodablePng\(bytes\)/);
  assert.match(header, /official document PNG asset skipped: payload is not decodable within bounds/);

  const report = readFileSync(REPORT_PDF, "utf8");
  assert.match(report, /isBoundedDecodablePng\(bytes\)/);
});

test("the PNG gate accepts complete payloads and refuses truncated ones", async () => {
  const gateModule = await loadGateForTest();
  const asset = (name) => new Uint8Array(readFileSync(path.join("public", name)));

  assert.equal(gateModule.isBoundedDecodablePng(asset("brand/schools/namib-high/crest.png")), true);
  assert.equal(gateModule.isBoundedDecodablePng(asset("brand/governed/namibia-coat-of-arms.png")), true);
  assert.equal(gateModule.isBoundedDecodablePng(asset("brand/scolapro/icon-512.png")), true);

  assert.equal(gateModule.isBoundedDecodablePng(asset("brand/governed/scolapro-document-backdrop.png")), false);
  assert.equal(gateModule.isBoundedDecodablePng(asset("brand/schools/namib-high/crest.png").subarray(0, 4000)), false);
  assert.equal(gateModule.isBoundedDecodablePng(new Uint8Array(0)), false);
  assert.equal(gateModule.isBoundedDecodablePng(null), false);
  assert.equal(gateModule.isBoundedDecodablePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), false);
});

test("no bundled official-document PNG can stall pdf-lib PNG decoding", async (t) => {
  const assets = [
    "public/brand/schools/namib-high/crest.png",
    "public/brand/governed/scolapro-document-backdrop.png",
    "public/brand/governed/namibia-coat-of-arms.png",
  ].filter((file) => existsSync(file));
  assert.ok(assets.length > 0);

  for (const file of assets) {
    const approved = await gateVerdict(file);
    const decoded = await boundedPdfDecode(file);
    if (approved) {
      assert.equal(decoded, "decoded", `${file} passed the gate and must decode within bounds`);
    } else {
      assert.equal(decoded, "decoded-or-gated", `${file} hangs neither: refused by the gate, JPEG fallback, or fast failure`);
    }
    t.diagnostic(`${file}: gate=${approved ? "approved" : "refused"} decode=${decoded}`);
  }
});

test("remote optional-logo retrieval is bounded and falls back to bundled or no logo", () => {
  const route = readFileSync(CLASS_ROUTE, "utf8");
  assert.match(route, /AbortSignal\.timeout\(CLASS_LIST_LOGO_FETCH_TIMEOUT_MS\)/);
  assert.match(route, /class-list remote logo unavailable; continuing with bundled or no logo/);
  assert.match(route, /CLASS_LIST_LOGO_MAX_BYTES/);

  const live = readFileSync(LIVE_PROFILE, "utf8");
  assert.match(live, /withAssetTimeout\(/);
  assert.match(live, /SCHOOL_DOCUMENT_SIGNING_TIMEOUT_MS/);
  assert.match(live, /Optional school logo is unavailable\./);
  assert.doesNotMatch(live, /createSignedUrl\(logoStoragePath, 3600\)\s*;/);
});

test("targeted exports resolve the roster once instead of standalone plus batch", () => {
  const route = readFileSync(CLASS_ROUTE, "utf8");
  const body = route.slice(route.indexOf("try {"));
  assert.match(body, /const requestedTargets = parseTargets\(url\);[\s\S]{0,400}if \(requestedTargets\.length\)/);
  assert.equal(
    (body.match(/await getClassListWorkspace\(/g) ?? []).length,
    2,
    "only the untargeted and legacy-label paths may call getClassListWorkspace",
  );
  assert.match(route, /only school-scoped targets are served/);
});

test("authorization and response contracts are unchanged", () => {
  const route = readFileSync(CLASS_ROUTE, "utf8");
  assert.match(route, /Unauthorized/);
  assert.match(route, /School membership required/);
  assert.match(route, /This class list is outside your active school class-list scope/);
  assert.match(route, /No roster is available in your active school class-list scope/);
  assert.match(route, /No valid class-list targets were supplied/);
  assert.match(route, /workspace\.options\.register_class\.find/);
  assert.match(route, /previewPdf \? "inline" : "attachment"/);
  assert.match(route, /X-ScolaPro-Page-Count/);
  assert.match(route, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
});

const gateCache = { module: null, dir: null };

after(() => {
  if (gateCache.dir) rmSync(gateCache.dir, { recursive: true, force: true });
});

async function loadGateForTest() {
  if (gateCache.module) return gateCache.module;
  // The gate is a dependency-free TypeScript module; the repository's own
  // TypeScript compiler transpiles it for this Node runtime. The server-only
  // boundary import is stripped because these regression tests execute the
  // pure validation logic, not the Next.js server boundary.
  const typescript = await import("typescript").catch(() => null);
  const compiler = typescript?.default ?? typescript;
  assert.ok(compiler?.transpileModule, "the installed TypeScript compiler must transpile the PNG gate");
  const source = readFileSync(PNG_GATE, "utf8").replace(/^import "server-only";\r?\n/m, "");
  const compile = compiler.transpileModule(source, {
    compilerOptions: { module: compiler.ModuleKind.ESNext, target: compiler.ScriptTarget.ES2022 },
  });
  const dir = mkdtempSync(path.join(tmpdir(), "class-list-png-gate-"));
  const file = path.join(dir, "official-document-png.mjs");
  writeFileSync(file, compile.outputText);
  gateCache.module = await import(pathToFileURL(file).href);
  gateCache.dir = dir;
  return gateCache.module;
}

async function gateVerdict(file) {
  const gateModule = await loadGateForTest();
  return gateModule.isBoundedDecodablePng(new Uint8Array(readFileSync(file)));
}

async function boundedPdfDecode(file) {
  const output = await new Promise((resolve) => {
    try {
      const stdout = execFileSync(
        process.execPath,
        ["--input-type=module", "-e", boundedDecodeProgram(file)],
        { cwd: process.cwd(), timeout: 8000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
      ).toString();
      resolve(stdout.trim());
    } catch (error) {
      resolve(error.signal === "SIGTERM" || error.code === "ETIMEDOUT" ? "HUNG" : `FAILED:${String(error.message).split("\n")[0]}`);
    }
  });
  assert.notEqual(output, "HUNG", `${file} stalled pdf-lib PNG decoding past the bounded decode budget`);
  return output.startsWith("DECODED") ? "decoded" : "decoded-or-gated";
}

function boundedDecodeProgram(file) {
  return [
    "import { readFileSync } from 'node:fs';",
    "import { createRequire } from 'node:module';",
    "const require = createRequire(process.cwd() + '/package.json');",
    "const { PDFDocument } = require('pdf-lib');",
    `const bytes = new Uint8Array(readFileSync(${JSON.stringify(file)}));`,
    "const pdf = await PDFDocument.create();",
    "try { await pdf.embedPng(bytes); console.log('DECODED'); }",
    "catch { try { await pdf.embedJpg(bytes); console.log('JPEG-FALLBACK'); } catch { console.log('SKIPPED'); } }",
  ].join("\n");
}
