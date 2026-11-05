// Jednoduchý lokální server pro vývoj: node scripts/dev-server.mjs → http://localhost:3000
// Počasí si nejdřív stáhněte do web/pocasi příkazem: npm run pocasi
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const KOREN = path.resolve('web');
const PORT = +process.env.PORT || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

http.createServer((req, res) => {
  const cesta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let soubor = path.join(KOREN, path.normalize(cesta));
  if (!soubor.startsWith(KOREN)) { res.writeHead(403); return res.end(); }
  if (existsSync(soubor) && statSync(soubor).isDirectory()) soubor = path.join(soubor, 'index.html');
  if (!existsSync(soubor)) { res.writeHead(404); return res.end('Nenalezeno'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(soubor)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(soubor).pipe(res);
}).listen(PORT, () => console.log(`Stavební deník: http://localhost:${PORT}`));
