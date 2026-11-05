// Stavební deník – generátor listů k tisku (statická stránka, nic se neukládá na server)
// V prohlížeči (localStorage) se pamatují jen údaje staveb, poslední čísla záznamů,
// krátká historie textů (pro návaznost a styl) a rozepsaný koncept. Fotky jen do vytištění.
import { generujZapis, VYCHOZI_MODEL } from './ai.js';
import { pocasiProDen, nejblizsiStanice } from './pocasi.js';

const $app = document.getElementById('app');
const $dok = document.getElementById('dokument');
const $drobky = document.getElementById('drobky');

// --- pomocné ------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = (s) => esc(s).replace(/\n/g, '<br>');
const cz = (x) => (x == null ? '–' : String(x).replace('.', ','));
const dnes = () => new Date().toLocaleDateString('sv-SE');
const DNY = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const datumCz = (d, sDnem = false) => {
  if (!d) return '';
  const x = new Date(d + 'T12:00:00');
  return (sDnem ? DNY[x.getDay()] + ' ' : '') + x.toLocaleDateString('cs-CZ');
};
const radky = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const HISTORIE = 6; // kolik posledních zápisů si pamatovat jako vzor

// --- úložiště v prohlížeči ----------------------------------------------------
const uloz = (k, v) => { try { localStorage.setItem('sd.' + k, JSON.stringify(v)); } catch (e) { toast('Nelze uložit do prohlížeče: ' + e.message, true); } };
const nacti = (k, vychozi) => { try { return JSON.parse(localStorage.getItem('sd.' + k)) ?? vychozi; } catch { return vychozi; } };
const nastaveni = () => nacti('nastaveni', {});
const stavby = () => nacti('stavby', []);
const aktivniStavba = () => stavby().find((s) => s.id === nacti('aktivni')) || stavby()[0] || null;
function ulozStavbu(s) {
  const vse = stavby();
  const i = vse.findIndex((x) => x.id === s.id);
  if (i >= 0) vse[i] = s; else vse.push(s);
  uloz('stavby', vse);
  uloz('aktivni', s.id);
}

// fotky aktuálního záznamu – jen v paměti, do vytištění
let fotky = []; // { data: dataURL, popisek }
window.addEventListener('beforeunload', (e) => { if (fotky.length) e.preventDefault(); });

