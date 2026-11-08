const { app, BrowserWindow, Tray, Menu, dialog, shell, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const QRCode = require('qrcode');
const { lanAddress, basic, launchOptions } = require('./helpers.cjs');
const options = launchOptions(process.argv, process.env);
let window, tray, child, port, settings, quitting = false;
const configDir = process.env.NEXTQUEST_TEST_CONFIG_DIR || path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'NextQuest');
if (process.env.NEXTQUEST_TEST_CONFIG_DIR) { fs.mkdirSync(path.join(configDir, 'electron'), { recursive: true }); app.setPath('userData', path.join(configDir, 'electron')); }
const configPath = path.join(configDir, 'desktop.json');
const serverDir = path.join(process.resourcesPath, 'server');
const icon = path.join(__dirname, 'build', 'icon.png');
function save() { fs.mkdirSync(configDir, { recursive: true }); fs.writeFileSync(configPath, JSON.stringify(settings), { mode: 0o600 }); }
function availablePort(start) { return new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', e => e.code === 'EADDRINUSE' ? resolve(availablePort(start + 1)) : reject(e)); server.listen(start, '0.0.0.0', () => server.close(() => resolve(start))); }); }
async function request(route, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { ...options, headers: { Authorization: basic(settings.password), ...options.headers }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function waitReady() {
  for (let i = 0; i < 120; i++) { if (child.exitCode !== null) throw new Error('Server wurde unerwartet beendet.'); try { await request('/api/health'); return; } catch { await new Promise(r => setTimeout(r, 500)); } }
  throw new Error('Server startet nicht rechtzeitig.');
}
async function backup() {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const job = await request('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'backup' }) });
    if (job.kind !== 'backup') { await new Promise(r => setTimeout(r, 1000)); continue; }
    while (Date.now() < deadline) {
      const status = await request('/api/jobs');
      if (status.last?.id === job.id) { if (Object.keys(status.last.errors || {}).length) throw new Error('Sicherung fehlgeschlagen.'); return; }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Zeitüberschreitung beim Sichern.');
}
async function capture(view, file) { if (!file) return; await new Promise(resolve => view.webContents.once('did-finish-load', resolve)); await new Promise(resolve => setTimeout(resolve, 3000)); fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, (await view.webContents.capturePage()).toPNG()); }
function openWindow() {
  if (window && !window.isDestroyed()) { window.show(); return; }
  window = new BrowserWindow({ width: 1280, height: 850, icon, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.on('close', e => { if (!quitting) { e.preventDefault(); window.hide(); } });
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${port}/`)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  capture(window, options.screenshot).catch(console.error);
  window.loadURL(`http://127.0.0.1:${port}/`);
}
async function phone() {
  const ip = lanAddress();
  if (!ip) { dialog.showMessageBox({ type: 'info', message: 'Keine WLAN-Adresse gefunden.' }); return; }
  const url = `http://${ip}:${port}`;
  const qr = await QRCode.toDataURL(url, { width: 320, margin: 2 });
  const view = new BrowserWindow({ width: 470, height: 590, parent: window, title: 'Auf dem Handy öffnen', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><style>body{font:16px system-ui;text-align:center;padding:24px;color:#222}img{width:280px}code{font-size:17px;word-break:break-all}</style><h2>Auf dem Handy öffnen</h2><p>Mit der Kamera im selben WLAN scannen:</p><img src="${qr}"><p><code>${url}</code></p><p>Benutzername beliebig, Passwort: <strong>${settings.password}</strong></p><p>Im Browser „Zum Startbildschirm hinzufügen“ wählen.</p></html>`;
  capture(view, options.qrScreenshot).catch(console.error);
  view.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}
function menu() { tray.setContextMenu(Menu.buildFromTemplate([
  { label: 'NextQuest öffnen', click: openWindow }, { label: 'Auf dem Handy öffnen', click: phone },
  { label: `Passwort: ${settings.password}`, enabled: false },
  { label: 'Mit Windows starten', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: item => app.setLoginItemSettings({ openAtLogin: item.checked }) },
  { label: 'Nach Updates suchen', click: () => autoUpdater.checkForUpdates().catch(e => dialog.showErrorBox('Update', e.message)) },
  { label: 'Datenordner öffnen', click: () => shell.openPath(settings.dataDir) }, { type: 'separator' }, { label: 'Beenden', click: () => { quitting = true; app.quit(); } }
])); }
async function start() {
  try { settings = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {
    settings = { password: crypto.randomBytes(12).toString('base64url'), dataDir: path.join(configDir, 'data') };
    if (!options.dataDir) {
    const choice = await dialog.showMessageBox({ type: 'info', title: 'Willkommen bei NextQuest', message: 'Privates Netzwerk erlauben, damit das Handy zugreifen kann.', detail: 'Windows kann beim ersten Start nach Netzwerkzugriff fragen. Ihre Daten bleiben bei einer Deinstallation erhalten. Sie können den Datenordner jetzt wählen.', buttons: ['Standard verwenden', 'Datenordner wählen'] });
    if (choice.response === 1) { const selection = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] }); if (!selection.canceled) settings.dataDir = selection.filePaths[0]; }
    }
    save();
  }
  if (options.dataDir) settings.dataDir = path.resolve(options.dataDir);
  if (options.password !== undefined) settings.password = options.password;
  if (process.env.NEXTQUEST_TEST_DATA_DIR) settings.dataDir = process.env.NEXTQUEST_TEST_DATA_DIR;
  fs.mkdirSync(settings.dataDir, { recursive: true });
  port = await availablePort(7918);
  const commit = fs.readFileSync(path.join(serverDir, 'commit.txt'), 'utf8').trim();
  child = spawn(process.execPath, [path.join(serverDir, 'server.js')], { cwd: serverDir, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NEXTQUEST_RUNTIME: 'windows', DATA_DIR: settings.dataDir, HOSTNAME: '0.0.0.0', PORT: String(port), NEXTQUEST_COMMIT: commit, APP_PASSWORD: settings.password }, windowsHide: true, stdio: 'ignore' });
  await waitReady();
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => { const u = new URL(details.url); if (u.hostname === '127.0.0.1' && u.port === String(port) && u.protocol === 'http:') details.requestHeaders.Authorization = basic(settings.password); callback({ requestHeaders: details.requestHeaders }); });
  tray = new Tray(icon); tray.setToolTip('NextQuest'); tray.on('double-click', openWindow); menu(); openWindow(); if (options.qrScreenshot) await phone();
  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('error', e => console.error('Update:', e));
  autoUpdater.on('update-downloaded', async () => { try { await backup(); quitting = true; if (child) child.kill(); autoUpdater.quitAndInstall(); } catch (e) { dialog.showErrorBox('Update nicht installiert', `Sicherung fehlgeschlagen: ${e.message}`); } });
  if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {});
}
if (!app.requestSingleInstanceLock()) app.quit(); else {
  app.on('second-instance', (_event, argv) => { if (launchOptions(argv, {}).quit) { quitting = true; app.quit(); } else openWindow(); });
  app.whenReady().then(() => options.quit ? app.quit() : start()).catch(e => { dialog.showErrorBox('NextQuest konnte nicht starten', e.message); quitting = true; app.quit(); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; if (child && child.exitCode === null) child.kill(); });
}
