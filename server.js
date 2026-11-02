// Stavební deník – jednoduchý HTTP server bez frameworku
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, unlinkSync, createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, FOTO_DIR, STAVBA_POLE, ZAPIS_POLE, vyber } from './lib/db.js';
import { pocasiProDen, nejblizsiStanice } from './lib/pocasi.js';
import { generujZapis, aiDostupne } from './lib/zapis.js';

// .env (volitelně) – ANTHROPIC_API_KEY, PORT, HESLO
if (existsSync('.env')) {
  for (const r of readFileSync('.env', 'utf8').split('\n')) {
    const m = r.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const PORT = +process.env.PORT || 3000;
const HESLO = process.env.HESLO; // pokud je nastaveno, aplikace vyžaduje přihlášení (Basic auth)
const PUBLIC = path.resolve('public');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

class HttpChyba extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function telo(req, limit = 25e6) {
  let delka = 0; const casti = [];
  for await (const c of req) {
    delka += c.length;
    if (delka > limit) throw new HttpChyba(413, 'Požadavek je příliš velký');
    casti.push(c);
  }
  return casti.length ? JSON.parse(Buffer.concat(casti).toString('utf8')) : {};
}

function souborStaticky(res, soubor) {
  if (!existsSync(soubor) || !statSync(soubor).isFile()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(soubor).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(soubor).pipe(res);
  return true;
}

// --- dotazy -----------------------------------------------------------------
const stavba = (id) => db.prepare('SELECT * FROM stavby WHERE id = ?').get(id);
const zapis = (id) => db.prepare('SELECT * FROM zapisy WHERE id = ?').get(id);
const fotkyZapisu = (id) => db.prepare('SELECT * FROM fotky WHERE zapis_id = ? ORDER BY poradi, id').all(id);

function nutny(x, co = 'Záznam') { if (!x) throw new HttpChyba(404, `${co} nenalezen`); return x; }
function upravitelny(z) { if (z.stav === 'uzavren') throw new HttpChyba(409, 'Záznam je uzavřen a nelze jej měnit. Opravu proveďte novým záznamem.'); }

function update(tabulka, id, data) {
  const k = Object.keys(data);
  if (!k.length) return;
  db.prepare(`UPDATE ${tabulka} SET ${k.map((x) => `${x} = ?`).join(', ')} WHERE id = ?`).run(...k.map((x) => data[x]), id);
}
function insert(tabulka, data) {
  const k = Object.keys(data);
  return db.prepare(`INSERT INTO ${tabulka} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...k.map((x) => data[x])).lastInsertRowid;
}

function zapisSFotkami(z) {
  return { ...z, pocasi: z.pocasi ? JSON.parse(z.pocasi) : null, fotky: fotkyZapisu(z.id).map((f) => ({ ...f, url: `/fotky/${f.soubor}` })) };
}

async function nactiPocasi(s, datum) {
  return pocasiProDen({ lat: s.lat, lon: s.lon, datum, wsi: s.stanice_wsi });
}

// --- routy ------------------------------------------------------------------
const routy = [];
const r = (metoda, vzor, fn) => routy.push({ metoda, re: new RegExp('^' + vzor.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

r('GET', '/api/info', () => ({ ai: aiDostupne() }));

r('GET', '/api/stavby', () => db.prepare(`
  SELECT s.*, (SELECT COUNT(*) FROM zapisy z WHERE z.stavba_id = s.id) AS pocet_zapisu,
         (SELECT MAX(datum) FROM zapisy z WHERE z.stavba_id = s.id) AS posledni_zapis
  FROM stavby s ORDER BY s.id DESC`).all());

r('POST', '/api/stavby', async (req) => {
  const data = vyber(await telo(req), STAVBA_POLE);
  if (!data.nazev) throw new HttpChyba(400, 'Chybí název stavby');
  return stavba(insert('stavby', data));
});

r('GET', '/api/stavby/:id', (req, p) => nutny(stavba(p.id), 'Stavba'));

r('PUT', '/api/stavby/:id', async (req, p) => {
  nutny(stavba(p.id), 'Stavba');
  update('stavby', p.id, vyber(await telo(req), STAVBA_POLE));
  return stavba(p.id);
});

r('DELETE', '/api/stavby/:id', (req, p) => {
  const uzavrene = db.prepare("SELECT COUNT(*) n FROM zapisy WHERE stavba_id = ? AND stav = 'uzavren'").get(p.id).n;
  if (uzavrene) throw new HttpChyba(409, 'Stavbu s uzavřenými záznamy nelze smazat.');
  for (const z of db.prepare('SELECT id FROM zapisy WHERE stavba_id = ?').all(p.id)) smazFotky(z.id);
  db.prepare('DELETE FROM stavby WHERE id = ?').run(p.id);
  return { ok: true };
});

r('GET', '/api/stavby/:id/zapisy', (req, p) =>
  db.prepare('SELECT * FROM zapisy WHERE stavba_id = ? ORDER BY datum, id').all(p.id).map(zapisSFotkami));

r('POST', '/api/stavby/:id/zapisy', async (req, p) => {
  const s = nutny(stavba(p.id), 'Stavba');
  const vstup = await telo(req);
  const datum = vstup.datum || new Date().toISOString().slice(0, 10);
  const posledni = db.prepare('SELECT zapsal FROM zapisy WHERE stavba_id = ? ORDER BY id DESC LIMIT 1').get(p.id);
  const id = insert('zapisy', {
    stavba_id: p.id, datum, popisek: vstup.popisek || null,
    pracovnici: vstup.pracovnici ?? s.pracovnici ?? null,
    mechanizace: null,
    zapsal: vstup.zapsal ?? posledni?.zapsal ?? s.stavbyvedouci ?? null,
  });
  try {
    update('zapisy', id, { pocasi: JSON.stringify(await nactiPocasi(s, datum)) });
  } catch (e) {
    console.warn('Počasí:', e.message);
  }
  return zapisSFotkami(zapis(id));
});

r('GET', '/api/zapisy/:id', (req, p) => zapisSFotkami(nutny(zapis(p.id))));

r('PUT', '/api/zapisy/:id', async (req, p) => {
  const z = nutny(zapis(p.id)); upravitelny(z);
  const data = vyber(await telo(req), ZAPIS_POLE);
  if (data.pocasi && typeof data.pocasi !== 'string') data.pocasi = JSON.stringify(data.pocasi);
  update('zapisy', p.id, { ...data, upraveno: new Date().toISOString() });
  return zapisSFotkami(zapis(p.id));
});

r('DELETE', '/api/zapisy/:id', (req, p) => {
  const z = nutny(zapis(p.id)); upravitelny(z);
  smazFotky(z.id);
  db.prepare('DELETE FROM zapisy WHERE id = ?').run(p.id);
  return { ok: true };
});

r('POST', '/api/zapisy/:id/pocasi', (req, p) => {
  const z = nutny(zapis(p.id)); upravitelny(z);
  return nactiPocasi(stavba(z.stavba_id), z.datum).then((poc) => {
    update('zapisy', p.id, { pocasi: JSON.stringify(poc) });
    return zapisSFotkami(zapis(p.id));
  });
});

r('POST', '/api/zapisy/:id/generovat', async (req, p) => {
  const z = nutny(zapis(p.id)); upravitelny(z);
  const s = stavba(z.stavba_id);
  const fotky = fotkyZapisu(z.id);
  const predchozi = db.prepare(`SELECT datum, provedene_prace, popisek FROM zapisy
    WHERE stavba_id = ? AND id != ? AND datum <= ? ORDER BY datum DESC, id DESC LIMIT 4`).all(s.id, z.id, z.datum);
  const navrh = await generujZapis({ stavba: s, zapis: z, fotky, predchozi });
  update('zapisy', z.id, vyber(navrh, ['provedene_prace', 'stav_staveniste', 'dodavky', 'opatreni', 'dalsi_zaznamy', 'upozorneni']));
  if (navrh.mechanizace) update('zapisy', z.id, { mechanizace: navrh.mechanizace });
  fotky.forEach((f, i) => { if (navrh.popisky_fotek[i] && !f.popisek) update('fotky', f.id, { popisek: navrh.popisky_fotek[i] }); });
  return zapisSFotkami(zapis(z.id));
});

r('POST', '/api/zapisy/:id/uzavrit', (req, p) => {
  const z = nutny(zapis(p.id)); upravitelny(z);
  if (!z.provedene_prace?.trim()) throw new HttpChyba(400, 'Záznam nemá vyplněné provedené práce.');
  if (/\[doplnit/i.test([z.provedene_prace, z.dodavky, z.dalsi_zaznamy, z.stav_staveniste, z.opatreni, z.mechanizace].join(' ')))
    throw new HttpChyba(400, 'V záznamu zůstalo „[doplnit]“ – doplňte chybějící údaje.');
  const cislo = db.prepare('SELECT COALESCE(MAX(cislo), 0) + 1 n FROM zapisy WHERE stavba_id = ?').get(z.stavba_id).n;
  update('zapisy', z.id, { stav: 'uzavren', cislo, uzavreno: new Date().toISOString() });
  return zapisSFotkami(zapis(z.id));
});

r('POST', '/api/zapisy/:id/fotky', async (req, p) => {
  const z = nutny(zapis(p.id)); upravitelny(z);
  const { data, popisek, porizeno } = await telo(req);
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(data || '');
  if (!m) throw new HttpChyba(400, 'Neplatný obrázek');
  const soubor = `${randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  writeFileSync(path.join(FOTO_DIR, soubor), Buffer.from(m[2], 'base64'));
  const poradi = db.prepare('SELECT COALESCE(MAX(poradi), 0) + 1 n FROM fotky WHERE zapis_id = ?').get(z.id).n;
  insert('fotky', { zapis_id: z.id, soubor, popisek: popisek || null, porizeno: porizeno || null, poradi });
  return zapisSFotkami(zapis(z.id));
});

r('PUT', '/api/fotky/:id', async (req, p) => {
  const f = nutny(db.prepare('SELECT * FROM fotky WHERE id = ?').get(p.id), 'Fotka');
  upravitelny(zapis(f.zapis_id));
  const { popisek } = await telo(req);
  update('fotky', f.id, { popisek: popisek || null });
  return { ok: true };
});

r('DELETE', '/api/fotky/:id', (req, p) => {
  const f = nutny(db.prepare('SELECT * FROM fotky WHERE id = ?').get(p.id), 'Fotka');
  upravitelny(zapis(f.zapis_id));
  try { unlinkSync(path.join(FOTO_DIR, f.soubor)); } catch {}
  db.prepare('DELETE FROM fotky WHERE id = ?').run(f.id);
  return { ok: true };
});

r('GET', '/api/stanice', async (req, p, url) => {
  const lat = +url.searchParams.get('lat'), lon = +url.searchParams.get('lon');
  return nejblizsiStanice(lat, lon, 8);
});

r('GET', '/api/pocasi', async (req, p, url) => pocasiProDen({
  lat: +url.searchParams.get('lat'), lon: +url.searchParams.get('lon'),
  datum: url.searchParams.get('datum'), wsi: url.searchParams.get('wsi') || null,
}));

// Převod adresy na souřadnice (OpenStreetMap Nominatim)
r('GET', '/api/geokodovani', async (req, p, url) => {
  const q = url.searchParams.get('q');
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=cz,sk&q=${encodeURIComponent(q)}`,
    { headers: { 'User-Agent': 'stavebni-denik/1.0', 'Accept-Language': 'cs' } });
  if (!res.ok) throw new HttpChyba(502, 'Vyhledání adresy selhalo');
  return (await res.json()).map((x) => ({ nazev: x.display_name, lat: +x.lat, lon: +x.lon }));
});

function smazFotky(zapisId) {
  for (const f of fotkyZapisu(zapisId)) try { unlinkSync(path.join(FOTO_DIR, f.soubor)); } catch {}
}

// --- server -----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (HESLO) {
    const [, b64] = (req.headers.authorization || '').split(' ');
    const heslo = b64 ? Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':') : null;
    if (heslo !== HESLO) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Stavebni denik", charset="UTF-8"' });
      return res.end('Přihlášení vyžadováno');
    }
  }
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const rt of routy) {
        const m = rt.metoda === req.method && rt.re.exec(url.pathname);
        if (m) return json(res, 200, await rt.fn(req, m.groups || {}, url));
      }
      throw new HttpChyba(404, 'Neznámá adresa API');
    }
    if (url.pathname.startsWith('/fotky/')) {
      const f = path.join(FOTO_DIR, path.basename(url.pathname));
      if (souborStaticky(res, f)) return;
    } else {
      const f = path.join(PUBLIC, path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''));
      if (f.startsWith(PUBLIC) && souborStaticky(res, url.pathname === '/' ? path.join(PUBLIC, 'index.html') : f)) return;
    }
    res.writeHead(404); res.end('Nenalezeno');
  } catch (e) {
    const status = e.status && e.status < 600 ? e.status : 500;
    if (status >= 500) console.error(e);
    json(res, status, { chyba: e.message || 'Chyba serveru' });
  }
});

server.listen(PORT, () => {
  console.log(`Stavební deník běží na http://localhost:${PORT}`);
  console.log(aiDostupne() ? 'Generování zápisů: Claude (' + (process.env.CLAUDE_MODEL || 'claude-opus-5-5') + ')' : 'Generování zápisů: VYPNUTO (chybí ANTHROPIC_API_KEY v .env)');
});