let toastCas;
function toast(text, chyba = false) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.className = 'toast vidim' + (chyba ? ' chyba' : '');
  clearTimeout(toastCas);
  toastCas = setTimeout(() => (t.className = 'toast'), chyba ? 7000 : 3000);
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
  [/^#?\/?$/, () => zapis()],
  [/^#\/stavba$/, () => formularStavby(aktivniStavba())],
  [/^#\/stavba\/nova$/, () => formularStavby(null)],
  [/^#\/uvod$/, () => uvodniListy()],
  [/^#\/nastaveni$/, () => nastaveniStranka()],
];
async function route() {
  window.scrollTo(0, 0);
  $dok.innerHTML = '';
  for (const [re, fn] of routy) {
    if (re.test(location.hash)) {
      try { await fn(); } catch (e) { $app.innerHTML = `<div class="karta">Chyba: ${esc(e.message)}</div>`; }
      return;
    }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', route);
route();

function vyberStavby(s) {
  const vse = stavby();
  return `<div class="vyber-stavby">
    <select id="vyberStavby" aria-label="Stavba">${vse.map((x) => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${esc(x.nazev)}</option>`).join('')}
      <option value="__nova">+ Nová stavba…</option></select>
    <a class="tlacitko" href="#/stavba">Údaje stavby</a>
    <a class="tlacitko" href="#/uvod">Úvodní listy</a>
  </div>`;
}
function navazVyberStavby() {
  document.getElementById('vyberStavby').onchange = (e) => {
    if (e.target.value === '__nova') location.hash = '#/stavba/nova';
    else { uloz('aktivni', e.target.value); route(); }
  };
}

// --- hlavní stránka: nový list deníku ----------------------------------------
const POLE_ZAPISU = [
  ['provedene_prace', 'Popis a množství provedených prací, časový postup', 6],
  ['stav_staveniste', 'Stav staveniště', 2],
  ['dodavky', 'Dodávky materiálů, výrobků, strojů – uskladnění, zabudování', 3],
  ['mechanizace', 'Nasazení mechanizace', 2],
  ['opatreni', 'Opatření proti prašnosti, přístupnost, BOZP', 2],
  ['dalsi_zaznamy', 'Další záznamy (kontroly, zkoušky, zakrývání prací, změny, překážky, poddodavatelé)', 3],
];

function novyKoncept(s) {
  return {
    stavbaId: s.id, datum: dnes(), cislo: (s.posledniCislo || 0) + 1, popisek: '',
    pracovnici: radky(s.pracovnici).join('\n'), zapsal: s.zapsal || s.stavbyvedouci || '',
    vygenerovano: false, pocasi: null,
  };
}

async function zapis() {
  const s = aktivniStavba();
  if (!s) return uvitani();
  drobky([s.nazev]);
  let k = nacti('koncept');
  if (!k || k.stavbaId !== s.id) { k = novyKoncept(s); fotky = []; }
  const ulozK = () => uloz('koncept', k);
  const klic = nastaveni().klic;

  $app.innerHTML = `
    ${vyberStavby(s)}
    <div class="hlavicka">
      <div><h1>Nový list deníku</h1>
      <div class="tlumene">Fotky + pár slov → zápis podle přílohy č. 12 vyhl. 131/2024 Sb. → tisk do desek.</div></div>
    </div>
    ${klic ? '' : `<div class="upozorneni" style="margin-bottom:1rem">Pro psaní zápisů umělou inteligencí zadejte API klíč v <a href="#/nastaveni">Nastavení</a>. Bez něj se text převezme z vašeho popisku.</div>`}
    ${s.lat == null ? `<div class="upozorneni" style="margin-bottom:1rem">Stavba nemá polohu – počasí nelze načíst. <a href="#/stavba">Doplnit polohu</a></div>` : ''}
    <form id="vstup">
      <fieldset><legend>Den</legend>
        <div class="dva">
          <div><label for="datum">Datum</label><input type="date" id="datum" value="${k.datum}" max="${dnes()}" required></div>
          <div><label for="cislo">Číslo záznamu</label><input type="number" id="cislo" min="1" value="${k.cislo}" required>
            <div class="napoveda">${s.posledniCislo ? `Poslední vytištěný: č. ${s.posledniCislo}` : 'První záznam této stavby'}</div></div>
        </div>
      </fieldset>
      <fieldset><legend>Fotky ze stavby</legend>
        <div class="fotky" id="fotky"></div>
        <input type="file" id="soubory" accept="image/*" multiple hidden>
        <div class="napoveda">Fotky se nikam neukládají – zůstanou jen na této stránce do vytištění.</div>
      </fieldset>
      <fieldset><legend>Co se dnes dělalo</legend>
        <label for="popisek">Krátký popis <span class="tlumene">– stačí heslovitě</span></label>
        <textarea id="popisek" rows="4" placeholder="Např.: montáž obvodových stěn 1.NP osa A–C, přivezeno 12 m³ KVH, jeřáb 7–11, TDS převzal kotvení prahů">${esc(k.popisek)}</textarea>
      </fieldset>
      <fieldset><legend>Pracovníci na staveništi</legend>
        ${radky(s.pracovnici).length ? `<div class="pracovnici">${radky(s.pracovnici).map((p) => `<label><input type="checkbox" name="p" value="${esc(p)}" ${radky(k.pracovnici).includes(p) ? 'checked' : ''}> ${esc(p)}</label>`).join('')}</div>` : ''}
        <label for="dalsi">${radky(s.pracovnici).length ? 'Další osoby' : 'Jména a příjmení'} <span class="tlumene">– jedna na řádek</span></label>
        <textarea id="dalsi" rows="2" placeholder="Jan Novák – tesař">${esc(radky(k.pracovnici).filter((p) => !radky(s.pracovnici).includes(p)).join('\n'))}</textarea>
      </fieldset>
      <button class="primarni velke" type="submit" style="width:100%">${k.vygenerovano ? '↻ Napsat zápis znovu' : '✎ Napsat zápis'}</button>
    </form>
    <div id="editor"></div>`;

  // vstupní část
  const f = document.getElementById('vstup');
  const $f = document.getElementById('fotky'), $in = document.getElementById('soubory');
  const kresliFotky = () => {
    $f.innerHTML = fotky.map((x, i) => `<div class="fotka"><span class="cislo">${i + 1}</span>
        <button type="button" class="smazat" data-i="${i}" aria-label="Odebrat">✕</button><img src="${x.data}" alt="">
        ${k.vygenerovano ? `<textarea data-i="${i}" placeholder="Popisek fotky">${esc(x.popisek)}</textarea>` : ''}</div>`).join('') +
      `<label class="pridat-foto" for="soubory">${IKONA_FOTO}<span>Vyfotit / přidat fotky</span></label>`;
  };
  kresliFotky();
  $in.onchange = async () => {
    for (const soubor of $in.files) {
      try { fotky.push({ data: await zmensiFotku(soubor), popisek: '' }); }
      catch { toast(`Soubor ${soubor.name} nelze načíst`, true); }
    }
    $in.value = ''; kresliFotky();
  };
  $f.onclick = (e) => { const b = e.target.closest('.smazat'); if (b) { fotky.splice(+b.dataset.i, 1); kresliFotky(); } };
  $f.oninput = (e) => { if (e.target.dataset.i) fotky[+e.target.dataset.i].popisek = e.target.value; };
  const prectiVstup = () => {
    k.datum = f.datum.value; k.cislo = +f.cislo.value; k.popisek = f.popisek.value.trim();
    k.pracovnici = [...f.querySelectorAll('input[name=p]:checked')].map((x) => x.value).concat(radky(f.dalsi.value)).join('\n');
  };
  f.oninput = () => { prectiVstup(); ulozK(); };

  f.onsubmit = async (e) => {
    e.preventDefault();
    prectiVstup();
    if (!k.popisek && !fotky.length) return toast('Přidejte fotky nebo popis', true);
    if (k.vygenerovano && !confirm('Přepsat stávající text zápisu nově napsaným?')) return;
    const btn = f.querySelector('[type=submit]');
    await prubeh(btn, 'Načítám počasí', async () => {
      try { k.pocasi = await pocasiProDen({ lat: s.lat, lon: s.lon, datum: k.datum, wsi: s.stanice_wsi }); }
      catch (err) { k.pocasi = null; toast('Počasí: ' + err.message, true); }
      btn.innerHTML = `<span class="nacitani"></span> ${klic ? 'Píšu zápis podle fotek…' : 'Připravuji zápis'}`;
      const navrh = await generujZapis({
        klic, model: nastaveni().model, stavba: s, zapis: k, fotky,
        historie: (s.historie || []).filter((h) => h.cislo !== k.cislo).slice(0, HISTORIE),
      });
      for (const [pole] of POLE_ZAPISU) k[pole] = navrh[pole] ?? '';
      k.upozorneni = navrh.upozorneni;
      fotky.forEach((x, i) => { if (!x.popisek) x.popisek = navrh.popisky_fotek[i] || ''; });
      k.vygenerovano = true;
      ulozK();
    });
    zapis();
  };

  if (k.vygenerovano) editor(s, k, ulozK);
}

function blokPocasi(p) {
  if (!p) return `<div class="tlumene">Počasí není k dispozici – doplňte ho ručně.</div>`;
  return `<div class="pocasi">
    <div class="ikona">${ikonaPocasi(p)}</div>
    <div>
      <div class="pocasi-hodnoty">
        <span>7 h <b>${cz(p.teploty?.[7])} °C</b></span><span>12 h <b>${cz(p.teploty?.[12])} °C</b></span><span>17 h <b>${cz(p.teploty?.[17])} °C</b></span>
        <span>min/max <b>${cz(p.tmin)} / ${cz(p.tmax)} °C</b></span>
        <span>srážky <b>${cz(p.srazky_den)} mm</b></span>
        ${p.vlhkost != null ? `<span>vlhkost <b>${cz(p.vlhkost)} %</b></span>` : ''}
      </div>
      <div class="napoveda">${esc(p.zdroj_text)}${p.data_do && p.datum === dnes() ? ` · měření do ${p.data_do}` : ''}</div>
    </div></div>`;
}

function editor(s, k, ulozK) {
  const $e = document.getElementById('editor');
  $e.innerHTML = `
    <h2>Zápis č. ${k.cislo} – ${datumCz(k.datum, true)}</h2>
    ${k.upozorneni ? `<div class="upozorneni" style="margin-bottom:1rem"><strong>Zkontrolujte:</strong> ${esc(k.upozorneni)}</div>` : ''}
    <form id="text">
      <fieldset><legend>Počasí a klimatické podmínky</legend>
        ${blokPocasi(k.pocasi)}
        <label for="pocasiText">Počasí – text do deníku</label>
        <input type="text" id="pocasiText" value="${esc(k.pocasi?.shrnuti ?? '')}" placeholder="např. Polojasno, bez srážek, slabý vítr">
      </fieldset>
      <fieldset><legend>Zápis</legend>
        ${POLE_ZAPISU.map(([p, n, r]) => `<label for="${p}">${n}</label><textarea id="${p}" name="${p}" rows="${r}">${esc(k[p] ?? '')}</textarea>`).join('')}
        <label for="zapsal">Zapsal (jméno, funkce)</label>
        <input type="text" id="zapsal" name="zapsal" value="${esc(k.zapsal ?? '')}">
      </fieldset>
    </form>
    <div class="spodni-lista">
      <button type="button" class="nebezpecne" id="btnZahodit">Zahodit</button>
      <button type="button" class="primarni velke" id="btnTisk">🖨 Náhled a tisk</button>
    </div>`;

  const t = document.getElementById('text');
  t.oninput = () => {
    for (const [p] of POLE_ZAPISU) k[p] = t[p].value;
    k.zapsal = t.zapsal.value;
    const pt = document.getElementById('pocasiText').value;
    if (k.pocasi) k.pocasi.shrnuti = pt; else k.pocasi = pt ? { shrnuti: pt, zdroj_text: 'zadáno ručně' } : null;
    ulozK();
  };
  document.getElementById('btnZahodit').onclick = () => {
    if (!confirm('Zahodit rozepsaný zápis i fotky?')) return;
    localStorage.removeItem('sd.koncept'); fotky = []; zapis();
  };
  document.getElementById('btnTisk').onclick = () => {
    if (/\[doplnit/i.test(POLE_ZAPISU.map(([p]) => k[p]).join(' ')) && !confirm('V zápisu zůstalo „[doplnit]“. Přesto tisknout?')) return;
    $dok.innerHTML = listZaznamu(s, k, fotky);
    nastavZahlaviTisku(s);
    $dok.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => window.print(), 300);
    window.addEventListener('afterprint', () => {
      if (!confirm(`Byl zápis č. ${k.cislo} vytištěn v pořádku?\n\nOK = uložit číslo ${k.cislo} jako poslední a začít nový list.\nZrušit = ponechat rozepsané.`)) return;
      const st = aktivniStavba();
      st.posledniCislo = Math.max(st.posledniCislo || 0, k.cislo);
      st.zapsal = k.zapsal;
      st.historie = [{ cislo: k.cislo, datum: k.datum, provedene_prace: k.provedene_prace }, ...(st.historie || []).filter((h) => h.cislo !== k.cislo)].slice(0, HISTORIE);
      ulozStavbu(st);
      localStorage.removeItem('sd.koncept'); fotky = [];
      toast(`Zápis č. ${k.cislo} uložen jako poslední`);
      zapis();
    }, { once: true });
  };
}

function uvitani() {
  drobky();
  $app.innerHTML = `<div class="karta prazdne">
    <h1>Stavební deník</h1>
    <p>Generátor listů stavebního deníku pro dřevostavby.<br>Nafotíte, napíšete pár slov, vytisknete a založíte do desek.</p>
    <a class="tlacitko primarni velke" href="#/stavba/nova">Založit první stavbu</a>
    <p class="male" style="margin-top:1.5rem">Máte zálohu z jiného zařízení? <a href="#/nastaveni">Načíst v Nastavení</a></p>
  </div>`;
}

// --- údaje stavby -------------------------------------------------------------
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
    ['posledniCislo', 'Poslední vytištěný záznam č.', 'další list dostane číslo o jedna vyšší', 'number'],
  ]],
];

async function formularStavby(puvodni) {
  const s = puvodni ? { ...puvodni } : { id: crypto.randomUUID(), typ_evidence: 'denik' };
  drobky(...(puvodni ? [[s.nazev, '#/'], ['Údaje stavby']] : [['Nová stavba']]));
  const pole = ([k, n, nap, typ]) => {
    const v = esc(s[k] ?? '');
    if (typ === 'typ') return `<label for="${k}">${n}</label>
      <select id="${k}" name="${k}">
        <option value="denik" ${s[k] !== 'zaznam' ? 'selected' : ''}>Stavební deník (stavba vyžaduje povolení)</option>
        <option value="zaznam" ${s[k] === 'zaznam' ? 'selected' : ''}>Jednoduchý záznam o stavbě</option>
      </select>`;
    const vstup = typ === 'textarea'
      ? `<textarea id="${k}" name="${k}" rows="3">${v}</textarea>`
      : `<input id="${k}" name="${k}" type="${typ}" value="${v}" ${k === 'nazev' ? 'required' : ''} ${typ === 'number' ? 'min="0"' : ''}>`;
    return `<label for="${k}">${n}</label>${vstup}${nap ? `<div class="napoveda">${nap}</div>` : ''}`;
  };
  $app.innerHTML = `
    <h1>${puvodni ? 'Identifikační údaje stavby' : 'Nová stavba'}</h1>
    <p class="tlumene">Údaje odpovídají části A stavebního deníku (příloha č. 12 vyhl. č. 131/2024 Sb.) a vytisknou se na úvodní listy. Ukládají se jen v tomto prohlížeči.</p>
    <form id="f">
      ${POLE_STAVBY.map(([nadpis, p]) => `<fieldset><legend>${nadpis}</legend>${p.map(pole).join('')}
        ${nadpis === 'Základní údaje' ? `
          <label for="hledat">Poloha stavby pro počasí <span class="tlumene">– najde nejbližší meteostanici ČHMÚ</span></label>
          <div style="display:flex;gap:.5rem"><input type="search" id="hledat" placeholder="Hledat adresu nebo obec…" value="${esc(s.misto ?? '')}"><button type="button" id="btnHledat">Najít</button></div>
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
        ${puvodni ? `<button type="button" class="nebezpecne" id="btnSmazat">Smazat stavbu</button>` : ''}
        <a class="tlacitko" href="#/">Zpět</a>
        <button class="primarni velke" type="submit">Uložit</button>
      </div>
    </form>`;

  const f = document.getElementById('f');
  const $lat = f.lat, $lon = f.lon, $st = f.stanice_wsi;
  async function nactiStanice() {
    if (!$lat.value || !$lon.value) return;
    try {
      const st = await nejblizsiStanice(+$lat.value, +$lon.value);
      $st.innerHTML = `<option value="">Automaticky nejbližší (${esc(st[0]?.nazev)}, ${cz(st[0]?.km)} km)</option>` +
        st.map((x) => `<option value="${x.wsi}" ${x.wsi === s.stanice_wsi ? 'selected' : ''}>${esc(x.nazev)} – ${cz(x.km)} km, ${x.vyska} m n. m.</option>`).join('');
      document.getElementById('staniceInfo').textContent = 'Data: ČHMÚ – otevřená data automatických stanic, 10minutová měření. Když stanice daný den neměří, použije se další nejbližší.';
    } catch (e) { document.getElementById('staniceInfo').textContent = 'Seznam stanic zatím není k dispozici (archiv počasí se teprve plní).'; }
  }
  nactiStanice();
  $lat.addEventListener('change', nactiStanice); $lon.addEventListener('change', nactiStanice);

  async function hledej() {
    const q = document.getElementById('hledat').value.trim();
    if (!q) return;
    const $v = document.getElementById('vysledky');
    const vys = await prubeh(document.getElementById('btnHledat'), 'Hledám', async () => {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=cz,sk&accept-language=cs&q=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error('Vyhledání adresy selhalo');
      return (await r.json()).map((x) => ({ nazev: x.display_name, lat: +x.lat, lon: +x.lon }));
    });
    $v.hidden = false;
    $v.innerHTML = vys.length ? vys.map((x, i) => `<li><button type="button" data-i="${i}">${esc(x.nazev)}</button></li>`).join('') : '<li class="tlumene" style="padding:.6rem">Nic nenalezeno – zkuste obec, nebo zadejte souřadnice ručně (např. z mapy.cz).</li>';
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

  document.getElementById('btnSmazat')?.addEventListener('click', () => {
    if (!confirm(`Smazat stavbu „${s.nazev}“ z tohoto prohlížeče?\n\nVytištěné listy tím nijak neovlivníte.`)) return;
    uloz('stavby', stavby().filter((x) => x.id !== s.id));
    localStorage.removeItem('sd.aktivni'); localStorage.removeItem('sd.koncept');
    location.hash = '#/';
  });

  f.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    data.lat = data.lat ? +data.lat : null; data.lon = data.lon ? +data.lon : null;
    data.posledniCislo = data.posledniCislo ? +data.posledniCislo : 0;
    ulozStavbu({ ...s, ...data });
    const k = nacti('koncept');
    if (k?.stavbaId === s.id && !k.vygenerovano) localStorage.removeItem('sd.koncept'); // přečísluje se podle nových údajů
    toast('Stavba uložena');
    location.hash = '#/';
  };
}

// --- nastavení ----------------------------------------------------------------
function nastaveniStranka() {
  drobky(['Nastavení']);
  const n = nastaveni();
  $app.innerHTML = `
    <h1>Nastavení</h1>
    <form id="f">
      <fieldset><legend>Psaní zápisů (Claude)</legend>
        <label for="klic">API klíč Anthropic</label>
        <input type="password" id="klic" autocomplete="off" value="${esc(n.klic ?? '')}" placeholder="sk-ant-…">
        <div class="napoveda">Klíč získáte na console.anthropic.com → API Keys. Uloží se jen v tomto prohlížeči a posílá se jen přímo do Anthropic. Na každém zařízení (mobil, počítač) ho zadejte zvlášť.</div>
        <label for="model">Model</label>
        <select id="model">
          <option value="${VYCHOZI_MODEL}" ${!n.model || n.model === VYCHOZI_MODEL ? 'selected' : ''}>Claude Opus 5.5 – nejlepší zápisy</option>
          <option value="claude-sonnet-5-5" ${n.model === 'claude-sonnet-5-5' ? 'selected' : ''}>Claude Sonnet 5.5 – zhruba poloviční cena</option>
        </select>
      </fieldset>
      <button class="primarni velke" type="submit">Uložit nastavení</button>
    </form>
    <fieldset><legend>Přenos mezi zařízeními</legend>
      <p class="male">Údaje staveb, čísla záznamů a historie se pamatují jen v tomto prohlížeči. Pro přenos na jiné zařízení nebo zálohu je stáhněte do souboru (bez API klíče) a na druhém zařízení načtěte.</p>
      <div class="akce">
        <button type="button" id="btnExport">⬇ Stáhnout zálohu staveb</button>
        <label class="tlacitko" for="soubor" style="margin:0">⬆ Načíst zálohu</label>
        <input type="file" id="soubor" accept="application/json,.json" hidden>
      </div>
    </fieldset>`;
  document.getElementById('f').onsubmit = (e) => {
    e.preventDefault();
    uloz('nastaveni', { klic: document.getElementById('klic').value.trim(), model: document.getElementById('model').value });
    toast('Nastavení uloženo');
    location.hash = '#/';
  };
  document.getElementById('btnExport').onclick = () => {
    const blob = new Blob([JSON.stringify({ verze: 1, stavby: stavby() }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `stavebni-denik-zaloha-${dnes()}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  document.getElementById('soubor').onchange = async (e) => {
    try {
      const j = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(j.stavby)) throw new Error('Soubor není záloha stavebního deníku');
      const vse = stavby();
      for (const s of j.stavby) { const i = vse.findIndex((x) => x.id === s.id); if (i >= 0) vse[i] = s; else vse.push(s); }
      uloz('stavby', vse);
      toast(`Načteno staveb: ${j.stavby.length}`);
      location.hash = '#/';
    } catch (err) { toast(err.message, true); }
  };
}

// --- tisk ---------------------------------------------------------------------
function nastavZahlaviTisku(s) {
  let st = document.getElementById('tiskStyl');
  if (!st) { st = document.createElement('style'); st.id = 'tiskStyl'; document.head.append(st); }
  const nazev = (s.typ_evidence === 'zaznam' ? 'Jednoduchý záznam o stavbě' : 'Stavební deník') + ' – ' + s.nazev;
  st.textContent = `@page { @top-left { content: ${JSON.stringify(nazev)}; } }`;
}

function uvodniListy() {
  const s = aktivniStavba();
  if (!s) return uvitani();
  drobky([s.nazev, '#/'], ['Úvodní listy']);
  $app.innerHTML = `
    <h1>Úvodní listy deníku</h1>
    <p class="tlumene">Titulní list a identifikační údaje (část A) s podpisovými vzory. Vytiskněte jednou na začátku stavby a při změně osob.</p>
    <div class="akce"><button class="primarni velke" id="btnTisk">🖨 Tisknout</button><a class="tlacitko" href="#/stavba">Upravit údaje</a><a class="tlacitko" href="#/">Zpět</a></div>
    <h2>Náhled</h2>`;
  $dok.innerHTML = uvod(s);
  nastavZahlaviTisku(s);
  document.getElementById('btnTisk').onclick = () => window.print();
}

const radekT = (n, x) => `<tr><th>${n}</th><td>${nl(x || '—')}</td></tr>`;

function uvod(s) {
  const nazevDoc = s.typ_evidence === 'zaznam' ? 'Jednoduchý záznam o stavbě' : 'Stavební deník';
  const osoby = [
    ['Stavbyvedoucí', s.stavbyvedouci], ['Technický dozor stavebníka', s.tds], ['Autorský dozor', s.ad],
    ...radky(s.opravnene_osoby).map((o) => ['Oprávněná osoba', o]),
  ].filter(([, x]) => x);
  return `
    <section class="list titulni">
      <div class="titulni-hlava"><div class="titulni-nazev">${nazevDoc.toUpperCase()}</div></div>
      <table class="tabulka velka">
        ${radekT('Stavba', s.nazev)}${radekT('Místo stavby', s.misto)}${radekT('Povolení stavby', s.povoleni)}
        ${radekT('Stavebník', s.stavebnik)}${radekT('Zhotovitel', s.zhotovitel)}${radekT('Stavbyvedoucí', s.stavbyvedouci)}
        ${radekT('Předání staveniště', datumCz(s.datum_predani))}${radekT('Zahájení prací', datumCz(s.datum_zahajeni))}
        ${radekT('Ukončení deníku', '')}
      </table>
      <p class="pravni">Vedeno podle § 166 zákona č. 283/2021 Sb., stavební zákon, a přílohy č. 12 vyhlášky č. 131/2024 Sb., o dokumentaci staveb.
      Záznamy se zapisují nejpozději následující pracovní den. Listy jsou číslovány pořadovým číslem záznamu; zápisy se nepřepisují, opravy se provádějí novým záznamem.
      Údaje o počasí: ČHMÚ – otevřená data automatických meteorologických stanic.</p>
    </section>
    <section class="list">
      <h2 class="cast">A. Identifikační údaje</h2>
      <table class="tabulka">
        ${radekT('Název stavby', s.nazev)}${radekT('Místo stavby', s.misto)}${radekT('Povolení (č. j., datum)', s.povoleni)}
        ${radekT('Stavebník', s.stavebnik)}${radekT('Zhotovitel', s.zhotovitel)}${radekT('Poddodavatelé', s.poddodavatele)}
        ${radekT('Projektant', s.projektant)}${radekT('Odborné vedení provádění stavby (stavbyvedoucí)', s.stavbyvedouci)}
        ${radekT('Technický dozor stavebníka', s.tds)}${radekT('Autorský dozor', s.ad)}
        ${radekT('Projektová a technická dokumentace, změny', s.dokumentace)}${radekT('Dokumenty a doklady ke stavbě', s.doklady)}
      </table>
      <h3 class="cast">Osoby oprávněné provádět záznamy – podpisové vzory</h3>
      <table class="tabulka podpisy">
        <thead><tr><th>Funkce</th><th>Jméno, oprávnění</th><th>Podpis</th><th>Razítko</th></tr></thead>
        <tbody>${osoby.map(([f, x]) => `<tr><td>${esc(f)}</td><td>${nl(x)}</td><td></td><td></td></tr>`).join('')}
          <tr><td>&nbsp;</td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td></tr></tbody>
      </table>
      <p class="pravni">Osoby vykonávající vybrané činnosti ve výstavbě prokazují oprávnění otiskem razítka a podpisem (příloha č. 12 část A vyhl. č. 131/2024 Sb.). Změny těchto osob se zapisují do deníku.</p>
    </section>`;
}

function listZaznamu(s, z, fotky) {
  const p = z.pocasi;
  const oznaceni = (i) => `${z.cislo}/${i + 1}`;
  let html = `
    <section class="list zaznam">
      <table class="tabulka zahlavi-zaznamu">
        <tr><td class="cislo-zaznamu">Denní záznam č. ${z.cislo}</td><td class="datum-zaznamu">${datumCz(z.datum, true)}</td></tr>
      </table>
      <table class="tabulka pole">
        <tr><th>Počasí</th><td>
          ${p ? `${esc(p.shrnuti)}
          ${p.teploty ? `<br><span class="mereni">Teplota: 7 h ${cz(p.teploty[7])} °C · 12 h ${cz(p.teploty[12])} °C · 17 h ${cz(p.teploty[17])} °C · min ${cz(p.tmin)} / max ${cz(p.tmax)} °C · srážky ${cz(p.srazky_den)} mm${p.vitr_narazy != null ? ` · nárazy větru ${cz(p.vitr_narazy)} m/s` : ''}</span>` : ''}
          <span class="zdroj">Zdroj: ${esc(p.zdroj_text)}</span>` : '—'}</td></tr>
        <tr><th>Pracovníci na staveništi</th><td>${nl(radky(z.pracovnici).join(', ') || '—')}</td></tr>
        <tr><th>Stav staveniště</th><td>${nl(z.stav_staveniste || '—')}</td></tr>
        <tr><th>Provedené práce</th><td class="hlavni">${nl(z.provedene_prace || '—')}</td></tr>
        <tr><th>Dodávky</th><td>${nl(z.dodavky || '—')}</td></tr>
        <tr><th>Mechanizace</th><td>${nl(z.mechanizace || '—')}</td></tr>
        ${z.opatreni ? `<tr><th>Opatření</th><td>${nl(z.opatreni)}</td></tr>` : ''}
        ${z.dalsi_zaznamy ? `<tr><th>Další záznamy</th><td>${nl(z.dalsi_zaznamy)}</td></tr>` : ''}
        ${fotky.length ? `<tr><th>Fotodokumentace</th><td>foto č. ${oznaceni(0)}${fotky.length > 1 ? ` až ${oznaceni(fotky.length - 1)}` : ''} (${fotky.length} ks) – viz příloha k záznamu</td></tr>` : ''}
      </table>
      <table class="tabulka podpis-zaznamu">
        <tr><td>Zapsal: <b>${esc(z.zapsal || '')}</b></td><td class="podpis-pole">Datum a podpis:</td></tr>
      </table>
      <div class="vyjadreni">
        <div class="vyjadreni-nadpis">Vyjádření a záznamy technického dozoru stavebníka, autorského dozoru a dalších oprávněných osob <span>(datum, jméno, podpis; nevyužité místo proškrtněte)</span></div>
        <div class="vyjadreni-plocha"></div>
      </div>
    </section>`;
  for (let i = 0; i < fotky.length; i += 6) {
    html += `<section class="list fotopriloha">
      <div class="fotopriloha-hlava">Fotodokumentace k záznamu č. ${z.cislo} ze dne ${datumCz(z.datum)}${i ? ' (pokračování)' : ''}</div>
      <div class="fotomrizka">${fotky.slice(i, i + 6).map((f, j) => `
        <figure><img src="${f.data}" alt=""><figcaption><b>Foto ${oznaceni(i + j)}</b> ${esc(f.popisek || '')}</figcaption></figure>`).join('')}</div>
    </section>`;
  }
  return html;
}
