// Počasí pro stavební deník
// 1) Naměřená data z nejbližší automatické stanice ČHMÚ (opendata.chmi.cz, 10min data, posledních ~48 h)
// 2) Slovní popis (oblačnost, jev) a záloha pro starší data: Open-Meteo (modelová data)

const CHMU = 'https://opendata.chmi.cz/meteorology/climate/now';
const TZ = 'Europe/Prague';
export const HODINY_MERENI = [7, 12, 17]; // ranní, polední, odpolední odečet jako v papírovém deníku

const cache = new Map(); // klíč → { do, data }
async function ziskej(url, ttlMs) {
  const c = cache.get(url);
  if (c && c.do > Date.now()) return c.data;
  const r = await fetch(url, { headers: { 'User-Agent': 'stavebni-denik/1.0' } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status} ${url}`);
    e.status = r.status;
    throw e;
  }
  const data = await r.json();
  cache.set(url, { do: Date.now() + ttlMs, data });
  return data;
}

const ymd = (d) => d.toISOString().slice(0, 10).replaceAll('-', '');

// --- Stanice ČHMÚ ---------------------------------------------------------
let staniceCache = null;
export async function seznamStanic() {
  if (staniceCache && staniceCache.do > Date.now()) return staniceCache.data;
  let meta1, meta2;
  for (const posun of [0, 1]) {
    const d = ymd(new Date(Date.now() - posun * 864e5));
    try {
      meta1 = await ziskej(`${CHMU}/metadata/meta1-${d}.json`, 864e5);
      meta2 = await ziskej(`${CHMU}/metadata/meta2-${d}.json`, 864e5);
      break;
    } catch { /* metadata pro dnešek ještě nemusí být, zkus včerejšek */ }
  }
  if (!meta1) throw new Error('Nepodařilo se načíst seznam stanic ČHMÚ');

  const prvky = new Map(); // WSI → Set prvků v 10min datech
  for (const [typ, wsi, prvek] of meta2.data.data.values) {
    if (typ !== '10M') continue;
    if (!prvky.has(wsi)) prvky.set(wsi, new Set());
    prvky.get(wsi).add(prvek);
  }
  const stanice = [];
  for (const [wsi, , nazev, lon, lat, vyska] of meta1.data.data.values) {
    const p = prvky.get(wsi);
    if (!p || !p.has('T')) continue; // jen stanice s měřením teploty
    if (lat < 48.4 || lat > 51.2 || lon < 11.9 || lon > 19.0) continue; // ČR + okolí
    stanice.push({ wsi, nazev, lat, lon, vyska, srazky: p.has('SRA10M'), vitr: p.has('Fmax') });
  }
  staniceCache = { do: Date.now() + 864e5, data: stanice };
  return stanice;
}

function vzdalenostKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function nejblizsiStanice(lat, lon, pocet = 5) {
  const st = await seznamStanic();
  return st
    .map((s) => ({ ...s, km: Math.round(vzdalenostKm({ lat, lon }, s) * 10) / 10 }))
    .sort((a, b) => a.km - b.km)
    .slice(0, pocet);
}

// místní čas (Praha) z UTC ISO řetězce
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function mistni(iso) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { datum: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute };
}

async function nactiDenStanice(wsi, datum) {
  // Den v místním čase se může rozkládat do dvou UTC souborů → načti oba
  const d = new Date(datum + 'T12:00:00Z');
  const soubory = [ymd(new Date(d.getTime() - 864e5)), ymd(d)];
  const radky = [];
  for (const s of soubory) {
    try {
      const j = await ziskej(`${CHMU}/data/10m-${wsi}-${s}.json`, 15 * 60e3);
      radky.push(...j.data.data.values);
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }
  const out = {};
  for (const [, prvek, dt, val, , kvalita] of radky) {
    if (val === null || kvalita === 4 || kvalita === 2) continue;
    const t = mistni(dt);
    if (t.datum !== datum) continue;
    (out[prvek] ||= []).push({ ...t, val });
  }
  return out;
}

const zaokr = (x, n = 1) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** n) / 10 ** n);

function hodnotaVHodinu(rada, h) {
  if (!rada) return null;
  // přesně v celou hodinu, jinak nejbližší hodnota do 30 min
  let best = null, bestD = 31;
  for (const r of rada) {
    const d = Math.abs(r.h * 60 + r.m - h * 60);
    if (d < bestD) { best = r.val; bestD = d; }
  }
  return best;
}

async function zChmu(lat, lon, datum, rucniWsi) {
  const kandidati = await nejblizsiStanice(lat, lon, 6);
  if (rucniWsi) {
    const st = (await seznamStanic()).find((s) => s.wsi === rucniWsi);
    if (st) kandidati.unshift({ ...st, km: zaokr(vzdalenostKm({ lat, lon }, st)) });
  }
  for (const st of kandidati) {
    const d = await nactiDenStanice(st.wsi, datum);
    if (!d.T || d.T.length < 6) continue; // stanice nemá data pro tento den
    const teploty = d.T.map((r) => r.val);
    const pracovni = (r) => r.h >= 6 && r.h < 18;
    const srazkyDen = d.SRA10M ? d.SRA10M.reduce((s, r) => s + r.val, 0) : null;
    const srazkyPrac = d.SRA10M ? d.SRA10M.filter(pracovni).reduce((s, r) => s + r.val, 0) : null;
    const narazy = d.Fmax ? Math.max(...d.Fmax.map((r) => r.val)) : null;
    const vitrPrac = d.F ? d.F.filter(pracovni).map((r) => r.val) : [];
    const svit = d.SSV10M ? d.SSV10M.reduce((s, r) => s + r.val, 0) / 3600 : null;
    const posledni = d.T[d.T.length - 1];
    return {
      zdroj: 'chmu',
      stanice: { wsi: st.wsi, nazev: st.nazev, km: st.km, vyska: st.vyska },
      teploty: Object.fromEntries(HODINY_MERENI.map((h) => [h, zaokr(hodnotaVHodinu(d.T, h))])),
      tmin: zaokr(Math.min(...(d.TMI?.map((r) => r.val) ?? teploty))),
      tmax: zaokr(Math.max(...(d.TMA?.map((r) => r.val) ?? teploty))),
      srazky_den: zaokr(srazkyDen),
      srazky_prac: zaokr(srazkyPrac),
      vitr_prumer: vitrPrac.length ? zaokr(vitrPrac.reduce((a, b) => a + b, 0) / vitrPrac.length) : null,
      vitr_narazy: zaokr(narazy),
      vlhkost: d.H ? zaokr(hodnotaVHodinu(d.H, 12), 0) : null,
      slunecni_svit_h: zaokr(svit),
      data_do: `${String(posledni.h).padStart(2, '0')}:${String(posledni.m).padStart(2, '0')}`,
    };
  }
  return null;
}

// --- Open-Meteo: slovní popis + záloha -------------------------------------
const WMO = {
  0: 'jasno', 1: 'skoro jasno', 2: 'polojasno', 3: 'zataženo', 45: 'mlha', 48: 'mlha s námrazou',
  51: 'slabé mrholení', 53: 'mrholení', 55: 'silné mrholení', 56: 'mrznoucí mrholení', 57: 'mrznoucí mrholení',
  61: 'slabý déšť', 63: 'déšť', 65: 'silný déšť', 66: 'mrznoucí déšť', 67: 'mrznoucí déšť',
  71: 'slabé sněžení', 73: 'sněžení', 75: 'silné sněžení', 77: 'sněhová zrna',
  80: 'přeháňky', 81: 'dešťové přeháňky', 82: 'silné přeháňky', 85: 'sněhové přeháňky', 86: 'silné sněhové přeháňky',
  95: 'bouřka', 96: 'bouřka s krupobitím', 99: 'bouřka s krupobitím',
};

async function zOpenMeteo(lat, lon, datum) {
  const q = `latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(TZ)}&start_date=${datum}&end_date=${datum}` +
    '&hourly=temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,snow_depth&wind_speed_unit=ms';
  let j;
  try {
    j = await ziskej(`https://api.open-meteo.com/v1/forecast?${q}`, 30 * 60e3);
  } catch {
    j = await ziskej(`https://archive-api.open-meteo.com/v1/archive?${q}`, 864e5);
  }
  const H = j.hourly;
  const idx = (h) => H.time.findIndex((t) => t.endsWith(`T${String(h).padStart(2, '0')}:00`));
  const prac = H.time.map((t, i) => [+t.slice(11, 13), i]).filter(([h]) => h >= 6 && h < 18).map(([, i]) => i);
  const kody = prac.map((i) => H.weather_code[i]).filter((x) => x != null);
  // převládající stav + nejvýznamnější jev během pracovní doby
  const cetnost = {};
  for (const k of kody) cetnost[k] = (cetnost[k] || 0) + 1;
  const prevlada = +Object.entries(cetnost).sort((a, b) => b[1] - a[1])[0]?.[0];
  const nejhorsi = Math.max(...kody);
  let popis = WMO[prevlada] ?? '';
  if (nejhorsi >= 45 && nejhorsi !== prevlada && WMO[nejhorsi]) popis += `, občas ${WMO[nejhorsi]}`;
  const snih = H.snow_depth ? Math.max(...prac.map((i) => H.snow_depth[i] ?? 0)) : 0;
  const teplotyDen = H.temperature_2m.filter((x) => x != null);
  return {
    popis,
    snih_cm: snih > 0 ? zaokr(snih * 100, 0) : 0,
    zaloha: {
      zdroj: 'open-meteo',
      teploty: Object.fromEntries(HODINY_MERENI.map((h) => [h, zaokr(H.temperature_2m[idx(h)])])),
      tmin: zaokr(Math.min(...teplotyDen)),
      tmax: zaokr(Math.max(...teplotyDen)),
      srazky_den: zaokr(H.precipitation.reduce((s, x) => s + (x || 0), 0)),
      srazky_prac: zaokr(prac.reduce((s, i) => s + (H.precipitation[i] || 0), 0)),
      vitr_prumer: zaokr(prac.reduce((s, i) => s + (H.wind_speed_10m[i] || 0), 0) / prac.length),
      vitr_narazy: zaokr(Math.max(...H.wind_gusts_10m.filter((x) => x != null))),
      vlhkost: zaokr(H.relative_humidity_2m[idx(12)], 0),
    },
  };
}

