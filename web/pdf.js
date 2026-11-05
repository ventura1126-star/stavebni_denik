// PDF listů stavebního deníku (pdfmake, generuje se přímo v prohlížeči)
const PDFMAKE = 'https://cdn.jsdelivr.net/npm/pdfmake@0.3.12/build';

let nacitani;
function nactiPdfmake() {
  const skript = (src) => new Promise((ok, chyba) => {
    const s = Object.assign(document.createElement('script'), { src, onload: ok, onerror: () => chyba(new Error('Nelze načíst knihovnu pro PDF – zkontrolujte připojení')) });
    document.head.append(s);
  });
  return (nacitani ||= skript(`${PDFMAKE}/pdfmake.min.js`).then(() => skript(`${PDFMAKE}/vfs_fonts.js`)).then(() => window.pdfMake)
    .catch((e) => { nacitani = null; throw e; }));
}

const cz = (x) => (x == null ? '–' : String(x).replace('.', ','));
const DNY = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const datumCz = (d, sDnem = false) => {
  if (!d) return '';
  const x = new Date(d + 'T12:00:00');
  return (sDnem ? DNY[x.getDay()] + ' ' : '') + x.toLocaleDateString('cs-CZ');
};
const radky = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const nazevDeniku = (s) => (s.typ_evidence === 'zaznam' ? 'Jednoduchý záznam o stavbě' : 'Stavební deník');

const SEDA = '#f0f0f0';
const tabulka = (radkyTabulky, sirky = [130, '*'], { stitky = sirky.length === 2 && sirky[0] === 130 } = {}) => ({
  table: { widths: sirky, body: radkyTabulky, dontBreakRows: true },
  layout: {
    hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#333', vLineColor: () => '#333',
    paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4,
    fillColor: (r, n, c) => (c === 0 && stitky ? SEDA : null),
  },
});
const popis = (t) => ({ text: t.toUpperCase(), style: 'popis' });
const hodnota = (t) => ({ text: t || '—' });

function zaklad(s, obsah, { info }) {
  return {
    pageSize: 'A4',
    pageMargins: [42, 48, 42, 46],
    info: { title: info, author: s.zhotovitel?.split('\n')[0] || '', subject: s.nazev, creator: 'Stavební deník' },
    header: () => ({
      margin: [42, 22, 42, 0], fontSize: 7.5, color: '#555',
      columns: [{ text: `${nazevDeniku(s)} – ${s.nazev}` }, { text: s.misto || '', alignment: 'right' }],
    }),
    footer: (strana, pocet) => ({
      margin: [42, 14, 42, 0], fontSize: 7.5, color: '#555',
      columns: [{ text: info }, { text: `Strana ${strana} z ${pocet}`, alignment: 'right' }],
    }),
    content: obsah,
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.25 },
    styles: {
      popis: { fontSize: 7.5, bold: true, color: '#222', characterSpacing: 0.2 },
      maly: { fontSize: 7.5, color: '#555' },
      nadpis: { fontSize: 13, bold: true },
      pravni: { fontSize: 7.5, color: '#444', margin: [0, 10, 0, 0] },
    },
  };
}

// --- denní záznam -------------------------------------------------------------
export function definiceZaznamu(s, z, fotky) {
  const p = z.pocasi;
  const oznaceni = (i) => `${z.cislo}/${i + 1}`;
  const pocasiObsah = p ? [
    { text: p.shrnuti || '—' },
    p.teploty ? { text: `Teplota: 7 h ${cz(p.teploty[7])} °C · 12 h ${cz(p.teploty[12])} °C · 17 h ${cz(p.teploty[17])} °C · min ${cz(p.tmin)} / max ${cz(p.tmax)} °C · srážky ${cz(p.srazky_den)} mm${p.vitr_narazy != null ? ` · nárazy větru ${cz(p.vitr_narazy)} m/s` : ''}`, fontSize: 8.5 } : '',
    { text: `Zdroj: ${p.zdroj_text}`, style: 'maly' },
  ] : hodnota('');

  const radkyZaznamu = [
    [popis('Počasí'), { stack: pocasiObsah }],
    [popis('Pracovní doba'), hodnota(z.pracovni_doba)],
    [popis('Pracovníci na staveništi'), hodnota(radky(z.pracovnici).join(', '))],
    [popis('Stav staveniště'), hodnota(z.stav_staveniste)],
    [popis('Provedené práce'), hodnota(z.provedene_prace)],
    [popis('Dodávky'), hodnota(z.dodavky)],
    [popis('Mechanizace'), hodnota(z.mechanizace)],
    ...(z.opatreni ? [[popis('Opatření'), hodnota(z.opatreni)]] : []),
    ...(z.dalsi_zaznamy ? [[popis('Další záznamy'), hodnota(z.dalsi_zaznamy)]] : []),
    ...(fotky.length ? [[popis('Fotodokumentace'), hodnota(`foto č. ${oznaceni(0)}${fotky.length > 1 ? ` až ${oznaceni(fotky.length - 1)}` : ''} (${fotky.length} ks) – viz níže`)]] : []),
  ];

  const podpis = (kdo, jmeno) => ({
    stack: [
      { text: kdo.toUpperCase(), style: 'popis' },
      { text: jmeno || '', margin: [0, 2, 0, 0] },
      { text: 'Datum a podpis:', style: 'maly', margin: [0, 6, 0, 0] },
    ],
  });
  const podpisy = [podpis('Zapsal', z.zapsal), ...(s.tds ? [podpis('Technický dozor stavebníka', radky(s.tds)[0])] : [])];

  const obsah = [
    tabulka([[
      { text: `Denní záznam č. ${z.cislo}`, style: 'nadpis', fillColor: null },
      { text: datumCz(z.datum, true), style: 'nadpis', alignment: 'right' },
    ]], ['*', 'auto']),
    { ...tabulka(radkyZaznamu), margin: [0, -0.6, 0, 0] },
    {
      ...tabulka([podpisy.map((x) => ({ ...x, margin: [0, 0, 0, 34] }))], podpisy.map(() => '*')),
      margin: [0, -0.6, 0, 0], unbreakable: true,
    },
  ];

  if (fotky.length) {
    obsah.push({ text: `Fotodokumentace k záznamu č. ${z.cislo} ze dne ${datumCz(z.datum)}`, bold: true, fontSize: 10.5, margin: [0, 16, 0, 6] });
    for (let i = 0; i < fotky.length; i += 2) {
      obsah.push({
        columns: [0, 1].map((j) => {
          const f = fotky[i + j];
          return f ? {
            width: '*', unbreakable: true,
            stack: [
              { image: f.data, fit: [248, 186], alignment: 'center' },
              { text: [{ text: `Foto ${oznaceni(i + j)} `, bold: true }, f.popisek || ''], fontSize: 8, alignment: 'center', margin: [0, 3, 0, 0] },
            ],
          } : { width: '*', text: '' };
        }),
        columnGap: 14, margin: [0, 0, 0, 12], unbreakable: true,
      });
    }
  }
  return zaklad(s, obsah, { info: `${nazevDeniku(s)} – záznam č. ${z.cislo} ze dne ${datumCz(z.datum)}` });
}

