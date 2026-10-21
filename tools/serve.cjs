// Local static server for the HVAC Grid shell. Binds to 127.0.0.1 only and serves only what the shell needs: app/,
// vendor/, lib/, samples/ (not .git, out/ or anything else in the folder). The Host header must name this server, so a
// web page cannot reach it through another host name (DNS rebinding). The shell scripts into the vendor app frames,
// which browsers allow only for same-origin pages - not for file://.
//   node tools/serve.cjs [port]   (npm start -> http://127.0.0.1:8792/app/)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PUBLIC = ['app', 'vendor', 'lib', 'samples'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
 '.json': 'application/json; charset=utf-8', '.dxf': 'application/dxf', '.png': 'image/png', '.svg': 'image/svg+xml', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

// onAlive: the open app says it is still there (POST /__alive, every few seconds); onBye: a window of it closed or
// reloads (POST /__bye) - the launcher stops the server when no window is left. Only the app's own pages may post them:
// a page of another site (another browser window on this PC) sends its Origin and is refused (review 2026-10-21 A03).
// Every answer carries X-HVAC-Grid, so the launcher knows the port is HVAC Grid's and not another program's
function start(port = 0, { onAlive = null, onBye = null } = {}) {
 let actual = port;
 const server = http.createServer((req, res) => {
  const end = (code, headers = {}) => { try { res.writeHead(code, { ...headers, 'X-HVAC-Grid': '1' }).end(); } catch {} };
  const own = () => { const o = req.headers.origin, site = req.headers['sec-fetch-site'];
   return (!o || new RegExp(`^http://(127\\.0\\.0\\.1|localhost):${actual}$`, 'i').test(o)) && (!site || site === 'same-origin'); };
  try {
   const host = String(req.headers.host || '');
   if (!new RegExp(`^(127\\.0\\.0\\.1|localhost)(:${actual})?$`, 'i').test(host)) return end(421);
   let rel; try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return end(400); }
   if (/[\0\r\n]/.test(rel)) return end(400);
   if (rel === '/') return end(302, { Location: '/app/' });
   if (rel === '/__alive' || rel === '/__bye') { if (!own()) return end(403); if (req.method === 'POST') (rel === '/__alive' ? onAlive : onBye)?.(); return end(204); }
   let file = path.resolve(ROOT, '.' + rel);
   if (!PUBLIC.some(d => file === path.join(ROOT, d) || file.startsWith(path.join(ROOT, d) + path.sep))) return end(404);
   if (rel.endsWith('/')) file = path.join(file, 'index.html');
   fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return end(404);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-HVAC-Grid': '1' });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
   });
  } catch { end(500); }
 });
 return new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => { actual = server.address().port; resolve({ url: `http://127.0.0.1:${actual}`, port: actual, close: () => new Promise(done => { server.close(done); server.closeAllConnections?.(); }) }); });
 });
}

if (require.main === module) start(Number(process.argv[2] || 8792)).then(s => console.log('HVAC Grid at', s.url + '/app/'));
module.exports = { start };
