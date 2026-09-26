// Fetches the dualshock-tools website sources into ./upstream at the commit
// pinned in scripts/upstream.json (override with UPSTREAM_REF=<sha|branch|tag>).
// Tracked files are force-reset, so any previously applied patches are dropped.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const upstreamDir = path.join(root, 'upstream');

const cfg = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'upstream.json'), 'utf8'));
const ref = process.env.UPSTREAM_REF || cfg.ref;

const git = (...args) => execFileSync('git', args, { cwd: upstreamDir, stdio: 'inherit' });

export function fetchUpstream() {
  if (!fs.existsSync(path.join(upstreamDir, '.git'))) {
    fs.mkdirSync(upstreamDir, { recursive: true });
    git('init', '-q');
    git('remote', 'add', 'origin', cfg.repo);
  }
  git('fetch', '--depth', '1', 'origin', ref);
  git('checkout', '-f', '--detach', 'FETCH_HEAD');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchUpstream();
}
