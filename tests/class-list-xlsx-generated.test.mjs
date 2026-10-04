import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("single and batch class-list XLSX packages round-trip with valid relationships", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-transform-types",
    "--experimental-loader",
    new URL("./helpers/typescript-alias-loader.mjs", import.meta.url).pathname,
    new URL("./helpers/class-list-xlsx-generated-worker.mjs", import.meta.url).pathname,
  ], { cwd: new URL("..", import.meta.url).pathname });

  assert.match(stdout, /internally consistent/);
});
