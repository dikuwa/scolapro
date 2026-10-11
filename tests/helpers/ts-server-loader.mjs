// Test-only ESM loader that lets node:test import ScolaPro server-only TypeScript
// modules directly. It transpiles `@/...` TypeScript sources on the fly and
// stubs the `server-only` guard so renderers can be exercised as real functions
// instead of asserted against their source text.
//
// This loader is intentionally limited to the test process. It does not change
// application runtime behaviour.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";
import ts from "typescript";

const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcRoot = join(repoRoot, "src");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

// A single stub module that satisfies the named imports used by server modules
// under test. The functions are never called by the pure aggregation/render
// paths that tests exercise.
const STUB_SOURCE = [
  "const stub = () => { throw new Error('stubbed server dependency invoked in tests'); };",
  "export const createSupabaseServerClient = stub;",
  "export const createSupabaseClient = stub;",
  "export const createServerClient = stub;",
  "export const cookies = stub;",
  "export const headers = stub;",
  "export const redirect = stub;",
  "export const notFound = stub;",
  "export const revalidatePath = stub;",
  "export const revalidateTag = stub;",
  "export const unstable_cache = (fn) => fn;",
  "export const cache = (fn) => fn;",
  "export default {};",
].join("\n");
const EMPTY_MODULE_URL = `data:text/javascript,${encodeURIComponent(STUB_SOURCE)}`;
const STUBBED = new Set([
  "server-only",
  "client-only",
  // Request-scoped infrastructure that cannot run in a plain node:test process.
  // Pure aggregation/render functions under test do not invoke these.
  "@/lib/supabase/server",
  "next/headers",
  "next/navigation",
  "next/cache",
]);

function resolveSrcPath(specifier) {
  const base = join(srcRoot, specifier.slice(2));
  const candidates = [base, ...EXTENSIONS.map((ext) => `${base}${ext}`)];
  candidates.push(...EXTENSIONS.map((ext) => join(base, `index${ext}`)));
  for (const candidate of candidates) {
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      return candidate;
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (STUBBED.has(specifier)) {
    return { url: EMPTY_MODULE_URL, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const resolved = resolveSrcPath(specifier);
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.endsWith(".ts") || url.endsWith(".tsx") || url.endsWith(".mts")) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return next(url, context);
}
