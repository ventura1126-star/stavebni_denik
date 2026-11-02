// Stavební deník – klientská aplikace (bez frameworku, hash routing)
const $app = document.getElementById('app');
const $drobky = document.getElementById('drobky');

// --- pomocné ------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = (s) => esc(s).replace(/\n/g, '<br>');
const cz = (x) => (x == null ? '–' : String(x).replace('.', ','));
const dnes = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD v místním čase
const DNY = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const datumCz = (d, sDnem = false) => {
  if (!d) return '';
  const x = new Date(d + 'T12:00:00');
  return (sDnem ? DNY[x.getDay()] + ' ' : '') + x.toLocaleDateString('cs-CZ');
};
const radky = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

async function api(cesta, { metoda = 'GET', data } = {}) {
  const r = await fetch('/api' + cesta, {
    method: metoda,
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.chyba || `Chyba ${r.status}`);
  return j;
}

let toastCas;
function toast(text, chyba = false) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.className = 'toast vidim' + (chyba ? ' chyba' : '');
  clearTimeout(toastCas);
  toastCas = setTimeout(() => (t.className = 'toast'), chyba ? 6000 : 3000);
}

async function prubeh(tlacitko, text, fn) {
  const puvodni = tlacitko.innerHTML;
  tlacitko.disabled = true;
  tlacitko.innerHTML = `<span class="nacitani"></span> ${esc(text)}`;
  try { return await fn(); }
  catch (e) { toast(e.message, true); throw e; }
  finally { tlacitko.disabled = false; tlacitko.innerHTML = puvodni; }
}

function drobky(...polozky) {
  $drobky.innerHTML = polozky.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : esc(t))).join(' › ');
}

const ikonaPocasi = (p) => {
  const s = (p?.popis || '') + ' ' + (p?.shrnuti || '');
  if (/bouřk/.test(s)) return '⛈️';
  if (/sníh|sněž/.test(s)) return '🌨️';
  if (/déšť|mrholení|přeháňk/.test(s)) return '🌧️';
  if (/mlha/.test(s)) return '🌫️';
  if (/zataženo/.test(s)) return '☁️';
  if (/polojasno|skoro jasno/.test(s)) return '⛅';
  if (/jasno/.test(s)) return '☀️';
  return '🌡️';
};

// zmenšení fotky v prohlížeči (rychlý upload z mobilu, menší data pro AI)
async function zmensiFotku(soubor, max = 1600) {
  const bmp = await createImageBitmap(soubor, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.84);
}

const IKONA_FOTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/></svg>';

