// Builds the offline web bundle into ./web:
//   1. fetch upstream sources at the pinned commit
//   2. apply offline patches (scripts/patches.mjs)
//   3. run upstream's own production build (gulp + rollup + sass)
//   4. copy dist -> web and add vendored bootstrap / jquery / fontawesome
//   5. verify nothing in the bundle still points at the network
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchUpstream, upstreamDir } from './fetch-upstream.mjs';
import { CSP, applyPatches } from './patches.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'web');
const nodeModules = path.join(root, 'node_modules');

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

// --- 1 + 2: sources and patches -------------------------------------------
console.log('> fetching upstream');
fetchUpstream();
console.log('> applying patches');
applyPatches(upstreamDir);

// --- 3: upstream build ------------------------------------------------------
const lockHash = crypto
  .createHash('sha1')
  .update(fs.readFileSync(path.join(upstreamDir, 'package-lock.json')))
  .digest('hex');
const marker = path.join(upstreamDir, 'node_modules', '.lock-hash');
if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== lockHash) {
  console.log('> installing upstream build dependencies');
  run('npm ci --no-audit --no-fund', upstreamDir);
  fs.writeFileSync(marker, lockHash);
}
console.log('> building upstream (production)');
run('npx --no-install gulp build --production', upstreamDir);

// --- 4: assemble web/ -------------------------------------------------------
fs.rmSync(webDir, { recursive: true, force: true });
fs.cpSync(path.join(upstreamDir, 'dist'), webDir, { recursive: true });

const stripSourceMapRef = (text) => text.replace(/\/[*/]# sourceMappingURL=[^\n]*?(\*\/)?\s*$/g, '');
function vendorFile(from, to) {
  const dest = path.join(webDir, 'vendor', to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const text = fs.readFileSync(path.join(nodeModules, from), 'utf8');
  fs.writeFileSync(dest, stripSourceMapRef(text));
}
vendorFile('bootstrap/dist/css/bootstrap.min.css', 'bootstrap/css/bootstrap.min.css');
vendorFile('bootstrap/dist/css/bootstrap.rtl.min.css', 'bootstrap/css/bootstrap.rtl.min.css');
vendorFile('bootstrap/dist/js/bootstrap.bundle.min.js', 'bootstrap/js/bootstrap.bundle.min.js');
vendorFile('jquery/dist/jquery.min.js', 'jquery/jquery.min.js');
vendorFile('@fortawesome/fontawesome-free/css/fontawesome.min.css', 'fontawesome/css/fontawesome.min.css');
vendorFile('@fortawesome/fontawesome-free/css/all.min.css', 'fontawesome/css/all.min.css');

// Chromium always picks woff2, so the .ttf fallbacks are dead weight.
const faFonts = path.join(webDir, 'vendor', 'fontawesome', 'webfonts');
fs.cpSync(path.join(nodeModules, '@fortawesome', 'fontawesome-free', 'webfonts'), faFonts, { recursive: true });
for (const f of fs.readdirSync(faFonts)) {
  if (!f.endsWith('.woff2')) fs.rmSync(path.join(faFonts, f));
}

// Our own pages (extra/): copied as-is, HTML gets the same CSP as upstream's page.
const extraDir = path.join(root, 'extra');
const cspTag = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
for (const name of fs.readdirSync(extraDir)) {
  if (name === 'package.json') continue; // only marks the folder as ESM for Node tests
  const src = path.join(extraDir, name);
  const dest = path.join(webDir, name);
  if (name.endsWith('.html')) {
    const html = fs.readFileSync(src, 'utf8');
    if (!html.includes('<!--CSP-->')) throw new Error(`extra/${name} is missing the <!--CSP--> placeholder`);
    fs.writeFileSync(dest, html.replace('<!--CSP-->', cspTag));
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Translations for strings we add to upstream's page (its other languages fall back to English).
const EXTRA_TRANSLATIONS = {
  ru_ru: { 'Any gamepad test': 'Тест любого геймпада' },
};
for (const [lang, entries] of Object.entries(EXTRA_TRANSLATIONS)) {
  const file = path.join(webDir, 'lang', `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...data, ...entries }));
}

// Keep the upstream MIT notice and credits next to the bundle.
fs.copyFileSync(path.join(upstreamDir, 'LICENSE.txt'), path.join(webDir, 'UPSTREAM-LICENSE.txt'));
fs.copyFileSync(path.join(upstreamDir, 'CREDITS.md'), path.join(webDir, 'UPSTREAM-CREDITS.md'));

const cfg = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'upstream.json'), 'utf8'));
fs.writeFileSync(
  path.join(webDir, 'build-info.json'),
  JSON.stringify({ upstream: cfg.repo, ref: process.env.UPSTREAM_REF || cfg.ref, builtAt: new Date().toISOString() }, null, 2)
);

// --- 5: offline verification -----------------------------------------------
const FORBIDDEN = ['googletagmanager', 'code.jquery.com', 'cdn.jsdelivr.net', 'the.al/ds4_a'];
const offenders = [];
(function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (/\.(html|js|css|json)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) offenders.push(`${path.relative(webDir, full)}: ${needle}`);
      }
    }
  }
})(webDir);

if (offenders.length) {
  console.error('\nOffline check FAILED - bundle still references the network:');
  for (const o of offenders) console.error('  ' + o);
  process.exit(1);
}
console.log(`\nweb/ ready (${cfg.ref.slice(0, 7)}), no network references found.`);
