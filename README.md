# Stavební deník – dřevostavby

Generátor listů stavebního deníku. Na stavbě nafotíte, co se dělalo, a napíšete jednu větu.
Stránka z toho udělá řádný denní záznam, doplní počasí z nejbližší stanice ČHMÚ a připraví list A4,
který vytisknete, podepíšete a založíte do desek.

Běží zdarma jako statická stránka na GitHub Pages. Nemá žádný server ani databázi.

## Použití

1. **Nastavení (⚙︎):** jednou zadejte API klíč Anthropic (console.anthropic.com → API Keys).
   Uloží se jen ve vašem prohlížeči. Bez klíče se text zápisu převezme z vašeho popisku.
2. **Stavba:** vyplňte identifikační údaje (část A deníku), polohu (vyhledání adresy) a stálou partu.
   Úvodní listy (titulní list, identifikační údaje, podpisové vzory) vytisknete jednou na začátku.
3. **Nový list:** datum, fotky, krátký popis, zaškrtnout pracovníky → **Napsat zápis**.
   Text zkontrolujte, upravte a dejte **Náhled a tisk**. Po vytištění si stránka uloží číslo záznamu
   a text jako vzor stylu a návaznosti pro další zápisy.

Co se kde pamatuje: údaje staveb, čísla záznamů a posledních 6 textů zůstávají v prohlížeči (localStorage).
Fotky jen do vytištění. Pro přenos na jiné zařízení slouží záloha v Nastavení.

## Počasí

Úloha GitHub Actions ([.github/workflows/stranka.yml](.github/workflows/stranka.yml)) stahuje 4× denně
10minutová měření všech automatických stanic ČHMÚ a ukládá denní souhrny do větve `pocasi`. Na stránce jsou ve složce `pocasi/`.
ČHMÚ v otevřených datech drží jen poslední ~2 dny, archiv je proto trvalý. Do zápisu jde teplota v 7, 12 a 17 h, min/max,
srážky, nárazy větru a vlhkost. Popis oblačnosti doplňuje Open-Meteo, které slouží i jako záloha pro dny mimo archiv.

GitHub vypíná plánované úlohy ve veřejném repu po 60 dnech bez commitu. Pokud se archiv přestane plnit, zapněte úlohu znovu
v záložce Actions.

## Nasazení (jednou)

1. Settings → General → Danger Zone → **Change visibility → Public**
2. Settings → Pages → Source: **GitHub Actions**
3. Actions → **Stránka a počasí** → **Run workflow**

Stránka pak běží na `https://<uživatel>.github.io/<repo>/`. Každý push do `main` ji znovu nasadí.

## Lokální vývoj

```bash
npm run pocasi   # stáhne aktuální počasí do web/pocasi
npm start        # http://localhost:3000
```

## Legislativa (stav k 11/2026)

- § 166 zákona č. 283/2021 Sb. (stavební zákon): povinnost vést stavební deník, případně jednoduchý záznam o stavbě
- vyhláška č. 131/2024 Sb., § 10 a **příloha č. 12**: obsah a způsob vedení deníku
  - denní záznamy: jména a příjmení osob na staveništi, klimatické podmínky, stav staveniště, popis a množství prací a jejich časový postup, dodávky, mechanizace, opatření proti prašnosti a pro přístupnost
  - zapisuje se nejpozději následující pracovní den, strany jsou číslované, deník nesmí mít volná místa

Aplikace slouží jako pomůcka. Právně závazný je podepsaný papírový výtisk.
