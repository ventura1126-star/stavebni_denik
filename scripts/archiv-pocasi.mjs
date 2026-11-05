// Archiv počasí ze stanic ČHMÚ pro statickou stránku (spouští GitHub Actions)
//
// ČHMÚ drží v otevřených datech jen poslední ~2 dny 10minutových měření a nepovoluje
// jejich čtení přímo z prohlížeče. Tento skript je stáhne a pro každý den uloží
// malý souhrn za všechny stanice: <výstup>/YYYY-MM-DD.json + <výstup>/stanice.json.
//
// Použití: node scripts/archiv-pocasi.mjs <výstupní složka> [dnes|vcera]
//   dnes  – průběžný souhrn dnešního dne (spouští se několikrát přes den)
//   vcera – konečný souhrn včerejška (spouští se brzy ráno)

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const CHMU = 'https://opendata.chmi.cz/meteorology/climate/now';
const TZ = 'Europe/Prague';
const HODINY = [7, 12, 17];
const SOUBEZNE = 12;

const vystup = process.argv[2];
const rezim = process.argv[3] || 'dnes';
if (!vystup) { console.error('Chybí výstupní složka'); process.exit(1); }
mkdirSync(vystup, { recursive: true });

const ymd = (d) => d.toISOString().slice(0, 10).replaceAll('-', '');
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function mistni(d) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { datum: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute };
}
const zaokr = (x, n = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n);

async function stahni(url) {
  for (let pokus = 0; pokus < 3; pokus++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'stavebni-denik (github actions)' } });
    if (r.status === 404) return null;
    if (r.ok) return r.json();
    await new Promise((ok) => setTimeout(ok, 2000 * (pokus + 1)));
  }
  throw new Error(`Nelze stáhnout ${url}`);
}

// --- seznam stanic s měřením teploty -----------------------------------------
async function nactiStanice() {
  for (const posun of [0, 1]) {
    const d = ymd(new Date(Date.now() - posun * 864e5));
    const meta1 = await stahni(`${CHMU}/metadata/meta1-${d}.json`);
    const meta2 = await stahni(`${CHMU}/metadata/meta2-${d}.json`);
    if (!meta1 || !meta2) continue;
    const prvky = new Map();
    for (const [typ, wsi, prvek] of meta2.data.data.values) {
      if (typ !== '10M') continue;
      if (!prvky.has(wsi)) prvky.set(wsi, new Set());
      prvky.get(wsi).add(prvek);
    }
    return meta1.data.data.values
      .filter(([wsi, , , lon, lat]) => prvky.get(wsi)?.has('T') && lat > 48.4 && lat < 51.2 && lon > 11.9 && lon < 19)
      .map(([wsi, , nazev, lon, lat, vyska]) => ({ wsi, nazev, lat: zaokr(lat, 4), lon: zaokr(lon, 4), vyska: Math.round(vyska) }));
  }
  throw new Error('Metadata stanic ČHMÚ nejsou k dispozici');
}

function hodnotaVHodinu(rada, h) {
  let best = null, bestD = 31;
  for (const r of rada || []) {
    const d = Math.abs(r.h * 60 + r.m - h * 60);
    if (d < bestD) { best = r.val; bestD = d; }
  }
  return best;
}

// souhrn jednoho místního dne pro jednu stanici
function souhrn(radky, datum) {
  const d = {};
  for (const [, prvek, dt, val, , kvalita] of radky) {
    if (val === null || kvalita === 2 || kvalita === 4) continue;
    const t = mistni(new Date(dt));
    if (t.datum !== datum) continue;
    (d[prvek] ||= []).push({ h: t.h, m: t.m, val });
  }
  if (!d.T || d.T.length < 6) return null;
  const prac = (r) => r.h >= 6 && r.h < 18;
  const soucet = (a) => a.reduce((s, r) => s + r.val, 0);
  const teploty = d.T.map((r) => r.val);
  const vitr = (d.F || []).filter(prac).map((r) => r.val);
  const posl = d.T.reduce((a, b) => (b.h * 60 + b.m > a.h * 60 + a.m ? b : a));
  return {
    t: HODINY.map((h) => zaokr(hodnotaVHodinu(d.T, h))),
    tmin: zaokr(Math.min(...(d.TMI?.map((r) => r.val) ?? teploty))),
    tmax: zaokr(Math.max(...(d.TMA?.map((r) => r.val) ?? teploty))),
    sr: d.SRA10M ? zaokr(soucet(d.SRA10M)) : null,
    srp: d.SRA10M ? zaokr(soucet(d.SRA10M.filter(prac))) : null,
    vp: vitr.length ? zaokr(vitr.reduce((a, b) => a + b, 0) / vitr.length) : null,
    vn: d.Fmax ? zaokr(Math.max(...d.Fmax.map((r) => r.val))) : null,
    h: d.H ? zaokr(hodnotaVHodinu(d.H, 12), 0) : null,
    do: `${String(posl.h).padStart(2, '0')}:${String(posl.m).padStart(2, '0')}`,
    n: d.T.length, // počet měření teploty – úplnost dne
  };
}

async function poSkupinach(polozky, fn) {
  const vysledky = [];
  for (let i = 0; i < polozky.length; i += SOUBEZNE) {
    vysledky.push(...(await Promise.all(polozky.slice(i, i + SOUBEZNE).map(fn))));
  }
  return vysledky;
}

// --- hlavní běh ---------------------------------------------------------------
const ted = new Date();
const datum = mistni(rezim === 'vcera' ? new Date(ted.getTime() - 864e5) : ted).datum;
// místní den leží ve dvou UTC souborech: předchozí UTC den (noc) a ten samý UTC den
const poledne = new Date(datum + 'T12:00:00Z');
const soubory = [ymd(new Date(poledne.getTime() - 864e5)), ymd(poledne)];

const stanice = await nactiStanice();
writeFileSync(path.join(vystup, 'stanice.json'), JSON.stringify(stanice));

const souborDne = path.join(vystup, `${datum}.json`);
const predchozi = existsSync(souborDne) ? JSON.parse(readFileSync(souborDne, 'utf8')) : { stanice: {} };

let chyb = 0;
const vysledky = await poSkupinach(stanice, async (s) => {
  try {
    const radky = [];
    for (const f of soubory) {
      const j = await stahni(`${CHMU}/data/10m-${s.wsi}-${f}.json`);
      if (j) radky.push(...j.data.data.values);
    }
    return [s.wsi, souhrn(radky, datum)];
  } catch (e) {
    chyb++;
    return [s.wsi, null];
  }
});

const nove = { ...predchozi.stanice };
for (const [wsi, s] of vysledky) {
  // starší úplnější souhrn nepřepisuj neúplným (např. když ČHMÚ už smazalo noční soubor)
  if (s && (!nove[wsi] || s.n >= nove[wsi].n)) nove[wsi] = s;
}
writeFileSync(souborDne, JSON.stringify({ datum, aktualizovano: ted.toISOString(), stanice: nove }));
console.log(`${datum}: ${Object.keys(nove).length} stanic uloženo (${chyb} chyb stahování)`);
