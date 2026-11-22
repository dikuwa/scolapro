import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const button = read('src/components/ui/button.tsx');
const css = read('src/app/globals.css');

const variantClass = (key) => {
  const value = button.match(new RegExp(`"${key}": "([^"]+)"`))?.[1];
  assert.ok(value, `Missing canonical ${key} variant`);
  return value;
};

function contrast(foreground, background) {
  const channels = (hex) => hex.replace('#', '').match(/../g).map((v) => {
    const x = parseInt(v, 16) / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const luminance = (hex) => channels(hex).reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
  const [a, b] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (a + 0.05) / (b + 0.05);
}

test('Delete/Remove/Trash entry stays unfilled until hover and retains danger text', () => {
  const entry = variantClass('danger-ghost');
  assert.match(entry, /\bbg-transparent\b/);
  assert.match(entry, /\btext-\[color:var\(--danger-entry\)\]/);
  assert.match(entry, /\bhover:bg-/);
  assert.doesNotMatch(entry, /\bbg-danger-soft\b|\bbg-\[color:var\(--danger-soft\)\]/);
  assert.match(button, /focus-visible:ring-4/);
});

test('unfilled danger entry meets 4.5:1 on supported resting surfaces in each theme', () => {
  assert.match(css, /--danger-entry: #a63c4c;/);
  assert.equal((css.match(/--danger-entry: #ef8b9d;/g) ?? []).length, 2);
  const surfaces = {
    light: { text: '#a63c4c', backgrounds: ['#eef0ff', '#f5f7fb', '#fbfcfe', '#fff0f2', '#f1f4f8'] },
    dark: { text: '#ef8b9d', backgrounds: ['#252b4f', '#0f131b', '#151b25', '#3b2029', '#1a2230'] },
  };
  for (const [theme, { text, backgrounds }] of Object.entries(surfaces)) {
    for (const background of backgrounds) {
      assert.ok(contrast(text, background) >= 4.5, `${theme}: ${text} against ${background}`);
    }
  }
});

test('filled danger is limited to explicit final destructive confirmation variant', () => {
  const final = variantClass('danger-confirm');
  assert.match(final, /\bbg-\[color:var\(--danger\)\]/);
  assert.match(final, /\btext-\[color:var\(--on-danger\)\]/);
  assert.doesNotMatch(variantClass('danger-ghost'), /\btext-white\b/);
});

test('filled final confirmation has accessible text contrast in light and dark themes', () => {
  const light = { background: '#b94b5b', text: '#ffffff' };
  const dark = { background: '#ef8b9d', text: '#0f131b' };
  assert.match(css, /--danger: #b94b5b;\s*--danger-entry: #a63c4c;\s*--on-danger: #ffffff;/);
  assert.equal((css.match(/--danger: #ef8b9d;\s*--danger-entry: #ef8b9d;\s*--on-danger: #0f131b;/g) ?? []).length, 2);
  assert.ok(contrast(light.text, light.background) >= 4.5, 'Light theme AA contrast');
  assert.ok(contrast(dark.text, dark.background) >= 4.5, 'Dark theme AA contrast');
});

test('final destructive controls are distinct from initial entry and neutral Cancel', () => {
  const paths = [
    'src/features/calendar/operational-calendar-manager.tsx',
    'src/features/calendar/teaching-impact-manager.tsx',
    'src/features/calendar/department-activities-manager.tsx',
    'src/features/conduct/policy-settings.tsx',
    'src/features/imports/import-discard-confirmation.tsx',
  ];
  for (const path of paths) {
    const source = read(path);
    assert.match(source, /variant="danger-ghost"/i, `${path} must retain initial entry`);
    assert.match(source, /variant="danger-confirm"/i, `${path} must have filled final confirmation`);
    assert.doesNotMatch(source, /variant="danger"/i, `${path} must not retain ambiguous destructive commitment`);
  }
  assert.match(read('src/features/conduct/policy-settings.tsx'), /variant="neutral" onClick=\{\(\) => setConfirmDelete\(null\)\}/);
});
