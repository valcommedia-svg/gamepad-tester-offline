'use strict';

// Headless-ish self test, run with:  electron . --smoke-test=<output dir>
// Loads the real page, checks that every bundled resource works without a
// network, saves screenshots and reports any console error or blocked request.

const fs = require('node:fs');
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
