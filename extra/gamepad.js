// "Any gamepad" test page. Reads the standard Gamepad API, so it works offline
// with Xbox / PlayStation / Switch Pro / 8BitDo and other controllers.
// Measurement maths lives in gamepad-analysis.js (unit-tested).

import {
  STICK_BINS, analyzeCircularity, analyzePolling, analyzeRest, buildReport, buttonLabel, updateExtents, wasTouched,
} from './gamepad-analysis.js';
import { detectLang, makeT } from './gamepad-i18n.js';

const lang = detectLang();
const t = makeT(lang);
const $ = (id) => document.getElementById(id);

const REST_MS = 3000;
const POLL_MS = 5000;
const TRAIL_LENGTH = 40;
const REPORT_REFRESH_MS = 500;
const SIDES = ['left', 'right'];
const STICK_AXES = { left: [0, 1], right: [2, 3] };
const VERDICT_BADGE = {
  good: 'text-bg-success', minor: 'text-bg-info', noticeable: 'text-bg-warning', severe: 'text-bg-danger',
};

const state = {
  index: null,
  signature: '',
  extents: { left: new Array(STICK_BINS).fill(0), right: new Array(STICK_BINS).fill(0) },
  trails: { left: [], right: [] },
  rest: { running: false, startedAt: 0, samples: { left: [], right: [] }, result: { left: null, right: null } },
  poll: { running: false, startedAt: 0, stamps: [], result: null },
  maxSimultaneous: 0,
  colors: null,
  statusKey: '',
  lastReportAt: 0,
};

let cells = [];
let axisRows = [];
let pickerKey = null;

// ------------------------------------------------------------------ i18n ---

function applyI18n() {
  document.documentElement.lang = lang;
  document.title = t('page.title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}

// ----------------------------------------------------------------- theme ---

function applyTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);
  state.colors = null; // re-read CSS colors for the canvases
}

/** Shares the theme choice with the main page (same localStorage key). */
function initTheme() {
  const toggle = $('colorModeSwitch');
  let stored = null;
  try { stored = localStorage.getItem('preferredTheme'); } catch { /* storage unavailable */ }
  const theme = stored ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(theme);
  toggle.checked = theme === 'dark';
  toggle.addEventListener('change', () => {
    const next = toggle.checked ? 'dark' : 'light';
    applyTheme(next);
    try { localStorage.setItem('preferredTheme', next); } catch { /* ignore */ }
  });
}

function colors() {
  if (!state.colors) {
    const css = getComputedStyle(document.documentElement);
    const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    state.colors = {
      text: read('--bs-body-color', '#dee2e6'),
      grid: read('--bs-border-color', '#495057'),
      bg: read('--bs-tertiary-bg', '#2b3035'),
      primary: read('--bs-primary', '#0d6efd'),
    };
  }
  return state.colors;
}

// -------------------------------------------------------------- gamepads ---

const readPads = () => Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter((p) => p && p.connected);
const padByIndex = (index) => (navigator.getGamepads ? navigator.getGamepads()[index] : null) ?? null;
const percent = (v, digits = 1) => `${(v * 100).toFixed(digits)}%`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function resetForPad() {
  for (const side of SIDES) {
    state.extents[side].fill(0);
    state.trails[side] = [];
    state.rest.result[side] = null;
  }
  state.rest.running = false;
  state.poll.running = false;
  state.poll.result = null;
  state.maxSimultaneous = 0;
  state.signature = '';
  $('rest-table').hidden = true;
  $('rest-message').textContent = '';
  $('rest-progress').style.width = '0%';
  $('poll-message').textContent = '';
  $('poll-progress').style.width = '0%';
  $('rest-start').disabled = false;
  $('poll-start').disabled = false;
}

function updatePicker(pads) {
  const key = pads.map((p) => `${p.index}:${p.id}`).join('|');
  if (key === pickerKey) return;
  pickerKey = key;

  const picker = $('picker');
  picker.replaceChildren(...pads.map((p) => new Option(`${p.index}: ${p.id}`, String(p.index))));
  $('picker-wrap').hidden = pads.length < 2;
  if (state.index !== null && pads.some((p) => p.index === state.index)) picker.value = String(state.index);
}

