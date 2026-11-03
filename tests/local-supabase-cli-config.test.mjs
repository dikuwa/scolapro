import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const config = readFileSync("supabase/config.toml", "utf8");
const workflows = ["e2e", "database"].map((name) => readFileSync(`.github/workflows/${name}.yml`, "utf8"));
const pins = workflows.map((source) => source.match(/SUPABASE_CLI_VERSION: "([\d.]+)"/)[1]);

test("local-stack workflows pin the same CLI and run config preflight before startup", () => {
  assert.equal(pins[0], pins[1]);
  for (const source of workflows) {
    assert.match(source, /version: \$\{\{ env.SUPABASE_CLI_VERSION \}\}/);
    assert.ok(source.indexOf("python3 scripts/validate-local-supabase-config.py") < source.indexOf("run: supabase"));
  }
  assert.match(workflows[0], /SUPABASE_LOCAL_SMTP_PORT/);
  assert.doesNotMatch(workflows[0], /SUPABASE_INBUCKET_PORT/);
});

for (const [name, content, version, passes] of [
  ["supported local mail capture", config, pins[0], true],
  ["removed inbucket section", config.replace("[local_smtp]", "[inbucket]"), pins[0], false],
  ["missing local mail section", config.replace("[local_smtp]", "[other_mail]"), pins[0], false],
  ["disabled mail capture", config.replace("[local_smtp]\nenabled = true", "[local_smtp]\nenabled = false"), pins[0], false],
  ["malformed TOML", `${config}\n[local_smtp`, pins[0], false],
  ["invalid mail port", config.replace("port = 54324", "port = 70000"), pins[0], false],
  ["CLI pin drift", config, "0.0.0", false],
]) {
  test(`local Supabase preflight ${passes ? "accepts" : "rejects"} ${name}`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), "scolapro-cli-preflight-"));
    try {
      writeFileSync(path.join(dir, "config.toml"), content);
      const cli = path.join(dir, "supabase");
      writeFileSync(cli, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`);
      chmodSync(cli, 0o755);
      const result = spawnSync("python3", ["scripts/validate-local-supabase-config.py", path.join(dir, "config.toml")], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, SUPABASE_CLI_VERSION: pins[0] },
      });
      assert.equal(result.status === 0, passes, result.stderr);
      if (!passes) assert.match(result.stderr, /preflight failed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
