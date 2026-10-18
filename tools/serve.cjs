// Local static server for the HVAC Grid shell (app/ + vendor/ + lib/ + samples/). Binds to 127.0.0.1 only.
// The shell scripts into the vendor app frames, which browsers allow only for same-origin pages - not for file://.
//   node tools/serve.cjs [port]   (npm start -> http://127.0.0.1:8792/app/)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
 '.json': 'application/json; charset=utf-8', '.dxf': 'application/dxf', '.png': 'image/png', '.svg': 'image/svg+xml' };

function start(port = 0) {
 const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (rel === '/') { res.writeHead(302, { Location: '/app/' }).end(); return; }
  let file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  if (rel.endsWith('/')) file = path.join(file, 'index.html');
  fs.stat(file, (error, stat) => {
   if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
   res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-store' });
   fs.createReadStream(file).pipe(res);
  });
 });
 return new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(done => server.close(done)) }));
 });
}

if (require.main === module) start(Number(process.argv[2] || 8792)).then(s => console.log('HVAC Grid at', s.url + '/app/'));
module.exports = { start };
