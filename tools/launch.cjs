// Double-click start (HVAC_Grid.bat): the local server, then the shell in the default browser. When a server already
// answers on the port (HVAC Grid started before), only the browser opens. The server runs until this window closes.
//   node tools/launch.cjs [port]
'use strict';
const http = require('http'), { spawn } = require('child_process'), { start } = require('./serve.cjs');
const port = Number(process.argv[2] || 8792), url = `http://127.0.0.1:${port}/app/`;

// the default browser (Windows: start, macOS: open, else xdg-open)
function openBrowser(u) {
 const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', u]] : process.platform === 'darwin' ? ['open', [u]] : ['xdg-open', [u]];
 spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

// is HVAC Grid already served on the port?
const running = () => new Promise(done => {
 const req = http.get(url, res => { res.resume(); done(res.statusCode === 200); });
 req.on('error', () => done(false)); req.setTimeout(1500, () => { req.destroy(); done(false); });
});

(async () => {
 if (await running()) { console.log(`HVAC Grid가 이미 실행 중입니다: ${url}`); openBrowser(url); return; }
 try { await start(port); }
 catch (e) {
  console.error(`서버를 시작하지 못했습니다 (포트 ${port}): ${e.message}`);
  if (e.code === 'EADDRINUSE') console.error(`다른 프로그램이 포트 ${port}을(를) 쓰고 있습니다. 그 프로그램을 닫거나, 다른 포트로 실행하세요: HVAC_Grid.bat ${port + 1}`);
  process.exitCode = 1; return;
 }
 console.log(`HVAC Grid 실행 중: ${url}`);
 console.log('이 창을 닫으면 HVAC Grid가 종료됩니다.');
 openBrowser(url);
})();
