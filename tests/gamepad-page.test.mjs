import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { KEYS, RU_KEYS, makeT } from '../extra/gamepad-i18n.js';

const html = fs.readFileSync(fileURLToPath(new URL('../extra/gamepad.html', import.meta.url)), 'utf8');
const js = fs.readFileSync(fileURLToPath(new URL('../extra/gamepad.js', import.meta.url)), 'utf8');

test('Russian has exactly the same keys as English', () => {
  assert.deepEqual([...RU_KEYS].sort(), [...KEYS].sort());
});

test('placeholders match between languages', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const en = makeT('en');
  const ru = makeT('ru');
  for (const key of KEYS) {
    // makeT returns the template untouched when no vars are given
    assert.deepEqual(placeholders(ru(key)), placeholders(en(key)), `placeholders differ for "${key}"`);
  }
});

test('every data-i18n key used in the HTML exists', () => {
  const used = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 20);
  for (const key of used) assert.ok(KEYS.includes(key), `unknown i18n key in gamepad.html: ${key}`);
});

test('every t("key") call in gamepad.js uses an existing key (template keys checked by prefix)', () => {
  for (const [, key] of js.matchAll(/\bt\('([^']+)'/g)) assert.ok(KEYS.includes(key), `unknown key: ${key}`);
  for (const [, prefix] of js.matchAll(/\bt\(`([a-z.]+)\$\{/g)) {
    assert.ok(KEYS.some((k) => k.startsWith(prefix)), `no keys start with ${prefix}`);
  }
});

test('every id the script looks up exists in the HTML', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, id] of js.matchAll(/\$\('([a-z-]+)'\)/g)) assert.ok(ids.has(id), `missing element #${id}`);
  // ids built from a side name
  for (const side of ['left', 'right']) {
    for (const suffix of ['', '-values', '-circ']) assert.ok(ids.has(`stick-${side}${suffix}`), `missing #stick-${side}${suffix}`);
  }
});

test('gamepad.html has no inline scripts (all code is in gamepad.js)', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
});

test('makeT falls back to English for a missing key and fills variables', () => {
  const t = makeT('ru');
  assert.equal(t('no.such.key'), 'no.such.key');
  assert.match(t('pressed', { now: 2, max: 3 }), /2.*3/);
});
