import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/ui/destructive-action-guard.tsx", import.meta.url), "utf8");

test("one-time destructive submit replay is cleared even when native validation suppresses submit", () => {
  const replay = source.slice(source.indexOf("confirmedForms.add(form);"));
  assert.match(replay, /confirmedForms\.add\(form\);\s*try\s*\{/);
  assert.match(replay, /form\.requestSubmit\(submitter\)/);
  assert.match(replay, /\}\s*finally\s*\{[\s\S]*?confirmedForms\.delete\(form\);/);
  assert.ok(replay.indexOf("confirmedForms.delete(form)") > replay.indexOf("form.requestSubmit()"));
});

test("capture handler consumes replay token exactly once while leaving ordinary destructive submissions gated", () => {
  const handler = source.slice(source.indexOf("function onSubmit(event: SubmitEvent)"), source.indexOf('document.addEventListener("submit", onSubmit, true)'));
  assert.match(handler, /if \(confirmedForms\.has\(form\)\)\s*\{\s*confirmedForms\.delete\(form\);\s*return;/);
  assert.match(handler, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  assert.match(handler, /setPending\(\{ form, submitter, action: label \}\)/);
});

test("a simulated validity change cannot keep a stale token for the next user submit", () => {
  const confirmedForms = new WeakSet();
  const form = {};
  let dialogs = 1;
  let actions = 0;
  const capture = () => {
    if (confirmedForms.has(form)) { confirmedForms.delete(form); actions++; return; }
    dialogs++;
  };
  const requestSubmit = (valid) => { if (valid) capture(); };
  confirmedForms.add(form);
  try { requestSubmit(false); } finally { confirmedForms.delete(form); }
  capture();
  assert.equal(dialogs, 2, "a second valid user click must reopen confirmation");
  assert.equal(actions, 0, "no destructive form action without a new confirmation");
  confirmedForms.add(form);
  try { requestSubmit(true); } finally { confirmedForms.delete(form); }
  assert.equal(actions, 1, "confirmed valid replay proceeds once");
  capture();
  assert.equal(dialogs, 3, "subsequent user action requires confirmation again");
});