/** Rebuilds the per-button / per-axis widgets when a different pad is selected. */
function buildWidgets(gp) {
  const grid = $('button-grid');
  grid.replaceChildren();
  cells = gp.buttons.map((_, i) => {
    const cell = el('div', 'btn-cell');
    const fill = el('span', 'fill');
    const value = el('span', 'value');
    cell.append(fill, el('span', 'name', buttonLabel(i, gp.mapping)), value);
    grid.append(cell);
    return { cell, fill, value };
  });

  const list = $('axis-list');
  list.replaceChildren();
  axisRows = Array.from({ length: gp.axes.length }, (_, i) => {
    const row = el('div', 'axis-row');
    const bar = el('div', 'bar');
    const marker = el('span', 'marker');
    const text = el('span', 'font-monospace text-end');
    bar.append(marker);
    row.append(el('span', '', `#${i}`), bar, text);
    list.append(row);
    return { marker, text };
  });

  const canVibrate = typeof gp.vibrationActuator?.playEffect === 'function';
  for (const id of ['rumble-weak', 'rumble-strong', 'rumble-both']) $(id).disabled = !canVibrate;
  $('rumble-message').textContent = canVibrate ? '' : t('rumble.unsupported');
}

function setStatus(gp) {
  const key = gp ? `${gp.index}|${gp.id}|${gp.mapping}|${gp.buttons.length}|${gp.axes.length}` : '';
  if (key === state.statusKey) return;
  state.statusKey = key;

  const status = $('status');
  status.classList.toggle('alert-success', !!gp);
  status.classList.toggle('alert-secondary', !gp);
  $('status-text').textContent = gp
    ? `${t('connected')} ${gp.id} — ${gp.mapping === 'standard' ? t('layout.standard') : t('layout.other')}, ${t('counts', { buttons: gp.buttons.length, axes: gp.axes.length })}`
    : t('hint');
  $('panel').hidden = !gp;
}

// --------------------------------------------------------------- drawing ---

