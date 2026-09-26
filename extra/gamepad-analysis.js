// Pure functions behind the "any gamepad" page. No DOM, no browser APIs, so
// they are unit-tested with `npm test` (tests/gamepad-analysis.test.mjs).

export const STICK_BINS = 72; // 5 degrees each

/** Names of the Gamepad API "standard" layout (Xbox naming, arrows for the D-pad). */
export const STANDARD_BUTTONS = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', '↑', '↓', '←', '→', 'Home',
];

export function buttonLabel(index, mapping) {
  return mapping === 'standard' && index < STANDARD_BUTTONS.length ? STANDARD_BUTTONS[index] : `#${index}`;
}

// ---------------------------------------------------------------- drift ----

/** Displacement from center at which a stick still counts as "at rest". */
export function verdictFor(maxRadius) {
  if (maxRadius < 0.02) return 'good';
  if (maxRadius < 0.06) return 'minor';
  if (maxRadius < 0.15) return 'noticeable';
  return 'severe';
}

/** Smallest whole-percent dead zone that covers maxRadius, plus a 1% margin (0..1). */
export function recommendedDeadzone(maxRadius) {
  const percent = Math.ceil(maxRadius * 100 - 1e-9) + 1;
  return Math.min(100, Math.max(1, percent)) / 100;
}

/**
 * Analyse samples of a stick that is not being touched.
 * @param {{x: number, y: number}[]} samples axis values in -1..1
 */
export function analyzeRest(samples) {
  if (!samples.length) return null;

  let sumX = 0;
  let sumY = 0;
  let maxRadius = 0;
  for (const { x, y } of samples) {
    sumX += x;
    sumY += y;
    maxRadius = Math.max(maxRadius, Math.hypot(x, y));
  }
  const meanX = sumX / samples.length;
  const meanY = sumY / samples.length;

  let noise = 0;
  for (const { x, y } of samples) noise = Math.max(noise, Math.hypot(x - meanX, y - meanY));

  return {
    samples: samples.length,
    meanX,
    meanY,
    offset: Math.hypot(meanX, meanY), // constant off-center reading
    noise,                            // largest wobble around that reading
    maxRadius,                        // what a game's dead zone has to cover
    deadzone: recommendedDeadzone(maxRadius),
    verdict: verdictFor(maxRadius),
  };
}

/** True if the stick was clearly being pushed (so the rest test is meaningless). */
export function wasTouched(samples, limit = 0.4) {
  return samples.some(({ x, y }) => Math.hypot(x, y) > limit);
}

// ---------------------------------------------------------- circularity ----

export function angleBin(x, y, bins = STICK_BINS) {
  let angle = Math.atan2(y, x);
  if (angle < 0) angle += 2 * Math.PI;
  return Math.min(bins - 1, Math.floor((angle / (2 * Math.PI)) * bins));
}

/** Remember the furthest reading per direction; ignores small movements. */
export function updateExtents(extents, x, y, minRadius = 0.5) {
  const r = Math.hypot(x, y);
  if (r < minRadius) return;
  const bin = angleBin(x, y, extents.length);
  if (r > extents[bin]) extents[bin] = r;
}

/**
 * How round the stick's outer edge is. `error` is the mean deviation from the
 * mean radius (0 = perfect circle) and is null until half the directions were reached.
 */
export function analyzeCircularity(extents) {
  const reached = extents.filter((r) => r > 0);
  const coverage = reached.length / extents.length;
  if (coverage < 0.5) return { coverage, error: null };

  const meanRadius = reached.reduce((a, b) => a + b, 0) / reached.length;
  const deviation = reached.reduce((a, r) => a + Math.abs(r - meanRadius), 0) / reached.length;
  return {
    coverage,
    meanRadius,
    minRadius: Math.min(...reached),
    maxRadius: Math.max(...reached),
    error: deviation / meanRadius,
  };
}

// -------------------------------------------------------------- polling ----

/**
 * Update rate from Gamepad.timestamp readings sampled faster than the device
 * updates. Only changes of the timestamp count as updates.
 * @param {number[]} stamps timestamps in ms, in reading order
 */
export function analyzePolling(stamps) {
  const updates = stamps.filter((value, i) => i === 0 || value !== stamps[i - 1]);
  if (updates.length < 5) return null;

  const deltas = [];
  for (let i = 1; i < updates.length; i += 1) deltas.push(updates[i] - updates[i - 1]);

  const meanMs = (updates[updates.length - 1] - updates[0]) / (updates.length - 1);
  if (!(meanMs > 0)) return null;
  const variance = deltas.reduce((a, d) => a + (d - meanMs) ** 2, 0) / deltas.length;

  return {
    updates: updates.length,
    meanMs,
    hz: 1000 / meanMs,
    jitterMs: Math.sqrt(variance),
    minMs: Math.min(...deltas),
    maxMs: Math.max(...deltas),
  };
}

// --------------------------------------------------------------- report ----

const pct = (v, digits = 1) => `${(v * 100).toFixed(digits)}%`;

/** Plain-text summary for bug reports / comparing controllers. Always English. */
export function buildReport({ gamepad, rest, circularity, polling, maxSimultaneous }) {
  const lines = ['Gamepad report'];
  if (gamepad) {
    lines.push(
      `Device:  ${gamepad.id}`,
      `Layout:  ${gamepad.mapping || 'non-standard'}, ${gamepad.buttons} buttons, ${gamepad.axes} axes`,
    );
  }

  for (const [name, r] of Object.entries(rest ?? {})) {
    if (!r) continue;
    lines.push(
      `Rest ${name}: max deviation ${pct(r.maxRadius)}, offset ${pct(r.offset)}, noise ${pct(r.noise)}` +
      ` -> ${r.verdict}, suggested dead zone ${pct(r.deadzone, 0)}`,
    );
  }

  for (const [name, c] of Object.entries(circularity ?? {})) {
    if (!c) continue;
    lines.push(c.error === null
      ? `Circularity ${name}: not enough coverage (${pct(c.coverage, 0)})`
      : `Circularity ${name}: coverage ${pct(c.coverage, 0)}, roundness error ${pct(c.error)}, radius ${c.minRadius.toFixed(2)}..${c.maxRadius.toFixed(2)}`);
  }

  if (polling) {
    lines.push(`Update rate: ${polling.hz.toFixed(0)} Hz (avg ${polling.meanMs.toFixed(2)} ms, jitter ${polling.jitterMs.toFixed(2)} ms, ${polling.updates} updates)`);
  }
  if (maxSimultaneous) lines.push(`Most buttons pressed at once: ${maxSimultaneous}`);

  return `${lines.join('\n')}\n`;
}
