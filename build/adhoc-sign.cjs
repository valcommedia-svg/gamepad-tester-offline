'use strict';

// electron-builder afterSign hook.
//
// Without an Apple Developer ID, electron-builder skips signing, which leaves
// the bundle with a broken seal: Apple Silicon Macs then say the app is
// "damaged" and offer no way to open it. An ad-hoc signature turns that into the
// normal "unidentified developer" prompt (System Settings > Privacy & Security >
// Open Anyway). If a real identity is configured this hook does nothing.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return; // real signing already happened

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  - ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
};
