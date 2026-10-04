import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export default {};", shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    const unresolved = path.join(repositoryRoot, "src", specifier.slice(2));
    const candidate = [unresolved, `${unresolved}.ts`, `${unresolved}.tsx`, path.join(unresolved, "index.ts")]
      .find((entry) => existsSync(entry));
    if (!candidate) throw new Error(`Unable to resolve repository alias ${specifier}`);
    return { url: pathToFileURL(candidate).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