function drawStick(canvas, x, y, trail, extents) {
  const c = colors();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const size = canvas.clientWidth || 240;
  const pixels = Math.round(size * dpr);
  if (canvas.width !== pixels) { canvas.width = pixels; canvas.height = pixels; }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 10;
  const TAU = Math.PI * 2;

  ctx.fillStyle = c.bg;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

  ctx.strokeStyle = c.grid;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.arc(cx, cy, R / 2, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.stroke();

  // furthest point reached in each direction (pen lifts where nothing was reached)
  ctx.strokeStyle = c.primary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  let penDown = false;
  extents.forEach((r, i) => {
    if (r <= 0) { penDown = false; return; }
    const a = ((i + 0.5) / extents.length) * TAU;
    const px = cx + Math.cos(a) * r * R;
    const py = cy + Math.sin(a) * r * R;
    if (penDown) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    penDown = true;
  });
  ctx.stroke();

  ctx.fillStyle = c.primary;
  trail.forEach((p, i) => {
    ctx.globalAlpha = ((i + 1) / trail.length) * 0.5;
    ctx.beginPath(); ctx.arc(cx + p.x * R, cy + p.y * R, 3, 0, TAU); ctx.fill();
  });
  ctx.globalAlpha = 1;

  ctx.fillStyle = c.text;
  ctx.beginPath(); ctx.arc(cx + x * R, cy + y * R, 6, 0, TAU); ctx.fill();
}

// ---------------------------------------------------------------- render ---

function renderPad(gp, now) {
  const signature = `${gp.index}|${gp.id}|${gp.buttons.length}|${gp.axes.length}|${gp.mapping}`;
  if (signature !== state.signature) { state.signature = signature; buildWidgets(gp); }

  let pressed = 0;
  gp.buttons.forEach((b, i) => {
    const cell = cells[i];
    if (!cell) return;
    if (b.pressed) pressed += 1;
    cell.cell.classList.toggle('active', b.pressed);
    cell.fill.style.width = `${Math.round(b.value * 100)}%`;
    cell.value.textContent = b.value > 0 && b.value < 1 ? `${Math.round(b.value * 100)}%` : '';
  });
  state.maxSimultaneous = Math.max(state.maxSimultaneous, pressed);
  $('pressed').textContent = t('pressed', { now: pressed, max: state.maxSimultaneous });

  gp.axes.forEach((v, i) => {
    const row = axisRows[i];
    if (!row) return;
    row.marker.style.left = `${((v + 1) / 2) * 100}%`;
    row.text.textContent = v.toFixed(3);
  });

  for (const side of SIDES) {
    const [ix, iy] = STICK_AXES[side];
    const values = $(`stick-${side}-values`);
    const circ = $(`stick-${side}-circ`);
    if (gp.axes.length <= iy) { values.textContent = '—'; circ.textContent = ''; continue; }

    const x = gp.axes[ix];
    const y = gp.axes[iy];
    updateExtents(state.extents[side], x, y);
    const trail = state.trails[side];
    trail.push({ x, y });
    if (trail.length > TRAIL_LENGTH) trail.shift();
    drawStick($(`stick-${side}`), x, y, trail, state.extents[side]);

    values.textContent = `X ${x.toFixed(3)}  Y ${y.toFixed(3)}  R ${percent(Math.hypot(x, y))}`;
    const c = analyzeCircularity(state.extents[side]);
    circ.textContent = c.error === null
      ? t('circ.need')
      : t('circ.result', { coverage: (c.coverage * 100).toFixed(0), error: (c.error * 100).toFixed(1) });

    if (state.rest.running) state.rest.samples[side].push({ x, y });
  }

  if (state.rest.running) {
    const elapsed = now - state.rest.startedAt;
    $('rest-progress').style.width = `${Math.min(100, (elapsed / REST_MS) * 100)}%`;
    $('rest-message').className = 'small mt-2';
    $('rest-message').textContent = t('drift.running', { sec: Math.max(0, Math.ceil((REST_MS - elapsed) / 1000)) });
    if (elapsed >= REST_MS) finishRest();
  }

  if (state.poll.running) {
    const elapsed = performance.now() - state.poll.startedAt;
    $('poll-progress').style.width = `${Math.min(100, (elapsed / POLL_MS) * 100)}%`;
    $('poll-message').className = 'small mt-2';
    $('poll-message').textContent = t('poll.running', { sec: Math.max(0, Math.ceil((POLL_MS - elapsed) / 1000)) });
  }

  if (now - state.lastReportAt > REPORT_REFRESH_MS) { state.lastReportAt = now; updateReport(gp); }
}

// ------------------------------------------------------------ drift test ---

function startRest() {
  if (state.rest.running || !readPads().length) return;
  state.rest.samples = { left: [], right: [] };
  state.rest.result = { left: null, right: null };
  state.rest.startedAt = performance.now();
  state.rest.running = true;
  $('rest-start').disabled = true;
  $('rest-table').hidden = true;
}

function finishRest() {
  state.rest.running = false;
  $('rest-start').disabled = false;
  $('rest-progress').style.width = '100%';

  const message = $('rest-message');
  if (SIDES.some((side) => wasTouched(state.rest.samples[side]))) {
    message.className = 'small mt-2 text-warning';
    message.textContent = t('drift.moved');
    return;
  }

  message.textContent = '';
  const rows = $('rest-rows');
  rows.replaceChildren();
  for (const side of SIDES) {
    const r = analyzeRest(state.rest.samples[side]);
    state.rest.result[side] = r;
    if (!r) continue;

    const tr = el('tr');
    tr.dataset.side = side;
    tr.append(
      el('td', '', t(`stick.${side}`)),
      el('td', 'font-monospace', percent(r.offset)),
      el('td', 'font-monospace', percent(r.noise)),
      el('td', 'font-monospace', percent(r.maxRadius)),
      el('td', 'font-monospace', percent(r.deadzone, 0)),
    );
    const verdict = el('td');
    verdict.append(el('span', `badge ${VERDICT_BADGE[r.verdict]}`, t(`verdict.${r.verdict}`)));
    verdict.dataset.verdict = r.verdict;
    tr.append(verdict);
    rows.append(tr);
  }
  $('rest-table').hidden = !rows.children.length;
  updateReport();
}

// ---------------------------------------------------- update-rate test ---

/**
 * Reads Gamepad.timestamp far more often than animation frames (a MessageChannel
 * loop yields to rendering between reads) and counts how often it changes.
 */
function startPoll() {
  if (state.poll.running || !readPads().length) return;
  state.poll.stamps = [];
  state.poll.result = null;
  state.poll.startedAt = performance.now();
  state.poll.running = true;
  $('poll-start').disabled = true;

  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    if (!state.poll.running) { channel.port1.close(); return; }
    const pad = padByIndex(state.index);
    if (pad) state.poll.stamps.push(pad.timestamp);
    if (performance.now() - state.poll.startedAt >= POLL_MS) {
      channel.port1.close();
      finishPoll();
      return;
    }
    channel.port2.postMessage(0);
  };
  channel.port2.postMessage(0);
}

