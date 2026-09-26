import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  STICK_BINS, analyzeCircularity, analyzePolling, analyzeRest, angleBin, buildReport,
  buttonLabel, recommendedDeadzone, updateExtents, verdictFor, wasTouched,
} from '../extra/gamepad-analysis.js';

const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) <= eps, `${actual} !~ ${expected}`);

test('buttonLabel uses standard names only for the standard mapping', () => {
  assert.equal(buttonLabel(0, 'standard'), 'A');
  assert.equal(buttonLabel(7, 'standard'), 'RT');
  assert.equal(buttonLabel(0, ''), '#0');
  assert.equal(buttonLabel(30, 'standard'), '#30');
});

test('verdict thresholds', () => {
  assert.equal(verdictFor(0), 'good');
  assert.equal(verdictFor(0.019), 'good');
  assert.equal(verdictFor(0.02), 'minor');
  assert.equal(verdictFor(0.059), 'minor');
  assert.equal(verdictFor(0.06), 'noticeable');
  assert.equal(verdictFor(0.149), 'noticeable');
  assert.equal(verdictFor(0.15), 'severe');
});

test('recommended dead zone rounds up to the next whole percent plus 1%', () => {
  assert.equal(recommendedDeadzone(0), 0.01);
  assert.equal(recommendedDeadzone(0.01), 0.02); // 0.01 * 100 is 1.0000000000000002 in floating point
  assert.equal(recommendedDeadzone(0.03), 0.04);
  assert.equal(recommendedDeadzone(0.036), 0.05);
  assert.equal(recommendedDeadzone(5), 1); // capped
});

test('analyzeRest: constant offset', () => {
  const r = analyzeRest(Array.from({ length: 100 }, () => ({ x: 0.03, y: -0.02 })));
  near(r.offset, Math.hypot(0.03, 0.02));
  near(r.noise, 0);
  near(r.maxRadius, Math.hypot(0.03, 0.02));
  assert.equal(r.verdict, 'minor');
  assert.equal(r.deadzone, 0.05);
});

test('analyzeRest: perfectly centered stick with a little noise', () => {
  const samples = [{ x: 0.004, y: 0 }, { x: -0.004, y: 0 }, { x: 0, y: 0.004 }, { x: 0, y: -0.004 }];
  const r = analyzeRest(samples);
  near(r.offset, 0);
  near(r.noise, 0.004);
  assert.equal(r.verdict, 'good');
  assert.equal(r.deadzone, 0.02);
});

test('analyzeRest: empty input', () => {
  assert.equal(analyzeRest([]), null);
});

test('wasTouched detects a pushed stick', () => {
  assert.equal(wasTouched([{ x: 0.01, y: 0 }, { x: 0.1, y: 0.1 }]), false);
  assert.equal(wasTouched([{ x: 0.01, y: 0 }, { x: 0.5, y: 0.1 }]), true);
});

test('angleBin covers the circle evenly, y axis pointing down', () => {
  assert.equal(angleBin(1, 0), 0);
  assert.equal(angleBin(0, 1), STICK_BINS / 4);
  assert.equal(angleBin(-1, 0), STICK_BINS / 2);
  assert.equal(angleBin(0, -1), (STICK_BINS * 3) / 4);
  assert.equal(angleBin(1, -1e-12), STICK_BINS - 1); // just below the x axis wraps to the last bin
});

function fullCircle(radiusAt, steps = 720) {
  const extents = new Array(STICK_BINS).fill(0);
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * 2 * Math.PI;
    const r = radiusAt(a);
    updateExtents(extents, Math.cos(a) * r, Math.sin(a) * r);
  }
  return extents;
}

test('circularity: perfect circle', () => {
  const c = analyzeCircularity(fullCircle(() => 1));
  assert.equal(c.coverage, 1);
  near(c.error, 0, 0.01);
  near(c.maxRadius, 1, 0.001);
});

test('circularity: flattened stick has a visible error', () => {
  const c = analyzeCircularity(fullCircle((a) => 0.75 + 0.25 * Math.abs(Math.cos(a))));
  assert.equal(c.coverage, 1);
  assert.ok(c.error > 0.05, `error ${c.error}`);
  assert.ok(c.minRadius < c.maxRadius);
});

test('circularity: reports no result until half the directions were reached', () => {
  const extents = new Array(STICK_BINS).fill(0);
  for (let i = 0; i < 20; i += 1) updateExtents(extents, Math.cos(i * 0.1), Math.sin(i * 0.1));
  const c = analyzeCircularity(extents);
  assert.equal(c.error, null);
  assert.ok(c.coverage < 0.5);
});

test('updateExtents ignores small movements and keeps the maximum', () => {
  const extents = new Array(STICK_BINS).fill(0);
  updateExtents(extents, 0.3, 0);
  assert.equal(extents[0], 0);
  updateExtents(extents, 0.8, 0);
  updateExtents(extents, 0.6, 0);
  assert.equal(extents[0], 0.8);
});

test('analyzePolling: 125 Hz device sampled much faster than it updates', () => {
  const stamps = [];
  for (let t = 0; t < 5000; t += 1) stamps.push(Math.floor(t / 8) * 8); // 1 ms readings, 8 ms updates
  const p = analyzePolling(stamps);
  near(p.hz, 125, 0.5);
  near(p.meanMs, 8, 0.01);
  near(p.jitterMs, 0, 1e-9);
  assert.equal(p.updates, 625);
});

test('analyzePolling: jitter is measured', () => {
  const stamps = [];
  let t = 0;
  for (let i = 0; i < 200; i += 1) { stamps.push(t); t += i % 2 ? 6 : 10; }
  const p = analyzePolling(stamps);
  near(p.meanMs, 8, 0.05);
  near(p.jitterMs, 2, 0.05);
  assert.equal(p.minMs, 6);
  assert.equal(p.maxMs, 10);
});

test('analyzePolling: needs data', () => {
  assert.equal(analyzePolling([]), null);
  assert.equal(analyzePolling([5, 5, 5, 5, 5, 5]), null); // never changed
  assert.equal(analyzePolling([1, 2, 3]), null);
});

test('buildReport lists what was measured and skips what was not', () => {
  const text = buildReport({
    gamepad: { id: 'Pad (STANDARD GAMEPAD)', mapping: 'standard', buttons: 17, axes: 4 },
    rest: { left: analyzeRest([{ x: 0.01, y: 0 }]), right: null },
    circularity: { left: analyzeCircularity(fullCircle(() => 1)) },
    polling: analyzePolling(Array.from({ length: 50 }, (_, i) => i * 8)),
    maxSimultaneous: 3,
  });
  assert.match(text, /Device:  Pad/);
  assert.match(text, /Rest left: max deviation 1\.0%/);
  assert.doesNotMatch(text, /Rest right/);
  assert.match(text, /Circularity left: coverage 100%/);
  assert.match(text, /Update rate: 125 Hz/);
  assert.match(text, /at once: 3/);
});
