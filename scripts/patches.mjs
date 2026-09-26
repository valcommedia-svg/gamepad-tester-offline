// Patches applied to the upstream sources before they are built.
//
// Every patch states how many matches it expects. If upstream changes and the
// count no longer matches, the build fails loudly instead of silently shipping
// something that still talks to the network.
import fs from 'node:fs';
import path from 'node:path';

// The renderer may only load code/data from its own origin. connect-src 'self'
// also blocks any analytics request that might slip through.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'", // upstream uses inline onclick= handlers
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export const PATCHES = [
  // --- index.html: CDN assets -> local vendor/ copies -----------------------
  {
    name: 'bootstrap css',
    file: 'index.html',
    find: /<link id="bootstrap-css"[^>]*>/g,
    replace: '<link id="bootstrap-css" href="vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">',
    count: 1,
  },
  {
    name: 'fontawesome css',
    file: 'index.html',
    find: /<link rel="stylesheet"\s+href="https:\/\/cdn\.jsdelivr\.net\/npm\/@fortawesome\/fontawesome-free@[^/]+\/css\/(fontawesome|all)\.min\.css"[^>]*>/g,
    replace: (_m, name) => `<link rel="stylesheet" href="vendor/fontawesome/css/${name}.min.css">`,
    count: 2,
  },
  {
    name: 'jquery',
    file: 'index.html',
    find: /<script src="https:\/\/code\.jquery\.com\/jquery-[\d.]+\.min\.js"[^>]*><\/script>/g,
    replace: '<script src="vendor/jquery/jquery.min.js"></script>',
    count: 1,
  },
  {
    name: 'bootstrap js',
    file: 'index.html',
    find: /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap@[^/]+\/dist\/js\/bootstrap\.bundle\.min\.js"[^>]*><\/script>/g,
    replace: '<script src="vendor/bootstrap/js/bootstrap.bundle.min.js"></script>',
    count: 1,
  },

  // --- index.html: remove Google Tag Manager, add CSP -----------------------
  {
    name: 'google tag manager',
    file: 'index.html',
    find: /<!-- Google tag \(gtag\.js\) -->\s*<script async src="https:\/\/www\.googletagmanager\.com[^>]*><\/script>\s*<script>[\s\S]*?<\/script>/g,
    replace: '',
    count: 1,
  },
  {
    name: 'content security policy',
    file: 'index.html',
    find: /<meta charset="utf-8">/g,
    replace: `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    count: 1,
  },

  // --- bottom bar (version, donate link, translator credits, social icons) ---
  // Credits stay reachable through Help > About in the desktop app (electron/main.js).
  // Nothing in upstream's JS depends on the footer: #authorMsg is only written via
  // jQuery, which ignores a missing element. The other patches drop the space that
  // was reserved for the fixed footer.
  {
    name: 'remove footer bar',
    file: 'index.html',
    find: /[ \t]*<!-- Fixed Footer -->\s*<footer[\s\S]*?<\/footer>[ \t]*\r?\n?/g,
    replace: '',
    count: 1,
  },
  {
    name: 'alerts: no footer to sit above',
    file: 'index.html',
    find: /(z-index: 1040; pointer-events: none; bottom: )70px;/g,
    replace: (_m, head) => `${head}16px;`,
    count: 1,
  },
  {
    name: 'drift notice: no footer to sit above',
    file: 'index.html',
    find: /(id="aboutdrift" style="position: fixed; bottom: )6em;/g,
    replace: (_m, head) => `${head}1em;`,
    count: 1,
  },
  {
    name: 'page bottom padding',
    file: 'scss/main.scss',
    find: /(body\s*\{\s*padding-bottom:\s*)80px;/g,
    replace: (_m, head) => `${head}16px;`,
    count: 1,
  },

  // The welcome dialog claims the site uses analytics - untrue once it's removed.
  {
    name: 'welcome modal analytics notice',
    file: 'templates/welcome-modal.html',
    find: /[ \t]*<li class="ds-i18n">This website uses analytics to improve the service\.<\/li>\r?\n/g,
    replace: '',
    count: 1,
  },

  // --- js/utils.js: home-grown analytics (posts raw HID data, BT address) ---
  {
    name: 'analytics beacon',
    file: 'js/utils.js',
    find: /\$\.ajax\(\{[\s\S]*?\}\);/g,
    replace: '/* analytics removed in the offline build */',
    count: 1,
  },

  // --- js/translations.js: RTL/LTR bootstrap swap pointed at the CDN --------
  {
    name: 'bootstrap SRI hashes',
    file: 'js/translations.js',
    find: /^[ \t]*\$\('#bootstrap-css'\)\.attr\('integrity',[^\n]*\n/gm,
    replace: '',
    count: 2,
  },
  // Upstream only matches a full "ru-RU" style tag; Electron often reports a bare
  // "ru", and some file keys (ua_ua, cz_cz, jp_jp, rs_rs) differ from the BCP-47 codes.
  {
    name: 'language auto-detect',
    file: 'js/translations.js',
    find: /const nlang = navigator\.language\.replace\('-', '_'\)\.toLowerCase\(\);/g,
    replace:
      "const nlang = ((tag) => {\n" +
      "    if (available_langs[tag]) return tag;\n" +
      "    const base = tag.split('_')[0];\n" +
      "    const alias = { uk: 'ua_ua', cs: 'cz_cz', ja: 'jp_jp', sr: 'rs_rs' }[base];\n" +
      "    return alias ?? Object.keys(available_langs).find((k) => k.split('_')[0] === base) ?? tag;\n" +
      "  })(navigator.language.replace('-', '_').toLowerCase());",
    count: 1,
  },
  {
    name: 'bootstrap rtl/ltr urls',
    file: 'js/translations.js',
    find: /https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap@[\d.]+\/dist\/css\/(bootstrap(?:\.rtl)?\.min\.css)/g,
    replace: (_m, name) => `vendor/bootstrap/css/${name}`,
    count: 2,
  },
];

export function applyPatches(upstreamDir) {
  const cache = new Map();
  for (const patch of PATCHES) {
    const file = path.join(upstreamDir, patch.file);
    let text = cache.get(file) ?? fs.readFileSync(file, 'utf8');

    const found = [...text.matchAll(patch.find)].length;
    if (found !== patch.count) {
      throw new Error(
        `Patch "${patch.name}" expected ${patch.count} match(es) in ${patch.file} but found ${found}. ` +
        'Upstream changed - update scripts/patches.mjs.'
      );
    }
    text = text.replace(patch.find, patch.replace);
    cache.set(file, text);
    console.log(`  patched ${patch.file}: ${patch.name}`);
  }
  for (const [file, text] of cache) fs.writeFileSync(file, text);
}
