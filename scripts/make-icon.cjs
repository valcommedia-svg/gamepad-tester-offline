'use strict';

// Rasterises build/icon.svg to build/icon.png (1024x1024, transparent corners)
// using a <canvas> inside Electron, so no native image tooling is needed.
// electron-builder turns the PNG into .ico / .icns.
// Run:  npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 1024;
const buildDir = path.join(__dirname, '..', 'build');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ show: false, width: 100, height: 100 });
  await win.loadURL('data:text/html;charset=utf-8,<!doctype html><title>icon</title>');

  const dataUrl = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ${SIZE};
    canvas.getContext('2d').drawImage(img, 0, 0, ${SIZE}, ${SIZE});
    return canvas.toDataURL('image/png');
  })()`);

  const png = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  fs.writeFileSync(path.join(buildDir, 'icon.png'), png);
  console.log(`wrote build/icon.png (${png.length} bytes)`);
  app.quit();
});
