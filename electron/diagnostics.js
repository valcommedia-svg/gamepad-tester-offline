'use strict';

// Collects the little information needed to debug "it doesn't see my controller"
// reports. Nothing is stored on disk or sent anywhere: the report is built on
// demand and copied to the clipboard by Help > Copy diagnostics.
//
// Deliberately NOT included: controller serial numbers, MAC addresses, file
// paths, user name. Only names and USB vendor:product IDs of devices the
// connect dialog was offered.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');

const MAX_EVENTS = 100;
const MAX_HID_REQUESTS = 20;
const MAX_LINE = 400;

const pageEvents = [];  // renderer warnings/errors and crashes
const hidRequests = []; // what each navigator.hid.requestDevice() was offered

const hex4 = (n) => Number(n).toString(16).padStart(4, '0');
const clip = (text) => {
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > MAX_LINE ? `${s.slice(0, MAX_LINE)}...` : s;
};

function push(list, item, max) {
  list.push(item);
  if (list.length > max) list.shift();
}

function recordPageEvent(kind, message) {
  push(pageEvents, `${new Date().toISOString()} [${kind}] ${clip(message)}`, MAX_EVENTS);
}

/** @param {{name?: string, vendorId: number, productId: number}[]} deviceList */
function recordHidRequest(deviceList) {
  push(hidRequests, {
    at: new Date().toISOString(),
    devices: deviceList.map((d) => `${d.name || 'unnamed HID device'} [${hex4(d.vendorId)}:${hex4(d.productId)}]`),
  }, MAX_HID_REQUESTS);
}

function webBuildInfo() {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'build-info.json'), 'utf8'));
    return `dualshock-tools @ ${String(info.ref).slice(0, 7)}, built ${info.builtAt}`;
  } catch {
    return 'unknown';
  }
}

/** @param {{blockedRequests?: string[]}} [extra] */
function build(extra = {}) {
  const blocked = extra.blockedRequests ?? [];
  const lines = [
    'GamePad Tester Offline - diagnostics',
    `App:       ${app.getVersion()} (${app.isPackaged ? 'packaged' : 'development'})`,
    `Web UI:    ${webBuildInfo()}`,
    `Electron:  ${process.versions.electron} | Chromium ${process.versions.chrome} | Node ${process.versions.node}`,
    `System:    ${process.platform} ${os.release()} ${process.arch}`,
    `Locale:    ${app.getLocale()}`,
    `Blocked network requests: ${blocked.length}${blocked.length ? ` (first: ${clip(blocked[0])})` : ''}`,
    '',
    `Connect dialog requests: ${hidRequests.length}`,
  ];

  hidRequests.forEach((req, i) => {
    const what = req.devices.length ? req.devices.join(', ') : 'no controller offered (not plugged in via USB?)';
    lines.push(`  ${i + 1}. ${req.at}  ${what}`);
  });

  lines.push('', `Recent page warnings/errors: ${pageEvents.length}`);
  pageEvents.forEach((e) => lines.push(`  ${e}`));

  return `${lines.join('\n')}\n`;
}

module.exports = { recordPageEvent, recordHidRequest, build };
