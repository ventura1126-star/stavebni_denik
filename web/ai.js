// Generování denního záznamu z fotek + krátkého popisku (Claude, volání přímo z prohlížeče)
// API klíč zadává uživatel v nastavení – ukládá se jen v jeho prohlížeči (localStorage).
import Anthropic from 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.0.0/+esm';

export const VYCHOZI_MODEL = 'claude-opus-5-5';
const MAX_FOTEK = 12;

const SYSTEM = `Jsi zkušený stavbyvedoucí firmy, která staví dřevostavby (rodinné domy z CLT/KVH, rámové a panelové dřevostavby, sruby, přístavby a nástavby). Píšeš denní záznamy do stavebního deníku podle § 166 zákona č. 283/2021 Sb. a přílohy č. 12 vyhlášky č. 131/2024 Sb.

Styl zápisu (jak se běžně píše do stavebních deníků):
- věcně, stručně, odborně, bez hodnocení a bez marketingu; trpný rod nebo neosobní tvary („Provedena montáž…“, „Osazeny stropní panely…“, „Pokračováno v…“);
- uváděj konkrétní konstrukce, podlaží, osy/místnosti, materiály a technologii (např. KVH 60×200 mm, OSB/3 tl. 15 mm, parozábrana, minerální izolace tl. 200 mm, kotvení na chemickou kotvu, pásky, úhelníky);
- popis a MNOŽSTVÍ provedených prací a časový postup (např. „7:00–15:30“), pokud z podkladů vyplývá;
- odborné názvosloví dřevostaveb: základová deska, podkladní práh/pražec, hydroizolace, obvodové a vnitřní stěnové panely, stropní panely, krokve, pozednice, vaznice, kontralatě, pojistná hydroizolace (difuzní fólie), latě, střešní krytina, větraná fasáda, kontaktní zateplení (ETICS), dřevovláknitá deska, parozábrana a parotěsné spoje, instalační předstěna, sádrokartonové/sádrovláknité opláštění;
- NIKDY si nevymýšlej fakta, která nejsou vidět na fotkách ani uvedena v popisku. Chybějící údaje (množství, rozměry, dodací listy, jména) označ jako „[doplnit]“, aby je stavbyvedoucí doplnil. Odhad z fotky označ slovem „cca“.
- Nepiš datum, počasí ani jména pracovníků do textu prací – ty jsou v samostatných kolonkách.
- U dřevostaveb si všímej a zapiš, pokud je to relevantní: ochrana dřevěných prvků a izolací před srážkami (zakrytí plachtou), vlhkost dřeva, kontrola parotěsnosti / blower-door test, zakrývání konstrukcí (souhlas TDS se zakrytím), BOZP při práci ve výškách (lešení, kotvení, záchytné sítě), práce s jeřábem/autojeřábem.
- Pokud počasí (déšť, sníh, mráz, silný vítr) mohlo ovlivnit práce, uveď to v poli stav_staveniste nebo dalsi_zaznamy.
- Pokud dostaneš ukázky dřívějších zápisů této firmy, napodob jejich styl, délku a formulace.

Výstup: pouze JSON podle schématu. Každé textové pole je čistý text (může mít více řádků, odrážky uvozuj „– “). Prázdné pole = prázdný řetězec.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['provedene_prace', 'stav_staveniste', 'dodavky', 'mechanizace', 'opatreni', 'dalsi_zaznamy', 'popisky_fotek', 'upozorneni'],
  properties: {
    provedene_prace: { type: 'string', description: 'Popis a množství provedených prací a montáží a jejich časový postup. Odkazuj na fotky jako (foto č. N).' },
    stav_staveniste: { type: 'string', description: 'Stav staveniště a podmínky (pořádek, zakrytí konstrukcí, příjezd, vliv počasí).' },
    dodavky: { type: 'string', description: 'Dodávky materiálů, výrobků, strojů – co, kolik, od koho, uskladnění/zabudování. Jen pokud plyne z podkladů.' },
    mechanizace: { type: 'string', description: 'Nasazená mechanizace (jeřáb, plošina, míchačka…). Jen pokud plyne z podkladů nebo z obvyklé mechanizace stavby.' },
    opatreni: { type: 'string', description: 'Opatření proti prašnosti, k zajištění přístupnosti, BOZP, PO, ochrana ŽP – jen pokud relevantní.' },
    dalsi_zaznamy: { type: 'string', description: 'Další záznamy: kontroly, zkoušky, zakrývání prací, změny oproti PD, překážky, vícepráce, poddodavatelé, mimořádné události.' },
    popisky_fotek: { type: 'array', items: { type: 'string' }, description: 'Krátký věcný popisek ke každé fotce ve stejném pořadí, jak byly předány (max. ~12 slov).' },
    upozorneni: { type: 'string', description: 'Poznámka pro stavbyvedoucího (netiskne se): co doplnit nebo ověřit před tiskem.' },
  },
};

const t = (x) => (x == null || x === '' ? '—' : String(x));

function kontext({ stavba, zapis, historie }) {
  const p = zapis.pocasi;
  return [
    `STAVBA: ${t(stavba.nazev)}, ${t(stavba.misto)}`,
    `Zhotovitel: ${t(stavba.zhotovitel)}; poddodavatelé: ${t(stavba.poddodavatele)}`,
    `Obvyklá mechanizace stavby: ${t(stavba.mechanizace)}`,
    `DATUM ZÁZNAMU: ${zapis.datum}`,
    p ? `POČASÍ: ${p.shrnuti}; teploty 7/12/17 h: ${p.teploty?.[7]}/${p.teploty?.[12]}/${p.teploty?.[17]} °C` : 'POČASÍ: neznámé',
    `PRACOVNÍCI NA STAVBĚ: ${t(zapis.pracovnici)}`,
    '',
    'PŘEDCHOZÍ ZÁZNAMY TÉTO STAVBY (pro návaznost i jako vzor stylu, nejnovější první):',
    ...(historie.length
      ? historie.map((z) => `[č. ${z.cislo}, ${z.datum}] ${z.provedene_prace}`)
      : ['(žádné – jde o první záznam)']),
    '',
    'POPIS OD STAVBYVEDOUCÍHO (hlavní zdroj faktů):',
    zapis.popisek || '(bez popisku – vycházej z fotek)',
  ].join('\n');
}

/** Vrátí navržená pole záznamu. Bez API klíče sestaví základní záznam z popisku. */
export async function generujZapis({ klic, model, stavba, zapis, fotky, historie }) {
  if (!klic) return zakladniZapis({ zapis, fotky });

  const client = new Anthropic({ apiKey: klic, dangerouslyAllowBrowser: true });
  const content = [];
  fotky.slice(0, MAX_FOTEK).forEach((f, i) => {
    content.push({ type: 'text', text: `Foto č. ${i + 1}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data.split(',')[1] } });
  });
  content.push({ type: 'text', text: kontext({ stavba, zapis, historie }) + '\n\nNapiš denní záznam do stavebního deníku.' });

  let msg;
  try {
    msg = await client.beta.messages.create({
      model: model || VYCHOZI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Neplatný API klíč – zkontrolujte ho v Nastavení.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('API klíč nemá oprávnění (zkontrolujte kredit na console.anthropic.com).');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Příliš mnoho požadavků – zkuste to za chvíli.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Nelze se spojit s Claude – zkontrolujte připojení k internetu.');
    if (e instanceof Anthropic.APIError) throw new Error(`Chyba Claude API (${e.status}): ${e.message}`);
    throw e;
  }
  if (msg.stop_reason === 'refusal') throw new Error('Model odmítl zápis vytvořit – zkuste upravit popisek.');
  if (msg.stop_reason === 'max_tokens') throw new Error('Odpověď modelu byla useknuta – zkuste to znovu.');
  const out = JSON.parse(msg.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  return { ...out, popisky_fotek: out.popisky_fotek ?? [] };
}

function zakladniZapis({ zapis, fotky }) {
  const popisek = (zapis.popisek || '').trim();
  return {
    provedene_prace: popisek
      ? popisek[0].toUpperCase() + popisek.slice(1) + (fotky.length ? ` (foto č. 1–${fotky.length})` : '')
      : '[doplnit popis provedených prací]',
    stav_staveniste: '', dodavky: '', mechanizace: '', opatreni: '', dalsi_zaznamy: '',
    popisky_fotek: fotky.map(() => ''),
    upozorneni: 'Zápis nebyl napsán umělou inteligencí (v Nastavení chybí API klíč) – text je převzat z popisku, doplňte ho ručně.',
  };
}