function finishPoll() {
  state.poll.running = false;
  $('poll-start').disabled = false;
  $('poll-progress').style.width = '100%';

  const result = analyzePolling(state.poll.stamps);
  state.poll.result = result;
  const message = $('poll-message');
  message.className = result ? 'mt-2 fw-semibold' : 'small mt-2 text-warning';
  message.textContent = result
    ? t('poll.result', {
      hz: result.hz.toFixed(0), ms: result.meanMs.toFixed(2), jitter: result.jitterMs.toFixed(2), n: result.updates,
    })
    : t('poll.nodata');
  updateReport();
}

// ------------------------------------------------------------- vibration ---

async function rumble(strong, weak) {
  const actuator = padByIndex(state.index)?.vibrationActuator;
  const message = $('rumble-message');
  if (typeof actuator?.playEffect !== 'function') { message.textContent = t('rumble.unsupported'); return; }
  try {
    await actuator.playEffect(actuator.type || 'dual-rumble', {
      startDelay: 0, duration: 800, strongMagnitude: strong, weakMagnitude: weak,
    });
    message.textContent = '';
  } catch (error) {
    message.textContent = t('rumble.failed', { error: error?.message ?? error });
  }
}

// ---------------------------------------------------------------- report ---

function updateReport(gp = padByIndex(state.index)) {
  const report = $('report');
  if (!gp) { report.value = t('report.empty'); return; }

  const circularity = {};
  for (const side of SIDES) {
    const c = analyzeCircularity(state.extents[side]);
    if (c.coverage > 0) circularity[side] = c;
  }
  const text = buildReport({
    gamepad: { id: gp.id, mapping: gp.mapping, buttons: gp.buttons.length, axes: gp.axes.length },
    rest: state.rest.result,
    circularity,
    polling: state.poll.result,
    maxSimultaneous: state.maxSimultaneous,
  });
  if (report.value !== text) report.value = text;
}

async function copyReport() {
  const message = $('report-message');
  try {
    await navigator.clipboard.writeText($('report').value);
    message.textContent = t('report.copied');
  } catch {
    $('report').select();
    message.textContent = t('report.failed');
  }
}

// ------------------------------------------------------------------ main ---

function frame(now) {
  const pads = readPads();
  updatePicker(pads);

  const gp = pads.find((p) => p.index === state.index) ?? pads[0] ?? null;
  if (gp && gp.index !== state.index) { state.index = gp.index; resetForPad(); }
  setStatus(gp);
  if (gp) renderPad(gp, now);
  else state.signature = '';

  requestAnimationFrame(frame);
}

applyI18n();
initTheme();
$('picker').addEventListener('change', (e) => { state.index = Number(e.target.value); resetForPad(); });
$('stick-reset').addEventListener('click', () => {
  for (const side of SIDES) { state.extents[side].fill(0); state.trails[side] = []; }
});
$('rest-start').addEventListener('click', startRest);
$('poll-start').addEventListener('click', startPoll);
$('rumble-weak').addEventListener('click', () => rumble(0, 1));
$('rumble-strong').addEventListener('click', () => rumble(1, 0));
$('rumble-both').addEventListener('click', () => rumble(1, 1));
$('report-copy').addEventListener('click', copyReport);
requestAnimationFrame(frame);
