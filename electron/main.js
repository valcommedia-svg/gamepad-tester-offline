'use strict';

const {
  app, BrowserWindow, Menu, dialog, net, protocol, session, shell, systemPreferences,
} = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'ds';
const ORIGIN = `${SCHEME}://${HOST}`;
const WEB_ROOT = path.join(__dirname, '..', 'web');
const UPSTREAM_SITE = 'https://dualshock-tools.github.io';
const UPSTREAM_REPO = 'https://github.com/dualshock-tools/dualshock-tools.github.io';

// Permissions the page may use: WebHID to talk to the controller, media for the
// microphone / speaker / headphone quick tests. Anything else is denied.
const ALLOWED_PERMISSIONS = new Set(['hid', 'media', 'fullscreen', 'clipboard-sanitized-write']);

// `--smoke-test=<dir>` loads the page, runs a few checks, writes a screenshot
// and exits. Used by CI and for quick local verification.
const smokeArg = process.argv.find((a) => a.startsWith('--smoke-test='));
const smokeDir = smokeArg ? path.resolve(smokeArg.slice('--smoke-test='.length)) : null;

// A custom, secure, standard scheme gives the page a real origin: fetch() and
// localStorage work (they don't on file://) and navigator.hid is exposed.
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

const STRINGS = {
  en: {
    noDeviceTitle: 'No controller found',
    noDeviceDetail: 'Connect the controller with a USB cable and press Connect again.\n\nBluetooth is not supported for calibration.',
    pickTitle: 'Several controllers found',
    pickDetail: 'Choose the controller to connect. Only one can be used at a time.',
    cancel: 'Cancel',
    help: 'Help',
    upstreamSite: 'Original website (dualshock-tools)',
    upstreamRepo: 'Source code of the original project',
  },
  ru: {
    noDeviceTitle: 'Контроллер не найден',
    noDeviceDetail: 'Подключите контроллер USB-кабелем и нажмите «Подключить» ещё раз.\n\nПо Bluetooth калибровка не поддерживается.',
    pickTitle: 'Найдено несколько контроллеров',
    pickDetail: 'Выберите контроллер для подключения. Одновременно можно работать только с одним.',
    cancel: 'Отмена',
    help: 'Справка',
    upstreamSite: 'Оригинальный сайт (dualshock-tools)',
    upstreamRepo: 'Исходный код оригинального проекта',
  },
};
const t = () => (app.getLocale().toLowerCase().startsWith('ru') ? STRINGS.ru : STRINGS.en);

let mainWindow = null;
const blockedRequests = [];
const hidSelections = []; // device-list length of every select-hid-device request (smoke test)

let isPrimaryInstance = true;
if (smokeDir) {
  // Never touch (or lock against) the user's real profile during a smoke test.
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gamepad-tester-smoke-')));
} else if (!app.requestSingleInstanceLock()) {
  // Only one process can hold the HID device anyway.
  isPrimaryInstance = false;
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function openExternal(url) {
  try {
    const { protocol: p } = new URL(url);
    if (p === 'https:' || p === 'http:' || p === 'mailto:') shell.openExternal(url);
  } catch { /* not a valid URL - ignore */ }
}

const isOwnOrigin = (url) => typeof url === 'string' && (url === ORIGIN || url.startsWith(`${ORIGIN}/`));

function registerAppProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response('Forbidden', { status: 403 });

    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (rel.endsWith('/')) rel += 'index.html';

    const file = path.normalize(path.join(WEB_ROOT, rel));
    if (!file.startsWith(WEB_ROOT + path.sep)) return new Response('Forbidden', { status: 403 });

    try {
      return await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function configureSession(ses) {
  // Hard offline guarantee, independent of the page's CSP: nothing leaves the machine.
  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] },
    (details, callback) => {
      blockedRequests.push(details.url);
      callback({ cancel: true });
    },
  );

  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => (
    isOwnOrigin(requestingOrigin) && ALLOWED_PERMISSIONS.has(permission)
  ));

  ses.setPermissionRequestHandler(async (_wc, permission, callback, details) => {
    if (!isOwnOrigin(details.requestingUrl) || !ALLOWED_PERMISSIONS.has(permission)) {
      callback(false);
      return;
    }
    // On macOS the OS-level microphone prompt has to be answered as well.
    if (permission === 'media' && process.platform === 'darwin' && details.mediaTypes?.includes('audio')) {
      callback(await systemPreferences.askForMediaAccess('microphone'));
      return;
    }
    callback(true);
  });

  // navigator.hid.requestDevice() has no built-in picker in Electron. The page
  // already filters by Sony vendor/product IDs, so the list holds controllers only.
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    hidSelections.push(details.deviceList.length);
    chooseHidDevice(details.deviceList).then(callback, () => callback());
  });
}

async function chooseHidDevice(devices) {
  // An automated test must never open (or show dialogs about) a real controller.
  if (smokeDir) return undefined;

  const parent = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
  const s = t();

  if (devices.length === 0) {
    await dialog.showMessageBox(parent, {
      type: 'info', message: s.noDeviceTitle, detail: s.noDeviceDetail, buttons: ['OK'],
    });
    return undefined; // cancel -> requestDevice() resolves to []
  }
  if (devices.length === 1) return devices[0].deviceId;

  const labels = devices.map((d) => `${d.name || 'HID device'} (${d.serialNumber || d.productId.toString(16)})`);
  const { response } = await dialog.showMessageBox(parent, {
    type: 'question',
    message: s.pickTitle,
    detail: s.pickDetail,
    buttons: [...labels, s.cancel],
    defaultId: 0,
    cancelId: labels.length,
  });
  return response < devices.length ? devices[response].deviceId : undefined;
}

function buildMenu() {
  const s = t();
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: s.help,
      role: 'help',
      submenu: [
        { label: s.upstreamSite, click: () => openExternal(UPSTREAM_SITE) },
        { label: s.upstreamRepo, click: () => openExternal(UPSTREAM_REPO) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 900,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#212529', // matches the page's default dark theme, avoids a white flash
    title: 'GamePad Tester Offline',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Links to PayPal / GitHub / YouTube etc. belong in the user's browser, not in this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isOwnOrigin(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  win.loadURL(`${ORIGIN}/index.html`);
  return win;
}

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return;

  app.setAppUserModelId('com.gamepadtester.offline');
  registerAppProtocol();
  configureSession(session.defaultSession);
  buildMenu();

  mainWindow = createWindow();
  mainWindow.on('closed', () => { mainWindow = null; });

  if (smokeDir) {
    const code = await require('./smoke-test.js')(mainWindow, smokeDir, {
      blockedRequests: () => blockedRequests,
      hidSelections: () => hidSelections,
    });
    app.exit(code);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.on('closed', () => { mainWindow = null; });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
