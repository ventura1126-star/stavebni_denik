# Stavební deník – dřevostavby

Generátor zápisů do stavebního deníku. Stačí krátce popsat, co se dělalo, a nahrát fotky.
Stránka podle projektu napíše profesionální zápis, doplní počasí z nejbližší stanice ČHMÚ
a vytvoří PDF na A4. To elektronicky podepíšete a uložíte na sdílený disk.

Běží zdarma jako statická stránka na GitHub Pages. Nemá žádný server ani databázi.

## Postup

1. **Popis:** krátce, heslovitě, co se dělalo. Zápis se rozepíše do celých vět podle znalosti projektu.
2. **Fotky:** vyfotit nebo nahrát.
3. **Kontrola:** stránka připraví zápis se všemi náležitostmi: počasí (ČHMÚ), pracovní doba, pracovníci, stav staveniště,
   provedené práce, dodávky, mechanizace, další záznamy a fotodokumentace. Text můžete upravit.
4. **PDF:** stáhnete soubor `SD_<stavba>_c012_2026-11-05.pdf` a podepíšete ho elektronicky.
5. **Uložení:** PDF nahrajete na sdílený disk a dáte „Zápis je hotový“. Číslo se uloží a příští zápis dostane další.

**Jednou na začátku:**
- ⚙︎ **Nastavení:** API klíč Anthropic (console.anthropic.com → API Keys). Uloží se jen v prohlížeči.
- **Údaje stavby:** identifikační údaje, poloha, parta, pracovní doba a **znalost projektu**.
  Tu vložíte ručně, nebo ji AI vytáhne z PDF technické zprávy tlačítkem „Načíst z PDF projektu“.
- **Úvodní listy:** PDF s titulním listem a identifikačními údaji (část A). Podepsat a uložit jako první dokument deníku.

Co se kde pamatuje: údaje staveb, čísla záznamů a posledních 6 textů (vzor stylu) zůstávají v prohlížeči (localStorage).
Fotky jen do stažení PDF. Pro přenos na jiné zařízení slouží záloha v Nastavení.

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

Elektronicky vedený deník: zápisy autorizovaných osob podepisujte uznávaným elektronickým podpisem
(u autorizovaných osob ČKAIT elektronickým autorizačním razítkem). Aplikace je pomůcka; za obsah odpovídá stavbyvedoucí.