// --- routy ------------------------------------------------------------------
const routy = [
  [/^#?\/?$/, seznamStaveb],
  [/^#\/stavba\/nova$/, () => formularStavby()],
  [/^#\/stavba\/(\d+)$/, (id) => detailStavby(id)],
  [/^#\/stavba\/(\d+)\/upravit$/, (id) => formularStavby(id)],
  [/^#\/stavba\/(\d+)\/novy$/, (id) => novyZapis(id)],
  [/^#\/stavba\/(\d+)\/tisk$/, (id) => tiskDeniku(id)],
  [/^#\/zapis\/(\d+)$/, (id) => editorZapisu(id)],
];

async function route() {
  document.body.classList.remove('rezim-tisk');
  window.scrollTo(0, 0);
  for (const [re, fn] of routy) {
    const m = location.hash.match(re);
    if (m) {
      try { await fn(...m.slice(1)); } catch (e) { $app.innerHTML = `<div class="karta">Chyba: ${esc(e.message)}</div>`; }
      return;
    }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);
let INFO = { ai: false };
api('/info').then((i) => (INFO = i)).catch(() => {}).finally(route);

// --- seznam staveb ------------------------------------------------------------
async function seznamStaveb() {
  drobky();
  const stavby = await api('/stavby');
  $app.innerHTML = `
    <div class="hlavicka">
      <div><h1>Stavby</h1><div class="tlumene">Vyberte stavbu a přidejte denní záznam z fotek.</div></div>
      <a class="tlacitko primarni" href="#/stavba/nova">+ Nová stavba</a>
    </div>
    ${stavby.length ? `<div class="mrizka">${stavby.map((s) => `
      <a class="karta" href="#/stavba/${s.id}">
        <h3>${esc(s.nazev)}</h3>
        <div class="tlumene male">${esc(s.misto || 'Místo nezadáno')}</div>
        <div class="male" style="margin-top:.5rem">${s.pocet_zapisu} záznamů${s.posledni_zapis ? ` · poslední ${datumCz(s.posledni_zapis)}` : ''}</div>
      </a>`).join('')}</div>`
    : `<div class="karta prazdne">Zatím tu není žádná stavba.<br><br><a class="tlacitko primarni" href="#/stavba/nova">Založit první stavbu</a></div>`}`;
}

// --- formulář stavby (identifikační údaje – část A) -------------------------
const POLE_STAVBY = [
  ['Základní údaje', [
    ['nazev', 'Název stavby', 'dle povolení, např. „Rodinný dům – dřevostavba, p. č. 1234/5“', 'text'],
    ['misto', 'Místo stavby', 'adresa, obec, katastrální území, parcelní čísla', 'text'],
    ['povoleni', 'Povolení stavby', 'druh, číslo jednací, datum vydání, stavební úřad', 'textarea'],
    ['typ_evidence', 'Forma evidence', '', 'typ'],
    ['datum_predani', 'Předání a převzetí staveniště', '', 'date'],
    ['datum_zahajeni', 'Zahájení prací', '', 'date'],
  ]],
  ['Účastníci výstavby', [
    ['stavebnik', 'Stavebník (investor)', 'jméno / firma, adresa / sídlo, IČO', 'textarea'],
    ['zhotovitel', 'Zhotovitel', 'obchodní firma, sídlo, IČO', 'textarea'],
    ['poddodavatele', 'Poddodavatelé', 'jeden na řádek: firma, sídlo, IČO – činnost', 'textarea'],
    ['projektant', 'Projektant', 'jméno, firma, č. autorizace ČKAIT', 'textarea'],
  ]],
  ['Odpovědné a oprávněné osoby', [
    ['stavbyvedouci', 'Stavbyvedoucí (odborné vedení provádění stavby)', 'jméno, č. autorizace ČKAIT, rozsah oprávnění, telefon', 'textarea'],
    ['tds', 'Technický dozor stavebníka', 'pokud je zřízen', 'textarea'],
    ['ad', 'Autorský dozor', 'pokud je zřízen', 'textarea'],
    ['opravnene_osoby', 'Další osoby oprávněné k zápisu', 'jedna na řádek: jméno a příjmení – funkce (např. koordinátor BOZP)', 'textarea'],
  ]],
  ['Dokumentace a doklady', [
    ['dokumentace', 'Projektová a technická dokumentace', 'stupeň, zpracovatel, datum, ověření; změny dokumentace', 'textarea'],
    ['doklady', 'Seznam dokladů ke stavbě', 'smlouva o dílo, povolení, vyjádření, protokoly o zkouškách…', 'textarea'],
  ]],
  ['Pro rychlé zápisy', [
    ['pracovnici', 'Parta – pracovníci na stavbě', 'jedno jméno a příjmení na řádek; při zápisu je jen zaškrtnete', 'textarea'],
    ['mechanizace', 'Obvyklá mechanizace', 'např. autojeřáb, nůžková plošina, AKU nářadí', 'textarea'],
    ['poznamky', 'Interní poznámky', 'netisknou se', 'textarea'],
  ]],
];

async function formularStavby(id) {
  const s = id ? await api(`/stavby/${id}`) : { typ_evidence: 'denik' };
  drobky(['Stavby', '#/'], ...(id ? [[s.nazev, `#/stavba/${id}`]] : []), [id ? 'Upravit' : 'Nová stavba']);
  const pole = ([k, n, nap, typ]) => {
    const v = esc(s[k] ?? '');
    if (typ === 'typ') return `<label for="${k}">${n}</label>
      <select id="${k}" name="${k}">
        <option value="denik" ${s[k] !== 'zaznam' ? 'selected' : ''}>Stavební deník (stavba vyžaduje povolení)</option>
        <option value="zaznam" ${s[k] === 'zaznam' ? 'selected' : ''}>Jednoduchý záznam o stavbě</option>
      </select>`;
    const vstup = typ === 'textarea'
      ? `<textarea id="${k}" name="${k}" rows="3">${v}</textarea>`
      : `<input id="${k}" name="${k}" type="${typ}" value="${v}" ${k === 'nazev' ? 'required' : ''}>`;
    return `<label for="${k}">${n}</label>${vstup}${nap ? `<div class="napoveda">${nap}</div>` : ''}`;
  };
  $app.innerHTML = `
    <h1>${id ? 'Identifikační údaje stavby' : 'Nová stavba'}</h1>
    <p class="tlumene">Údaje odpovídají části A stavebního deníku (příloha č. 12 vyhl. č. 131/2024 Sb.) a vytisknou se na úvodní listy.</p>
    <form id="f">
      ${POLE_STAVBY.map(([nadpis, p]) => `<fieldset><legend>${nadpis}</legend>${p.map(pole).join('')}
        ${nadpis === 'Základní údaje' ? `
          <label>Poloha stavby pro počasí <span class="tlumene">– najde nejbližší meteostanici ČHMÚ</span></label>
          <div style="display:flex;gap:.5rem"><input type="search" id="hledat" placeholder="Hledat adresu…" value="${esc(s.misto ?? '')}"><button type="button" id="btnHledat">Najít</button></div>
          <ul class="vysledky-adres" id="vysledky" hidden></ul>
          <div class="dva">
            <div><label for="lat">Zeměpisná šířka</label><input id="lat" name="lat" type="number" step="any" value="${s.lat ?? ''}"></div>
            <div><label for="lon">Zeměpisná délka</label><input id="lon" name="lon" type="number" step="any" value="${s.lon ?? ''}"></div>
          </div>
          <label for="stanice_wsi">Meteostanice ČHMÚ</label>
          <select id="stanice_wsi" name="stanice_wsi"><option value="">Automaticky nejbližší</option></select>
          <div class="napoveda" id="staniceInfo"></div>` : ''}
      </fieldset>`).join('')}
      <div class="spodni-lista">
        ${id ? `<a class="tlacitko" href="#/stavba/${id}">Zpět</a>` : `<a class="tlacitko" href="#/">Zrušit</a>`}
        <button class="primarni velke" type="submit">Uložit stavbu</button>
      </div>
    </form>`;

  const f = document.getElementById('f');
  const $lat = f.lat, $lon = f.lon, $st = f.stanice_wsi;
  async function nactiStanice() {
    if (!$lat.value || !$lon.value) return;
    try {
      const st = await api(`/stanice?lat=${$lat.value}&lon=${$lon.value}`);
      $st.innerHTML = `<option value="">Automaticky nejbližší (${esc(st[0]?.nazev)}, ${cz(st[0]?.km)} km)</option>` +
        st.map((x) => `<option value="${x.wsi}" ${x.wsi === s.stanice_wsi ? 'selected' : ''}>${esc(x.nazev)} – ${cz(x.km)} km, ${Math.round(x.vyska)} m n. m.</option>`).join('');
      document.getElementById('staniceInfo').textContent = 'Data: ČHMÚ – otevřená data, automatické stanice, 10minutová měření.';
    } catch (e) { document.getElementById('staniceInfo').textContent = 'Stanice se nepodařilo načíst: ' + e.message; }
  }
  nactiStanice();
  $lat.addEventListener('change', nactiStanice); $lon.addEventListener('change', nactiStanice);

  async function hledej() {
    const q = document.getElementById('hledat').value.trim();
    if (!q) return;
    const $v = document.getElementById('vysledky');
    const vys = await prubeh(document.getElementById('btnHledat'), 'Hledám', () => api(`/geokodovani?q=${encodeURIComponent(q)}`));
    $v.hidden = false;
    $v.innerHTML = vys.length ? vys.map((x, i) => `<li><button type="button" data-i="${i}">${esc(x.nazev)}</button></li>`).join('') : '<li class="tlumene" style="padding:.6rem">Nic nenalezeno – zkuste obec nebo zadejte souřadnice ručně (např. z mapy.cz).</li>';
    $v.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const x = vys[b.dataset.i];
      $lat.value = x.lat.toFixed(5); $lon.value = x.lon.toFixed(5);
      if (!f.misto.value) f.misto.value = x.nazev;
      $v.hidden = true; nactiStanice();
    };
  }
  document.getElementById('btnHledat').onclick = hledej;
  document.getElementById('hledat').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hledej(); } });

  f.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    data.lat = data.lat ? +data.lat : null; data.lon = data.lon ? +data.lon : null;
    const btn = f.querySelector('[type=submit]');
    const ulozena = await prubeh(btn, 'Ukládám', () => api(id ? `/stavby/${id}` : '/stavby', { metoda: id ? 'PUT' : 'POST', data }));
    toast('Stavba uložena');
    location.hash = `#/stavba/${ulozena.id}`;
  };
}

// --- detail stavby -----------------------------------------------------------
async function detailStavby(id) {
  const [s, zapisy] = await Promise.all([api(`/stavby/${id}`), api(`/stavby/${id}/zapisy`)]);
  drobky(['Stavby', '#/'], [s.nazev]);
  const koncepty = zapisy.filter((z) => z.stav !== 'uzavren').length;
  $app.innerHTML = `
    <div class="hlavicka">
      <div>
        <h1>${esc(s.nazev)}</h1>
        <div class="tlumene">${esc(s.misto || '')}</div>
      </div>
      <div class="akce">
        <a class="tlacitko" href="#/stavba/${id}/upravit">Identifikační údaje</a>
        <a class="tlacitko" href="#/stavba/${id}/tisk">🖨 Tisk deníku</a>
      </div>
    </div>
    ${s.lat == null ? `<div class="upozorneni" style="margin-bottom:1rem">Stavba nemá zadanou polohu – počasí nelze načíst. <a href="#/stavba/${id}/upravit">Doplnit polohu</a></div>` : ''}
    <a class="tlacitko primarni velke" style="width:100%;margin-bottom:1.25rem" href="#/stavba/${id}/novy">${IKONA_FOTO.replace('<svg', '<svg width="22" height="22"')} Nový denní záznam z fotek</a>
    <h2>Záznamy <span class="tlumene male">(${zapisy.length}${koncepty ? `, z toho ${koncepty} neuzavřené` : ''})</span></h2>
    ${zapisy.length ? `<ul class="osa">${[...zapisy].reverse().map((z) => {
      const d = new Date(z.datum + 'T12:00:00');
      return `<li><a class="karta zaznam-radek" href="#/zapis/${z.id}">
        <div class="datumovka"><small>${DNY[d.getDay()].slice(0, 2)}</small><b>${d.getDate()}.</b><small>${d.getMonth() + 1}. ${d.getFullYear()}</small></div>
        <div>
          <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
            <strong>${z.cislo ? `Záznam č. ${z.cislo}` : 'Koncept'}</strong>
            <span class="stitek ${z.stav}">${z.stav === 'uzavren' ? 'uzavřeno' : 'koncept'}</span>
            ${z.pocasi ? `<span class="tlumene male">${ikonaPocasi(z.pocasi)} ${cz(z.pocasi.teploty?.[12])} °C</span>` : ''}
          </div>
          <div class="oriznout male" style="margin-top:.2rem">${esc(z.provedene_prace || z.popisek || '—')}</div>
          ${z.fotky.length ? `<div class="nahledy">${z.fotky.slice(0, 6).map((f) => `<img src="${f.url}" alt="" loading="lazy">`).join('')}${z.fotky.length > 6 ? `<span class="tlumene male" style="align-self:center">+${z.fotky.length - 6}</span>` : ''}</div>` : ''}
        </div></a></li>`;
    }).join('')}</ul>` : `<div class="karta prazdne">Zatím žádné záznamy. Začněte tlačítkem výše – stačí pár fotek a jedna věta.</div>`}`;
}

// --- nový záznam: fotky + popisek -------------------------------------------
async function novyZapis(stavbaId) {
  const s = await api(`/stavby/${stavbaId}`);
  drobky(['Stavby', '#/'], [s.nazev, `#/stavba/${stavbaId}`], ['Nový záznam']);
  const parta = radky(s.pracovnici);
  const fotky = []; // { soubor, nahled }
  $app.innerHTML = `
    <h1>Nový denní záznam</h1>
    <p class="tlumene">Nahrajte fotky z dnešního dne a napište pár slov. Zápis do deníku se vytvoří automaticky${INFO.ai ? '' : ' (AI není nastavena – text se převezme z popisku)'}, počasí se doplní ze stanice ČHMÚ.</p>
    <form id="f">
      <fieldset><legend>Den</legend>
        <label for="datum">Datum</label>
        <input type="date" id="datum" name="datum" value="${dnes()}" max="${dnes()}" required>
      </fieldset>
      <fieldset><legend>Fotky ze stavby</legend>
        <div class="fotky" id="fotky"></div>
        <input type="file" id="soubory" accept="image/*" multiple hidden>
      </fieldset>
      <fieldset><legend>Co se dnes dělalo</legend>
        <label for="popisek">Krátký popis <span class="tlumene">– stačí heslovitě</span></label>
        <textarea id="popisek" name="popisek" rows="4" placeholder="Např.: montáž obvodových stěn 1.NP osa A–C, přivezeno 12 m³ KVH od Holzu, jeřáb 7–11, TDS převzal kotvení prahů"></textarea>
      </fieldset>
      <fieldset><legend>Pracovníci na staveništi</legend>
        ${parta.length ? `<div class="pracovnici">${parta.map((p, i) => `<label><input type="checkbox" name="p" value="${esc(p)}" checked> ${esc(p)}</label>`).join('')}</div>` : ''}
        <label for="dalsi">${parta.length ? 'Další osoby' : 'Jména a příjmení'} <span class="tlumene">– jedna na řádek</span></label>
        <textarea id="dalsi" rows="2" placeholder="Jan Novák – tesař"></textarea>
        ${parta.length ? '' : `<div class="napoveda">Tip: stálou partu zadejte v <a href="#/stavba/${stavbaId}/upravit">údajích stavby</a>, pak ji jen zaškrtnete.</div>`}
      </fieldset>
      <div class="spodni-lista">
        <a class="tlacitko" href="#/stavba/${stavbaId}">Zrušit</a>
        <button class="primarni velke" type="submit">Vytvořit zápis</button>
      </div>
    </form>`;

  const $f = document.getElementById('fotky'), $in = document.getElementById('soubory');
  const kresli = () => {
    $f.innerHTML = fotky.map((x, i) => `<div class="fotka"><span class="cislo">${i + 1}</span>
        <button type="button" class="smazat" data-i="${i}" aria-label="Odebrat">✕</button><img src="${x.nahled}" alt=""></div>`).join('') +
      `<label class="pridat-foto" for="soubory">${IKONA_FOTO}<span>Vyfotit / přidat fotky</span></label>`;
  };
  kresli();
  $in.onchange = async () => {
    for (const soubor of $in.files) {
      try { fotky.push({ data: await zmensiFotku(soubor), nahled: URL.createObjectURL(soubor), porizeno: new Date(soubor.lastModified).toISOString() }); }
      catch { toast(`Soubor ${soubor.name} nelze načíst`, true); }
    }
    $in.value = ''; kresli();
  };
  $f.onclick = (e) => { const b = e.target.closest('.smazat'); if (b) { fotky.splice(+b.dataset.i, 1); kresli(); } };

  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const popisek = f.popisek.value.trim();
    if (!popisek && !fotky.length) return toast('Přidejte fotky nebo popis', true);
    const pracovnici = [...f.querySelectorAll('input[name=p]:checked')].map((x) => x.value).concat(radky(document.getElementById('dalsi').value));
    const btn = f.querySelector('[type=submit]');
    await prubeh(btn, 'Načítám počasí', async () => {
      let z = await api(`/stavby/${stavbaId}/zapisy`, { metoda: 'POST', data: { datum: f.datum.value, popisek, pracovnici: pracovnici.join('\n') || null } });
      for (let i = 0; i < fotky.length; i++) {
        btn.innerHTML = `<span class="nacitani"></span> Nahrávám fotku ${i + 1}/${fotky.length}`;
        z = await api(`/zapisy/${z.id}/fotky`, { metoda: 'POST', data: { data: fotky[i].data, porizeno: fotky[i].porizeno } });
      }
      btn.innerHTML = `<span class="nacitani"></span> ${INFO.ai ? 'Píšu zápis podle fotek…' : 'Vytvářím zápis'}`;
      try { await api(`/zapisy/${z.id}/generovat`, { metoda: 'POST' }); }
      catch (err) { toast('Zápis se nepodařilo vygenerovat: ' + err.message, true); }
      location.hash = `#/zapis/${z.id}`;
    });
  };
}

// --- editor záznamu ----------------------------------------------------------
const POLE_ZAPISU = [
  ['provedene_prace', 'Popis a množství provedených prací, časový postup', 6],
  ['stav_staveniste', 'Stav staveniště', 2],
  ['dodavky', 'Dodávky materiálů, výrobků, strojů – uskladnění, zabudování', 3],
  ['mechanizace', 'Nasazení mechanizace', 2],
  ['opatreni', 'Opatření proti prašnosti, přístupnost, BOZP', 2],
  ['dalsi_zaznamy', 'Další záznamy (kontroly, zkoušky, zakrývání prací, změny, překážky, poddodavatelé)', 3],
];

function blokPocasi(p, upravit) {
  if (!p) return `<div class="tlumene">Počasí není k dispozici.</div>`;
  return `<div class="pocasi">
    <div class="ikona">${ikonaPocasi(p)}</div>
    <div>
      <strong>${esc(p.shrnuti)}</strong>
      <div class="pocasi-hodnoty">
        <span>7 h <b>${cz(p.teploty?.[7])} °C</b></span><span>12 h <b>${cz(p.teploty?.[12])} °C</b></span><span>17 h <b>${cz(p.teploty?.[17])} °C</b></span>
        <span>min/max <b>${cz(p.tmin)} / ${cz(p.tmax)} °C</b></span>
        <span>srážky <b>${cz(p.srazky_den)} mm</b></span>
        ${p.vlhkost != null ? `<span>vlhkost <b>${cz(p.vlhkost)} %</b></span>` : ''}
      </div>
      <div class="napoveda">${esc(p.zdroj_text)}${p.data_do && p.datum === dnes() ? ` · data do ${p.data_do}` : ''}</div>
    </div></div>
    ${upravit ? `<label for="pocasiText">Počasí – text do deníku <span class="tlumene">(lze upravit)</span></label><input type="text" id="pocasiText" value="${esc(p.shrnuti)}">` : ''}`;
}

async function editorZapisu(id) {
  let z = await api(`/zapisy/${id}`);
  const s = await api(`/stavby/${z.stavba_id}`);
  const zamceno = z.stav === 'uzavren';
  drobky(['Stavby', '#/'], [s.nazev, `#/stavba/${s.id}`], [z.cislo ? `Záznam č. ${z.cislo}` : 'Koncept']);

  $app.innerHTML = `
    <div class="hlavicka">
      <div>
        <h1>${z.cislo ? `Denní záznam č. ${z.cislo}` : 'Koncept denního záznamu'}</h1>
        <div class="tlumene">${datumCz(z.datum, true)} · <span class="stitek ${z.stav}">${zamceno ? 'uzavřeno ' + new Date(z.uzavreno).toLocaleString('cs-CZ') : 'koncept – lze upravovat'}</span></div>
      </div>
      ${zamceno ? '' : `<div class="akce"><button id="btnPregen" type="button">↻ ${INFO.ai ? 'Přegenerovat z fotek' : 'Převzít z popisku'}</button></div>`}
    </div>
    ${z.upozorneni && !zamceno ? `<div class="upozorneni" style="margin-bottom:1rem"><strong>Zkontrolujte:</strong> ${esc(z.upozorneni)}</div>` : ''}
    ${zamceno ? `<div class="info" style="margin-bottom:1rem">Uzavřený záznam už nelze měnit (zásada stavebního deníku – nic se nepřepisuje ani nemaže). Opravu nebo doplnění zapište do nového záznamu.</div>` : ''}
    <form id="f">
      <fieldset><legend>Počasí a klimatické podmínky</legend>
        <div id="pocasi">${blokPocasi(z.pocasi, !zamceno)}</div>
        ${zamceno ? '' : `<button type="button" id="btnPocasi" style="margin-top:.6rem">↻ Načíst počasí znovu</button>`}
      </fieldset>
      <fieldset><legend>Pracovníci na staveništi</legend>
        ${zamceno ? `<div class="cteni">${nl(z.pracovnici || '—')}</div>` : `<textarea name="pracovnici" rows="3" placeholder="Jméno a příjmení – profese, jedna osoba na řádek">${esc(z.pracovnici ?? '')}</textarea>`}
      </fieldset>
      <fieldset><legend>Zápis</legend>
        ${!zamceno && z.popisek ? `<div class="napoveda" style="margin-top:.6rem">Váš popisek: „${esc(z.popisek)}“</div>` : ''}
        ${POLE_ZAPISU.map(([k, n, r]) => `<label for="${k}">${n}</label>` + (zamceno
          ? `<div class="cteni">${nl(z[k] || '—')}</div>`
          : `<textarea id="${k}" name="${k}" rows="${r}">${esc(z[k] ?? '')}</textarea>`)).join('')}
        <label for="zapsal">Zapsal (jméno, funkce)</label>
        ${zamceno ? `<div>${esc(z.zapsal || '—')}</div>` : `<input type="text" id="zapsal" name="zapsal" value="${esc(z.zapsal ?? '')}">`}
      </fieldset>
      <fieldset><legend>Fotodokumentace</legend>
        <div class="fotky" id="fotky"></div>
        <input type="file" id="soubory" accept="image/*" multiple hidden>
      </fieldset>
      ${zamceno ? `<div class="spodni-lista"><a class="tlacitko" href="#/stavba/${s.id}">Zpět na stavbu</a><a class="tlacitko primarni" href="#/stavba/${s.id}/tisk">🖨 Tisk</a></div>` : `
      <div class="spodni-lista">
        <button type="button" class="nebezpecne" id="btnSmazat">Smazat koncept</button>
        <button type="submit">Uložit koncept</button>
        <button type="button" class="uspech" id="btnUzavrit">✓ Uzavřít záznam</button>
      </div>`}
    </form>`;

  const f = document.getElementById('f');
  const $f = document.getElementById('fotky');
  const kresliFotky = () => {
    $f.innerHTML = z.fotky.map((x, i) => `<div class="fotka"><span class="cislo">${i + 1}</span>
      ${zamceno ? '' : `<button type="button" class="smazat" data-id="${x.id}" aria-label="Smazat fotku">✕</button>`}
      <a href="${x.url}" target="_blank"><img src="${x.url}" alt="" loading="lazy"></a>
      ${zamceno ? `<div class="male" style="padding:.4rem .5rem">${esc(x.popisek || '')}</div>` : `<textarea data-foto="${x.id}" placeholder="Popisek fotky">${esc(x.popisek ?? '')}</textarea>`}
    </div>`).join('') + (zamceno ? '' : `<label class="pridat-foto" for="soubory">${IKONA_FOTO}<span>Přidat fotky</span></label>`);
    if (zamceno && !z.fotky.length) $f.innerHTML = '<div class="tlumene">Bez fotek.</div>';
  };
  kresliFotky();
  if (zamceno) return;

  const sbirej = () => {
    const d = Object.fromEntries(new FormData(f));
    const pt = document.getElementById('pocasiText');
    if (z.pocasi && pt) d.pocasi = { ...z.pocasi, shrnuti: pt.value };
    return d;
  };
  const ulozPopiskyFotek = () => Promise.all([...$f.querySelectorAll('textarea[data-foto]')].map((t) => {
    const puv = z.fotky.find((x) => x.id == t.dataset.foto)?.popisek ?? '';
    return t.value !== puv ? api(`/fotky/${t.dataset.foto}`, { metoda: 'PUT', data: { popisek: t.value } }) : null;
  }));
  const uloz = async () => { await ulozPopiskyFotek(); z = await api(`/zapisy/${id}`, { metoda: 'PUT', data: sbirej() }); };

  document.getElementById('soubory').onchange = async (e) => {
    await uloz();
    for (const soubor of e.target.files) {
      try { z = await api(`/zapisy/${id}/fotky`, { metoda: 'POST', data: { data: await zmensiFotku(soubor), porizeno: new Date(soubor.lastModified).toISOString() } }); }
      catch (err) { toast(err.message, true); }
    }
    e.target.value = ''; kresliFotky();
  };
  $f.onclick = async (e) => {
    const b = e.target.closest('.smazat'); if (!b) return;
    if (!confirm('Smazat fotku?')) return;
    await api(`/fotky/${b.dataset.id}`, { metoda: 'DELETE' });
    z = await api(`/zapisy/${id}`); kresliFotky();
  };

  f.onsubmit = async (e) => {
    e.preventDefault();
    await prubeh(f.querySelector('[type=submit]'), 'Ukládám', uloz);
    toast('Koncept uložen');
  };
  document.getElementById('btnPocasi').onclick = async (e) => {
    await prubeh(e.currentTarget, 'Načítám', async () => { await uloz(); z = await api(`/zapisy/${id}/pocasi`, { metoda: 'POST' }); });
    document.getElementById('pocasi').innerHTML = blokPocasi(z.pocasi, true);
  };
  document.getElementById('btnPregen').onclick = async (e) => {
    if (!confirm('Přepsat textová pole nově vygenerovaným zápisem?')) return;
    await prubeh(e.currentTarget, 'Generuji', async () => { await uloz(); await api(`/zapisy/${id}/generovat`, { metoda: 'POST' }); });
    editorZapisu(id);
  };
  document.getElementById('btnSmazat').onclick = async () => {
    if (!confirm('Opravdu smazat tento koncept včetně fotek?')) return;
    await api(`/zapisy/${id}`, { metoda: 'DELETE' });
    location.hash = `#/stavba/${s.id}`;
  };
  document.getElementById('btnUzavrit').onclick = async (e) => {
    if (!confirm('Uzavřít záznam?\n\nDostane pořadové číslo a už nepůjde měnit – jako zápis perem do papírového deníku.')) return;
    await prubeh(e.currentTarget, 'Uzavírám', async () => { await uloz(); await api(`/zapisy/${id}/uzavrit`, { metoda: 'POST' }); });
    toast('Záznam uzavřen');
    editorZapisu(id);
  };
}

// --- tisk -------------------------------------------------------------------
async function tiskDeniku(stavbaId) {
  const [s, zapisy] = await Promise.all([api(`/stavby/${stavbaId}`), api(`/stavby/${stavbaId}/zapisy`)]);
  drobky(['Stavby', '#/'], [s.nazev, `#/stavba/${stavbaId}`], ['Tisk']);
  const prvni = zapisy[0]?.datum || dnes(), posledni = zapisy.at(-1)?.datum || dnes();
  $app.innerHTML = `
    <div class="netisknout">
      <h1>Tisk ${s.typ_evidence === 'zaznam' ? 'jednoduchého záznamu o stavbě' : 'stavebního deníku'}</h1>
      <p class="tlumene">Nastavte rozsah a vytiskněte (nebo uložte jako PDF). Formát A4 na výšku, okraje „Výchozí“, zapněte „Grafika na pozadí“.</p>
      <div class="karta">
        <div class="tisk-volby">
          <div><label for="od">Od</label><input type="date" id="od" value="${prvni}"></div>
          <div><label for="do">Do</label><input type="date" id="do" value="${posledni}"></div>
          <div><label for="vytisk">Výtisk</label><select id="vytisk"><option>Originál</option><option>1. kopie</option><option>2. kopie</option><option value="">bez označení</option></select></div>
          <label class="zaskrt"><input type="checkbox" id="uvod" checked> Titulní list a identifikační údaje</label>
          <label class="zaskrt"><input type="checkbox" id="foto" checked> Fotodokumentace</label>
          <label class="zaskrt"><input type="checkbox" id="koncepty"> Včetně neuzavřených konceptů</label>
        </div>
        <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="primarni velke" id="btnTisk">🖨 Tisknout</button>
          <a class="tlacitko" href="#/stavba/${stavbaId}">Zpět</a>
        </div>
      </div>
      <h2>Náhled</h2>
    </div>
    <div id="dokument" class="dokument"></div>`;

  const ids = ['od', 'do', 'vytisk', 'uvod', 'foto', 'koncepty'];
  const prekresli = () => {
    const v = Object.fromEntries(ids.map((i) => { const el = document.getElementById(i); return [i, el.type === 'checkbox' ? el.checked : el.value]; }));
    const vybrane = zapisy.filter((z) => z.datum >= v.od && z.datum <= v.do && (v.koncepty || z.stav === 'uzavren'));
    document.getElementById('dokument').innerHTML = sestavDokument(s, vybrane, v);
    let st = document.getElementById('tiskStyl');
    if (!st) { st = document.createElement('style'); st.id = 'tiskStyl'; document.head.append(st); }
    const q = (x) => JSON.stringify(String(x ?? ''));
    st.textContent = `@page { @top-left { content: ${q((s.typ_evidence === 'zaznam' ? 'Jednoduchý záznam o stavbě' : 'Stavební deník') + ' – ' + s.nazev)}; }
      @top-right { content: ${q(v.vytisk)}; } }`;
  };
  ids.forEach((i) => document.getElementById(i).addEventListener('change', prekresli));
  prekresli();
  document.getElementById('btnTisk').onclick = () => window.print();
}

function sestavDokument(s, zapisy, v) {
  const nazevDoc = s.typ_evidence === 'zaznam' ? 'Jednoduchý záznam o stavbě' : 'Stavební deník';
  const radek = (n, x) => `<tr><th>${n}</th><td>${nl(x || '—')}</td></tr>`;
  const osoby = [
    ['Stavbyvedoucí', s.stavbyvedouci], ['Technický dozor stavebníka', s.tds], ['Autorský dozor', s.ad],
    ...radky(s.opravnene_osoby).map((o) => ['Oprávněná osoba', o]),
  ].filter(([, x]) => x);
  const obdobi = zapisy.length ? `${datumCz(zapisy[0].datum)} – ${datumCz(zapisy.at(-1).datum)}` : '—';

  let html = '';
  if (v.uvod) {
    html += `
    <section class="list titulni">
      <div class="titulni-hlava">
        <div class="titulni-nazev">${nazevDoc.toUpperCase()}</div>
        ${v.vytisk ? `<div class="vytisk">${esc(v.vytisk)}</div>` : ''}
      </div>
      <table class="tabulka velka">
        ${radek('Stavba', s.nazev)}${radek('Místo stavby', s.misto)}${radek('Povolení stavby', s.povoleni)}
        ${radek('Stavebník', s.stavebnik)}${radek('Zhotovitel', s.zhotovitel)}${radek('Stavbyvedoucí', s.stavbyvedouci)}
        ${radek('Předání staveniště', datumCz(s.datum_predani))}${radek('Zahájení prací', datumCz(s.datum_zahajeni))}
        ${radek('Záznamy v tomto výtisku', `${obdobi} (${zapisy.length} ${zapisy.length === 1 ? 'záznam' : zapisy.length < 5 && zapisy.length ? 'záznamy' : 'záznamů'})`)}
      </table>
      <p class="pravni">Vedeno podle § 166 zákona č. 283/2021 Sb., stavební zákon, a přílohy č. 12 vyhlášky č. 131/2024 Sb., o dokumentaci staveb.
      Záznamy se zapisují nejpozději následující pracovní den. Uzavřené záznamy se nepřepisují; opravy se provádějí novým záznamem.
      Údaje o počasí: ČHMÚ – otevřená data automatických meteorologických stanic.</p>
    </section>
    <section class="list">
      <h2 class="cast">A. Identifikační údaje</h2>
      <table class="tabulka">
        ${radek('Název stavby', s.nazev)}${radek('Místo stavby', s.misto)}${radek('Povolení (č. j., datum)', s.povoleni)}
        ${radek('Stavebník', s.stavebnik)}${radek('Zhotovitel', s.zhotovitel)}${radek('Poddodavatelé', s.poddodavatele)}
        ${radek('Projektant', s.projektant)}${radek('Odborné vedení provádění stavby (stavbyvedoucí)', s.stavbyvedouci)}
        ${radek('Technický dozor stavebníka', s.tds)}${radek('Autorský dozor', s.ad)}
        ${radek('Projektová a technická dokumentace, změny', s.dokumentace)}${radek('Dokumenty a doklady ke stavbě', s.doklady)}
      </table>
      <h3 class="cast">Osoby oprávněné provádět záznamy – podpisové vzory</h3>
      <table class="tabulka podpisy">
        <thead><tr><th>Funkce</th><th>Jméno, oprávnění</th><th>Podpis</th><th>Razítko</th></tr></thead>
        <tbody>${(osoby.length ? osoby : [['', '']]).map(([f, x]) => `<tr><td>${esc(f)}</td><td>${nl(x)}</td><td></td><td></td></tr>`).join('')}
          <tr><td>&nbsp;</td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td></tr></tbody>
      </table>
      <p class="pravni">Osoby vykonávající vybrané činnosti ve výstavbě prokazují oprávnění otiskem razítka a podpisem (příloha č. 12 část A vyhl. č. 131/2024 Sb.). Změny těchto osob se zapisují do deníku.</p>
    </section>`;
  }

  if (!zapisy.length) html += `<section class="list"><p class="tlumene">V zadaném období nejsou žádné ${v.koncepty ? '' : 'uzavřené '}záznamy.</p></section>`;

  for (const z of zapisy) {
    const p = z.pocasi;
    const oznaceniFoto = (i) => `${z.cislo ?? 'K'}/${i + 1}`;
    html += `
    <section class="list zaznam">
      <table class="tabulka zahlavi-zaznamu">
        <tr><td class="cislo-zaznamu">${z.cislo ? `Denní záznam č. ${z.cislo}` : 'KONCEPT – neuzavřený záznam'}</td>
            <td class="datum-zaznamu">${datumCz(z.datum, true)}</td></tr>
      </table>
      <table class="tabulka pole">
        <tr><th>Počasí</th><td>
          ${p ? `${esc(p.shrnuti)}<br>
          <span class="mereni">Teplota: 7 h ${cz(p.teploty?.[7])} °C · 12 h ${cz(p.teploty?.[12])} °C · 17 h ${cz(p.teploty?.[17])} °C · min ${cz(p.tmin)} / max ${cz(p.tmax)} °C · srážky ${cz(p.srazky_den)} mm${p.vitr_narazy != null ? ` · nárazy větru ${cz(p.vitr_narazy)} m/s` : ''}</span>
          <span class="zdroj">Zdroj: ${esc(p.zdroj_text)}</span>` : '—'}</td></tr>
        <tr><th>Pracovníci na staveništi</th><td>${nl(radky(z.pracovnici).join(', ') || '—')}</td></tr>
        <tr><th>Stav staveniště</th><td>${nl(z.stav_staveniste || '—')}</td></tr>
        <tr><th>Provedené práce</th><td class="hlavni">${nl(z.provedene_prace || '—')}</td></tr>
        <tr><th>Dodávky</th><td>${nl(z.dodavky || '—')}</td></tr>
        <tr><th>Mechanizace</th><td>${nl(z.mechanizace || '—')}</td></tr>
        ${z.opatreni ? `<tr><th>Opatření</th><td>${nl(z.opatreni)}</td></tr>` : ''}
        ${z.dalsi_zaznamy ? `<tr><th>Další záznamy</th><td>${nl(z.dalsi_zaznamy)}</td></tr>` : ''}
        ${z.fotky.length ? `<tr><th>Fotodokumentace</th><td>foto č. ${oznaceniFoto(0)}${z.fotky.length > 1 ? ` až ${oznaceniFoto(z.fotky.length - 1)}` : ''} (${z.fotky.length} ks)${v.foto ? ' – viz příloha k záznamu' : ''}</td></tr>` : ''}
      </table>
      <table class="tabulka podpis-zaznamu">
        <tr><td>Zapsal: <b>${esc(z.zapsal || '')}</b>${z.uzavreno ? `<br><span class="zdroj">Uzavřeno ${new Date(z.uzavreno).toLocaleString('cs-CZ')}</span>` : ''}</td><td class="podpis-pole">Podpis:</td></tr>
      </table>
      <div class="vyjadreni">
        <div class="vyjadreni-nadpis">Vyjádření a záznamy technického dozoru stavebníka, autorského dozoru a dalších oprávněných osob <span>(datum, jméno, podpis; nevyužité místo proškrtněte)</span></div>
        <div class="vyjadreni-plocha"></div>
      </div>
    </section>`;
    if (v.foto && z.fotky.length) {
      for (let i = 0; i < z.fotky.length; i += 6) {
        html += `<section class="list fotopriloha">
          <div class="fotopriloha-hlava">Fotodokumentace k ${z.cislo ? `záznamu č. ${z.cislo}` : 'konceptu'} ze dne ${datumCz(z.datum)}${i ? ' (pokračování)' : ''}</div>
          <div class="fotomrizka">${z.fotky.slice(i, i + 6).map((f, j) => `
            <figure><img src="${f.url}" alt=""><figcaption><b>Foto ${oznaceniFoto(i + j)}</b> ${esc(f.popisek || '')}</figcaption></figure>`).join('')}</div>
        </section>`;
      }
    }
  }
  return html;
}
