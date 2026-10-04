import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const sofficePath = process.env.SCOLAPRO_SOFFICE_PATH;

test("generated workbooks open and convert in an independent office reader", {
  skip: !sofficePath && "Set SCOLAPRO_SOFFICE_PATH to exercise independent XLSX acceptance",
  timeout: 180_000,
}, async () => {
  await access(sofficePath);
  const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "scolapro-xlsx-reader-"));
  const pdfDirectory = path.join(fixtureDirectory, "pdf");

  try {
    await mkdir(pdfDirectory);
    await execFileAsync(process.execPath, [
      "--experimental-transform-types",
      "--experimental-loader",
      new URL("./helpers/typescript-alias-loader.mjs", import.meta.url).pathname,
      new URL("./helpers/class-list-xlsx-generated-worker.mjs", import.meta.url).pathname,
    ], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, SCOLAPRO_XLSX_OUTPUT_DIR: fixtureDirectory },
    });

    const workbookNames = [
      "class-list-single.xlsx",
      "class-list-batch.xlsx",
      "sports-house-roster.xlsx",
      "academic-schedule.xlsx",
    ];
    await Promise.all(workbookNames.map((name) => access(path.join(fixtureDirectory, name))));

    const { stdout, stderr } = await execFileAsync(sofficePath, [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      pdfDirectory,
      ...workbookNames.map((name) => path.join(fixtureDirectory, name)),
    ]);
    assert.doesNotMatch(`${stdout}\n${stderr}`, /error|repair|corrupt/i);

    const converted = (await readdir(pdfDirectory)).filter((name) => name.endsWith(".pdf"));
    assert.deepEqual(converted.sort(), workbookNames.map((name) => name.replace(/\.xlsx$/, ".pdf")).sort());
    for (const name of converted) {
      assert.ok((await stat(path.join(pdfDirectory, name))).size > 0, `${name} should contain rendered output`);
    }
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});
