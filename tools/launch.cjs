// Start HVAC Grid like a desktop program (HVAC_Grid.bat): the local server, then the shell in its own window - Edge (or
// Chrome) in app mode: no tabs, no address bar, its own icon and title on the taskbar, a profile of its own. The server
// stops when that window closes (or, as a fallback, some minutes after the open app last said it is still there).
// When a server already answers on the port, only another window opens.
//   node tools/launch.cjs [port] [--console]   (--console: messages in this console instead of message boxes)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const { start } = require('./serve.cjs');
const args = process.argv.slice(2), consoleMode = args.includes('--console'), port = Number(args.find(a => /^\d+$/.test(a)) || 8792);
const url = `http://127.0.0.1:${port}/app/`, DATA = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'HVAC_Grid');
const ALIVE_MS = 150000;   // > the 1 min timer throttling of a minimized window

fs.mkdirSync(DATA, { recursive: true });
const log = (...m) => { const line = `${new Date().toISOString()} ${m.join(' ')}`; if (consoleMode) console.log(m.join(' ')); try { fs.appendFileSync(path.join(DATA, 'launch.log'), line + '\n'); } catch {} };

// a message the user sees: the console, or (started without one) a Windows message box
function tell(text, error = false) {
 log(text);
 if (consoleMode || process.platform !== 'win32') { (error ? console.error : console.log)(text); return; }
 const ps = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($env:HG_MSG, 'HVAC Grid', 'OK', '${error ? 'Error' : 'Information'}') | Out-Null`;
 spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { env: { ...process.env, HG_MSG: text }, stdio: 'ignore', windowsHide: true }).on('error', () => {});
}

// Edge, else Chrome (both have app mode); null when neither is installed
function appBrowser() {
 const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
 const rel = [['Microsoft', 'Edge', 'Application', 'msedge.exe'], ['Google', 'Chrome', 'Application', 'chrome.exe']];
 for (const r of rel) for (const base of pf) { const f = path.join(base, ...r); if (fs.existsSync(f)) return f; }
 return null;
}

// the app window: { child, done } - done resolves when the browser process ends (null: the default browser, in a tab)
function openWindow() {
 const exe = appBrowser();
 if (!exe) {   // no app-mode browser: the default browser, in a tab
  const [cmd, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, a, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return null;
 }
 const child = spawn(exe, [`--app=${url}`, `--user-data-dir=${path.join(DATA, 'window')}`, '--start-maximized', '--no-first-run', '--no-default-browser-check',
  '--disable-session-crashed-bubble', '--hide-crash-restore-bubble', '--disable-features=msEdgeStartupBoost,ChromeWhatsNewUI'], { stdio: 'ignore', windowsHide: false });
 const t = Date.now();
 return { child, done: new Promise(done => { child.on('exit', () => done(Date.now() - t)); child.on('error', e => { log('browser error', e.message); done(-1); }); }) };
}

// is HVAC Grid already served on the port? (its server says so in X-HVAC-Grid - another program on the port is not)
const running = () => new Promise(done => {
 const req = http.get(url, res => { res.resume(); done(res.statusCode === 200 && res.headers['x-hvac-grid'] === '1'); });
 req.on('error', () => done(false)); req.setTimeout(1500, () => { req.destroy(); done(false); });
});

(async () => {
 if (await running()) { log('already running, another window', url); openWindow(); return; }
 let lastAlive = Date.now(), server, browser = null, byeTimer = null;
 // a window closed (or reloads): stop unless a window says it is still there within a few seconds
 const onBye = () => { const at = Date.now(); clearTimeout(byeTimer); byeTimer = setTimeout(() => { if (lastAlive < at) stop('window closed'); }, 7000); };
 try { server = await start(port, { onAlive: () => { lastAlive = Date.now(); }, onBye }); }
 catch (e) {
  tell(`HVAC Grid를 시작하지 못했습니다 (포트 ${port}): ${e.message}` + (e.code === 'EADDRINUSE' ? `\n\n다른 프로그램이 포트 ${port}을(를) 쓰고 있습니다. 그 프로그램을 닫거나, 다른 포트로 실행하세요: HVAC_Grid.bat ${port + 1}` : ''), true);
  process.exitCode = 1; return;
 }
 log('HVAC Grid 실행 중:', url);
 if (consoleMode) console.log('창을 닫으면 HVAC Grid가 종료됩니다.');
 // stop: the server, and the browser of the HVAC Grid profile (Edge keeps a closed profile running in the background)
 const stop = why => { log('stop:', why); if (browser?.pid && browser.exitCode == null) { try { process.platform === 'win32' ? spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) : browser.kill(); } catch {} }
  server.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
 // fallback: the open app posts /__alive every few seconds; none for a long time - no window is left
 setInterval(() => { if (Date.now() - lastAlive > ALIVE_MS) stop('no window for ' + Math.round(ALIVE_MS / 1000) + ' s'); }, 10000).unref();
 const opened = openWindow(); browser = opened?.child || null; const ran = opened ? await opened.done : null;
 // the browser ended: its windows are closed (a run under 3 s handed the window to a browser already open - keep going)
 if (ran != null && ran >= 3000) stop('window closed');
 else setInterval(() => {}, 1 << 30);   // stay up for the alive check
})();