const cz = (x) => String(x).replace('.', ',');
function shrnuti(p) {
  const casti = [];
  if (p.popis) casti.push(p.popis[0].toUpperCase() + p.popis.slice(1));
  if (p.srazky_prac != null) casti.push(p.srazky_prac > 0.1 ? `srážky ${cz(p.srazky_prac)} mm (6–18 h)` : /déšť|mrholení|sněž|přeháň/.test(p.popis) ? 'bez měřitelných srážek' : 'bez srážek');
  if (p.vitr_narazy != null) {
    const v = p.vitr_narazy;
    casti.push(v >= 15 ? `silný vítr, nárazy ${cz(v)} m/s` : v >= 10 ? `větrno, nárazy ${cz(v)} m/s` : `slabý vítr (nárazy ${cz(v)} m/s)`);
  }
  if (p.snih_cm) casti.push(`sněhová pokrývka ${p.snih_cm} cm`);
  return casti.join(', ');
}

/** Počasí pro daný den a místo stavby. */
export async function pocasiProDen({ lat, lon, datum, wsi }) {
  if (lat == null || lon == null) throw new Error('Stavba nemá zadané souřadnice');
  const [chmu, om] = await Promise.allSettled([zChmu(lat, lon, datum, wsi), zOpenMeteo(lat, lon, datum)]);
  const mereni = chmu.status === 'fulfilled' ? chmu.value : null;
  const model = om.status === 'fulfilled' ? om.value : null;
  if (!mereni && !model) throw new Error('Počasí se nepodařilo získat (ČHMÚ ani Open-Meteo)');
  const p = { ...(mereni ?? model.zaloha), popis: model?.popis ?? '', snih_cm: model?.snih_cm ?? 0, datum, ziskano: new Date().toISOString() };
  p.shrnuti = shrnuti(p);
  p.zdroj_text = mereni
    ? `ČHMÚ, automatická stanice ${mereni.stanice.nazev} (${cz(mereni.stanice.km)} km od stavby)` + (model ? '; popis oblačnosti: Open-Meteo' : '')
    : 'Open-Meteo (modelová data – měření ČHMÚ pro tento den již není v otevřených datech k dispozici)';
  return p;
}