// --- úvodní listy -------------------------------------------------------------
export function definiceUvodu(s) {
  const r = (n, x) => [popis(n), hodnota(x)];
  const osoby = [
    ['Stavbyvedoucí', s.stavbyvedouci], ['Technický dozor stavebníka', s.tds], ['Autorský dozor', s.ad],
    ...radky(s.opravnene_osoby).map((o) => ['Oprávněná osoba', o]),
  ].filter(([, x]) => x);
  const obsah = [
    { text: nazevDeniku(s).toUpperCase(), fontSize: 26, bold: true, alignment: 'center', characterSpacing: 3, margin: [0, 70, 0, 40] },
    tabulka([
      r('Stavba', s.nazev), r('Místo stavby', s.misto), r('Povolení stavby', s.povoleni),
      r('Stavebník', s.stavebnik), r('Zhotovitel', s.zhotovitel), r('Stavbyvedoucí', s.stavbyvedouci),
      r('Předání staveniště', datumCz(s.datum_predani)), r('Zahájení prací', datumCz(s.datum_zahajeni)),
    ]),
    {
      text: 'Vedeno podle § 166 zákona č. 283/2021 Sb., stavební zákon, a přílohy č. 12 vyhlášky č. 131/2024 Sb., o dokumentaci staveb. '
        + 'Denní záznamy jsou vedeny jako samostatné elektronicky podepsané dokumenty číslované pořadovým číslem záznamu; zápisy se nepřepisují, opravy se provádějí novým záznamem. '
        + 'Údaje o počasí: ČHMÚ – otevřená data automatických meteorologických stanic.',
      style: 'pravni',
    },
    { text: 'A. Identifikační údaje', style: 'nadpis', pageBreak: 'before', margin: [0, 0, 0, 8] },
    tabulka([
      r('Název stavby', s.nazev), r('Místo stavby', s.misto), r('Povolení (č. j., datum)', s.povoleni),
      r('Stavebník', s.stavebnik), r('Zhotovitel', s.zhotovitel), r('Poddodavatelé', s.poddodavatele),
      r('Projektant', s.projektant), r('Odborné vedení provádění stavby (stavbyvedoucí)', s.stavbyvedouci),
      r('Technický dozor stavebníka', s.tds), r('Autorský dozor', s.ad),
      r('Projektová a technická dokumentace, změny', s.dokumentace), r('Dokumenty a doklady ke stavbě', s.doklady),
    ]),
    { text: 'Osoby oprávněné provádět záznamy', bold: true, fontSize: 10.5, margin: [0, 14, 0, 6] },
    tabulka([
      ['Funkce', 'Jméno, oprávnění', 'Podpis / razítko'].map((t) => ({ ...popis(t), fillColor: SEDA })),
      ...osoby.map(([f, x]) => [f, x, { text: '', margin: [0, 0, 0, 30] }]),
    ], [110, '*', 150]),
    { text: 'Osoby vykonávající vybrané činnosti ve výstavbě prokazují oprávnění razítkem a podpisem (u elektronických dokumentů elektronickým autorizačním razítkem / uznávaným elektronickým podpisem). Změny těchto osob se zapisují do deníku.', style: 'pravni' },
  ];
  return zaklad(s, obsah, { info: `${nazevDeniku(s)} – úvodní listy` });
}

// --- export -------------------------------------------------------------------
const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export const nazevSouboruZaznamu = (s, z) => `SD_${slug(s.nazev)}_c${String(z.cislo).padStart(3, '0')}_${z.datum}.pdf`;
export const nazevSouboruUvodu = (s) => `SD_${slug(s.nazev)}_000_uvodni-listy.pdf`;

export async function pdfZaznamu(s, z, fotky) {
  const pdfMake = await nactiPdfmake();
  return pdfMake.createPdf(definiceZaznamu(s, z, fotky));
}
export async function pdfUvodu(s) {
  const pdfMake = await nactiPdfmake();
  return pdfMake.createPdf(definiceUvodu(s));
}
