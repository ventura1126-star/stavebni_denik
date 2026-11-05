// Počasí pro stavební deník (v prohlížeči)
// 1) Měření z nejbližší automatické stanice ČHMÚ – denní souhrny, které každých pár hodin
//    ukládá GitHub Actions do složky pocasi/ (viz scripts/archiv-pocasi.mjs)
// 2) Slovní popis oblačnosti a záloha (když den v archivu chybí): Open-Meteo, modelová data

const ARCHIV = 'pocasi';
const TZ = 'Europe/Prague';
export const HODINY_MERENI = [7, 12, 17];

const cz = (x) => String(x).replace('.', ',');
const zaokr = (x, n = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** n) / 10 ** n);

async function json(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}

let staniceCache;
export async function seznamStanic() {
  return (staniceCache ||= json(`${ARCHIV}/stanice.json`).catch((e) => { staniceCache = null; throw e; }));
}

function vzdalenostKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function nejblizsiStanice(lat, lon, pocet = 8) {
  return (await seznamStanic())
    .map((s) => ({ ...s, km: zaokr(vzdalenostKm({ lat, lon }, s)) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, pocet);
}

async function zArchivu(lat, lon, datum, wsi) {
  let den;
  try { den = await json(`${ARCHIV}/${datum}.json`); } catch { return null; }
  const kandidati = await nejblizsiStanice(lat, lon, 6);
  if (wsi) {
    const st = (await seznamStanic()).find((s) => s.wsi === wsi);
    if (st) kandidati.unshift({ ...st, km: zaokr(vzdalenostKm({ lat, lon }, st)) });
  }
  for (const st of kandidati) {
    const d = den.stanice[st.wsi];
    if (!d) continue;
    return {
      zdroj: 'chmu',
      stanice: { wsi: st.wsi, nazev: st.nazev, km: st.km, vyska: st.vyska },
      teploty: Object.fromEntries(HODINY_MERENI.map((h, i) => [h, d.t[i]])),
      tmin: d.tmin, tmax: d.tmax, srazky_den: d.sr, srazky_prac: d.srp,
      vitr_prumer: d.vp, vitr_narazy: d.vn, vlhkost: d.h, data_do: d.do,
      aktualizovano: den.aktualizovano,
    };
  }
  return null;
}

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
    '&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,snow_depth&wind_speed_unit=ms';
  let j;
  try { j = await json(`https://api.open-meteo.com/v1/forecast?${q}`); }
  catch { j = await json(`https://archive-api.open-meteo.com/v1/archive?${q}`); }
  const H = j.hourly;
  const idx = (h) => H.time.findIndex((t) => t.endsWith(`T${String(h).padStart(2, '0')}:00`));
  const prac = H.time.map((t, i) => [+t.slice(11, 13), i]).filter(([h]) => h >= 6 && h < 18).map(([, i]) => i);
  const kody = prac.map((i) => H.weather_code[i]).filter((x) => x != null);
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
  if (lat == null || lon == null) throw new Error('Stavba nemá zadanou polohu');
  const [chmu, om] = await Promise.allSettled([zArchivu(lat, lon, datum, wsi), zOpenMeteo(lat, lon, datum)]);
  const mereni = chmu.status === 'fulfilled' ? chmu.value : null;
  const model = om.status === 'fulfilled' ? om.value : null;
  if (!mereni && !model) throw new Error('Počasí se nepodařilo získat');
  const p = { ...(mereni ?? model.zaloha), popis: model?.popis ?? '', snih_cm: model?.snih_cm ?? 0, datum };
  p.shrnuti = shrnuti(p);
  p.zdroj_text = mereni
    ? `ČHMÚ, automatická stanice ${mereni.stanice.nazev} (${cz(mereni.stanice.km)} km od stavby)` + (model ? '; popis oblačnosti: Open-Meteo' : '')
    : 'Open-Meteo (modelová data – měření ČHMÚ pro tento den není v archivu)';
  return p;
}
