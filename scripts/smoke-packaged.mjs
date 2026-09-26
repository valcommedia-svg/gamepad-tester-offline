// Runs the *packaged* app (electron-builder output) with --smoke-test and fails
// if any check fails. The plain `npm run smoke` runs from source; this proves
// the shipped artifact works too (asar, custom protocol, code signature).
//
//   node scripts/smoke-packaged.mjs                     # find the app in ./release
//   node scripts/smoke-packaged.mjs "/path/to/X.app"    # a specific .app (macOS) or .exe
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'release');
const outDir = path.join(root, 'smoke-packaged');
const productName = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).build.productName;

function macExecutable(appDir) {
  return path.join(appDir, 'Contents', 'MacOS', productName);
}

function findExecutable() {
  const arg = process.argv[2];
  if (arg) return arg.endsWith('.app') ? macExecutable(path.resolve(arg)) : path.resolve(arg);

  if (process.platform === 'win32') {
    return path.join(releaseDir, 'win-unpacked', `${productName}.exe`);
  }
  if (process.platform === 'darwin') {
    const dir = fs.readdirSync(releaseDir).find((d) => d.startsWith('mac') && fs.existsSync(path.join(releaseDir, d, `${productName}.app`)));
    if (!dir) throw new Error(`no mac* build with ${productName}.app found in ${releaseDir}`);
    return macExecutable(path.join(releaseDir, dir, `${productName}.app`));
  }
  throw new Error(`unsupported platform ${process.platform}`);
}

const exe = findExecutable();
if (!fs.existsSync(exe)) {
  console.error(`packaged app not found: ${exe}`);
  process.exit(2);
}

fs.rmSync(outDir, { recursive: true, force: true });
console.log(`> smoke test of packaged app: ${exe}`);
const run = spawnSync(exe, [`--smoke-test=${outDir}`], { stdio: 'inherit', timeout: 180000 });

const resultFile = path.join(outDir, 'smoke-result.json');
if (!fs.existsSync(resultFile)) {
  console.error(`no result written (exit code ${run.status}, signal ${run.signal}, error ${run.error?.message ?? 'none'})`);
  process.exit(1);
}

const { failures, results } = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
console.log(`checks: ${Object.keys(results).length}, failures: ${failures.length}${failures.length ? ` -> ${failures.join(', ')}` : ''}`);
process.exit(failures.length || run.status ? 1 : 0);
