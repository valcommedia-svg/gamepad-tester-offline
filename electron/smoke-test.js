'use strict';

// Headless-ish self test, run with:  electron . --smoke-test=<output dir>
// Loads the real page, checks that every bundled resource works without a
// network, saves screenshots and reports any console error or blocked request.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const APP_READY = "!!document.querySelector('#btnconnect') && document.querySelectorAll('#modals-container .modal').length > 5";

const INSPECT = `(async () => {
  const out = {};
  out.origin = location.origin;
  out.secureContext = window.isSecureContext;
  out.webhid = 'hid' in navigator;
  out.navigatorLanguage = navigator.language;
  out.jquery = typeof window.$ === 'function' ? $.fn.jquery : false;
  out.bootstrap = typeof window.bootstrap === 'object' && !!window.bootstrap.Modal;
  out.connectButton = !!document.querySelector('#btnconnect');
  out.modalCount = document.querySelectorAll('#modals-container .modal').length;
  out.footerRemoved = !document.querySelector('body > footer') && !document.getElementById('footbody');
  out.bodyPaddingBottom = getComputedStyle(document.body).paddingBottom;
  try {
    await document.fonts.load('900 1em "Font Awesome 6 Free"');
    out.fontAwesome = document.fonts.check('900 1em "Font Awesome 6 Free"');
  } catch { out.fontAwesome = false; }
  out.fetch = {};
  for (const u of ['lang/ru_ru.json', 'vendor/bootstrap/css/bootstrap.rtl.min.css', 'favicon.svg']) {
    out.fetch[u] = (await fetch(u)).status;
  }
  try {
    localStorage.setItem('__smoke', '1');
    out.localStorage = localStorage.getItem('__smoke') === '1';
    localStorage.removeItem('__smoke');
  } catch { out.localStorage = false; }
  out.hidGetDevices = (await navigator.hid.getDevices()).length; // permission path, expects 0
  return out;
})()`;

// A synthetic gamepad injected into navigator.getGamepads(): a left stick that
// can circle, a right stick with a small constant offset, buttons, 125 Hz
// timestamps and a counting vibration actuator.
const FAKE_GAMEPAD = `(() => {
  const s = { lx: 0, ly: 0, rx: 0.03, ry: -0.02, buttons: {}, rumbles: 0, circle: false, t0: performance.now() };
  window.__fake = s;
  const button = (i) => { const v = s.buttons[i] || 0; return { pressed: v > 0.5, touched: v > 0, value: v }; };
  navigator.getGamepads = () => {
    const now = performance.now();
    if (s.circle) { // half a turn per second
      const a = ((now - s.t0) / 1000) * Math.PI;
      s.lx = Math.cos(a) * 0.92; s.ly = Math.sin(a) * 0.92;
    }
    return [{
      index: 0, id: 'Smoke Test Pad (STANDARD GAMEPAD Vendor: 0000 Product: 0000)', connected: true, mapping: 'standard',
      timestamp: Math.floor(now / 8) * 8,
      axes: [s.lx, s.ly, s.rx, s.ry],
      buttons: Array.from({ length: 17 }, (_, i) => button(i)),
      vibrationActuator: { type: 'dual-rumble', playEffect: async () => { s.rumbles += 1; return 'complete'; } },
    }];
  };
})()`;

async function waitFor(wc, expression, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await wc.executeJavaScript(expression)) return true;
    } catch { /* page not ready yet */ }
    await sleep(200);
  }
  return false;
}

async function reloadWithLang(wc, lang) {
  await wc.executeJavaScript(`localStorage.setItem('force_lang', ${JSON.stringify(lang)})`);
  const loaded = new Promise((resolve) => wc.once('did-finish-load', resolve));
  wc.reload();
  await loaded;
  return waitFor(wc, APP_READY);
}

async function screenshot(wc, file) {
  await sleep(900); // let modal animations settle
  fs.writeFileSync(file, (await wc.capturePage()).toPNG());
}

module.exports = async function smokeTest(win, outDir, probes) {
  fs.mkdirSync(outDir, { recursive: true });
  const wc = win.webContents;
  const results = {};
  const failures = [];
  const consoleErrors = [];
  const check = (name, ok, detail) => {
    results[name] = detail === undefined ? ok : { ok, detail };
    if (!ok) failures.push(name);
  };

  wc.on('console-message', (event, ...legacy) => {
    const level = event.level ?? legacy[0];
    const message = event.message ?? legacy[1];
    if (level === 'error' || level === 3) consoleErrors.push(String(message));
  });
  wc.on('did-fail-load', (_e, code, description, url) => {
    consoleErrors.push(`did-fail-load ${code} ${description} ${url}`);
  });

  const watchdog = setTimeout(() => {
    console.error('smoke test timed out');
    process.exit(2);
  }, 120000);

  try {
    // 1) default language
    const ready = await waitFor(wc, APP_READY);
    check('app-ready', ready);
    if (ready) {
      const info = await wc.executeJavaScript(INSPECT);
      results.inspect = info;
      check('secure-context', info.secureContext && info.origin === 'app://ds');
      check('webhid-available', info.webhid);
      check('jquery-local', !!info.jquery);
      check('bootstrap-local', info.bootstrap);
      check('fontawesome-font-loaded', info.fontAwesome);
      check('templates-loaded', info.modalCount > 5, info.modalCount);
      check('footer-removed', info.footerRemoved && info.bodyPaddingBottom === '16px', info.bodyPaddingBottom);
      check('fetch-works', Object.values(info.fetch).every((s) => s === 200), info.fetch);
      check('local-storage', info.localStorage);
      check('hid-getDevices-empty', info.hidGetDevices === 0, info.hidGetDevices);
      await screenshot(wc, path.join(outDir, '1-default.png'));

      // 2) right-to-left language: bootstrap.rtl.css must load from vendor/
      check('rtl-page-ready', await reloadWithLang(wc, 'ar_ar'));
      const rtl = await waitFor(wc, `document.documentElement.dir === 'rtl' && [...document.styleSheets].some(
        (s) => s.href && s.href.endsWith('vendor/bootstrap/css/bootstrap.rtl.min.css') && s.cssRules.length > 0)`);
      check('rtl-stylesheet', rtl);
      await screenshot(wc, path.join(outDir, '2-rtl-arabic.png'));

      // 3) Russian: translation json + Cyrillic glyphs
      check('ru-page-ready', await reloadWithLang(wc, 'ru_ru'));
      // (upstream leaves dir unset for LTR languages, so only rule out rtl)
      const ru = await waitFor(wc, `document.documentElement.lang === 'ru' && document.documentElement.dir !== 'rtl'
        && /[\\u0400-\\u04FF]/.test(document.body.innerText)`);
      check('translation-ru', ru);
      check('no-analytics-claim', await wc.executeJavaScript(
        `!/analytic|\\u0430\\u043d\\u0430\\u043b\\u0438\\u0442\\u0438\\u043a/i.test(document.getElementById('welcomeModal').textContent)`));
      await screenshot(wc, path.join(outDir, '3-russian.png'));

      // 4) Connect button -> WebHID chooser. main.js cancels the selection in
      // smoke mode, so this exercises the select-hid-device wiring without
      // touching real hardware, and the page must recover cleanly.
      await wc.executeJavaScript(
        "document.querySelector('#welcomeModal .btn-primary')?.click()", true).catch(() => {});
      await sleep(500);
      const selectionsBefore = probes.hidSelections().length;
      await wc.executeJavaScript("document.querySelector('#btnconnect').click()", true);
      const chooserCalled = await (async () => {
        for (let i = 0; i < 50; i += 1) {
          if (probes.hidSelections().length > selectionsBefore) return true;
          await sleep(200);
        }
        return false;
      })();
      check('hid-chooser-invoked', chooserCalled, probes.hidSelections());
      const recovered = await waitFor(wc,
        "!document.querySelector('#btnconnect').disabled && getComputedStyle(document.querySelector('#connectspinner')).display === 'none'");
      check('connect-recovers-after-cancel', recovered);
      await screenshot(wc, path.join(outDir, '4-after-connect-cancel.png'));

      // 5) Help > Copy diagnostics report: has the versions and the chooser
      // request from step 4, and must not leak the user's home directory.
      const report = probes.diagnostics();
      results.diagnostics = report;
      check('diagnostics-report',
        /Electron:\s+\d/.test(report)
        && /Connect dialog requests: [1-9]/.test(report)
        && !report.toLowerCase().includes(os.homedir().toLowerCase()),
        report.split('\n').slice(0, 4));

      // 5b) the visible "Xbox or another gamepad?" button under Connect on the main page
      const button = await wc.executeJavaScript(`(() => {
        const a = document.querySelector('#offlinebar a[href="gamepad.html"]');
        if (!a) return null;
        const r = a.getBoundingClientRect();
        return { text: a.textContent.trim(), visible: r.width > 100 && r.height > 20 && getComputedStyle(a).visibility === 'visible' };
      })()`);
      results.gamepadButton = button;
      check('gamepad-button-under-connect',
        !!button && button.visible && /Xbox/.test(button.text) && /[Ѐ-ӿ]/.test(button.text), button);
      await screenshot(wc, path.join(outDir, '4b-main-page-gamepad-button.png'));

      // 6) "Any gamepad" page, reached through the menu link and driven by a synthetic pad
      const link = await wc.executeJavaScript(
        "(() => { const a = document.querySelector('a[href=\"gamepad.html\"]'); return a ? a.textContent : null; })()");
      check('nav-link-translated', typeof link === 'string' && /[Ѐ-ӿ]/.test(link), link);
      await wc.executeJavaScript("document.querySelector('a[href=\"gamepad.html\"]').click()");
      check('nav-link-opens-in-app',
        await waitFor(wc, "location.pathname.endsWith('gamepad.html') && document.readyState === 'complete'"));

      await wc.executeJavaScript(FAKE_GAMEPAD);
      const padReady = await waitFor(wc, "!document.getElementById('panel').hidden");
      check('gamepad-page-ready', padReady);
      if (padReady) {
        await wc.executeJavaScript('Object.assign(window.__fake, { circle: true }); window.__fake.buttons[0] = 1; window.__fake.buttons[7] = 0.6; 0');
        await sleep(2600);
        const ui = await wc.executeJavaScript(`({
          cells: document.querySelectorAll('.btn-cell').length,
          axes: document.querySelectorAll('.axis-row').length,
          active: [...document.querySelectorAll('.btn-cell.active .name')].map((n) => n.textContent),
          rt: document.querySelectorAll('.btn-cell')[7].querySelector('.value').textContent,
          circ: document.getElementById('stick-left-circ').textContent,
          values: document.getElementById('stick-left-values').textContent,
          status: document.getElementById('status-text').textContent,
        })`);
        results.gamepadUi = ui;
        check('gamepad-buttons-and-axes', ui.cells === 17 && ui.axes === 4 && ui.active.includes('A') && ui.active.includes('RT') && ui.rt === '60%', ui);
        check('gamepad-status-shows-pad', ui.status.includes('Smoke Test Pad'), ui.status);
        const coverage = Number((/(\d+)%/.exec(ui.circ) || [])[1]);
        check('gamepad-circularity', coverage >= 90, ui.circ);

        // drift test: first a "moved" run must be rejected, then a valid one
        await wc.executeJavaScript(
          "Object.assign(window.__fake, { circle: false, lx: 0.8, ly: 0, rx: 0.03, ry: -0.02 }); document.getElementById('rest-start').click(); 0");
        const movedRejected = await waitFor(wc,
          "!document.getElementById('rest-start').disabled && document.getElementById('rest-message').classList.contains('text-warning')", 8000);
        check('gamepad-rest-rejects-moved-stick', movedRejected);

        await wc.executeJavaScript(
          "Object.assign(window.__fake, { lx: 0.01, ly: 0 }); document.getElementById('rest-start').click(); 0");
        const restDone = await waitFor(wc, "!document.getElementById('rest-table').hidden", 8000);
        const rows = restDone ? await wc.executeJavaScript(`[...document.querySelectorAll('#rest-rows tr')].map((tr) => ({
          side: tr.dataset.side, cells: [...tr.children].map((td) => td.textContent), verdict: tr.lastElementChild.dataset.verdict }))`) : [];
        results.gamepadRest = rows;
        const left = rows.find((r) => r.side === 'left');
        const right = rows.find((r) => r.side === 'right');
        check('gamepad-rest-results',
          !!left && !!right && left.verdict === 'good' && right.verdict === 'minor'
          && left.cells[3] === '1.0%' && right.cells[3] === '3.6%' && right.cells[4] === '5%', rows);

        // update-rate test: the synthetic pad updates every 8 ms = 125 Hz
        await wc.executeJavaScript("document.getElementById('poll-start').click(); 0");
        const pollDone = await waitFor(wc,
          "!document.getElementById('poll-start').disabled && /\\d+ (Гц|Hz)/.test(document.getElementById('poll-message').textContent)", 12000);
        const pollText = await wc.executeJavaScript("document.getElementById('poll-message').textContent");
        const hz = Number((/(\d+) (?:Гц|Hz)/.exec(pollText) || [])[1]);
        check('gamepad-update-rate', pollDone && hz >= 115 && hz <= 135, pollText);

        // vibration
        await wc.executeJavaScript("document.getElementById('rumble-both').click(); 0");
        await sleep(300);
        check('gamepad-vibration', (await wc.executeJavaScript('window.__fake.rumbles')) === 1);

        // report
        await sleep(700);
        const reportText = await wc.executeJavaScript("document.getElementById('report').value");
        results.gamepadReport = reportText;
        check('gamepad-report',
          /Smoke Test Pad/.test(reportText) && /Rest left/.test(reportText) && /Rest right/.test(reportText)
          && /Circularity left/.test(reportText) && /Update rate: 1[23]\d Hz/.test(reportText) && /at once: 2/.test(reportText),
          reportText.split('\n'));

        await wc.executeJavaScript('window.scrollTo(0, 0)');
        await screenshot(wc, path.join(outDir, '5-gamepad-top.png'));
        await wc.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
        await screenshot(wc, path.join(outDir, '5-gamepad-bottom.png'));
      }
    }

    const blocked = probes.blockedRequests();
    check('no-blocked-network-requests', blocked.length === 0, blocked);
    check('no-console-errors', consoleErrors.length === 0, consoleErrors);
  } catch (error) {
    check('unexpected-exception', false, String(error?.stack || error));
  } finally {
    clearTimeout(watchdog);
  }

  fs.writeFileSync(path.join(outDir, 'smoke-result.json'), JSON.stringify({ failures, results }, null, 2));
  console.log(JSON.stringify({ failures, results }, null, 2));
  console.log(failures.length ? `SMOKE TEST FAILED: ${failures.join(', ')}` : 'SMOKE TEST PASSED');
  return failures.length ? 1 : 0;
};
