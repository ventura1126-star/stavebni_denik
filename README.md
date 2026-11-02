# Stavební deník – dřevostavby

Hybrid mezi elektronickým a papírovým stavebním deníkem. Na stavbě nafotíte, co se dělalo, napíšete jednu větu.
Aplikace z toho udělá řádný denní záznam, doplní počasí z nejbližší stanice ČHMÚ a celý deník
vytiskne na A4, aby se dal podepsat a předat investorovi.

## Spuštění

```bash
npm install
cp .env.example .env   # a doplňte ANTHROPIC_API_KEY
npm start              # → http://localhost:3000
```

Potřebuje Node.js 22.13 nebo novější (databáze SQLite je vestavěná v Node.js). Data jsou ve složce `data/`
(`denik.sqlite` a fotky). Zálohujte ji.

Bez `ANTHROPIC_API_KEY` aplikace funguje taky, jen se text záznamu převezme z popisku a doplníte ho ručně.

## Jak to funguje

1. **Stavba**: identifikační údaje (část A deníku), poloha stavby (vyhledání adresy) a stálá parta pracovníků.
2. **Nový záznam**: fotky a krátký popis. Server:
   - načte **počasí** z nejbližší automatické stanice ČHMÚ (`opendata.chmi.cz`, 10minutová data): teplota v 7, 12 a 17 h, min/max, srážky, nárazy větru, vlhkost. Slovní popis oblačnosti doplní z Open-Meteo.
     ČHMÚ drží v otevřených datech jen posledních zhruba 48 hodin, takže pro starší dny se použijí modelová data Open-Meteo a záznam to uvádí.
   - pošle fotky a popis Claude (`claude-opus-5-5`), který napíše záznam stylem stavebního deníku, rozdělený do kolonek podle přílohy č. 12 vyhl. 131/2024 Sb. Co se nedá z podkladů zjistit, označí jako `[doplnit]`.
3. **Kontrola a uzavření**: zápis upravíte a uzavřete. Uzavřený záznam dostane pořadové číslo a už nejde změnit, stejně jako zápis perem. Záznam se zbylým `[doplnit]` uzavřít nejde.
4. **Tisk**: titulní list, část A s podpisovými vzory a razítky, denní záznamy (každý na vlastní list s místem pro vyjádření TDS/AD) a fotopřílohy. Strany jsou číslované a výtisk je označený jako originál nebo kopie.

## Legislativa (stav k 11/2026)

- § 166 zákona č. 283/2021 Sb. (stavební zákon): povinnost vést stavební deník, případně jednoduchý záznam o stavbě
- vyhláška č. 131/2024 Sb., § 10 a **příloha č. 12**: obsah a způsob vedení deníku
  - denní záznamy: jména a příjmení osob na staveništi, klimatické podmínky, stav staveniště, popis a množství prací a jejich časový postup, dodávky, mechanizace, opatření proti prašnosti a pro přístupnost
  - zapisuje se nejpozději následující pracovní den, strany jsou číslované, deník nesmí mít volná místa

Aplikace slouží jako pomůcka. Právně závazný je podepsaný papírový výtisk.

## Provoz na internetu

Aplikaci jde nasadit na libovolný server s Node.js (VPS, Railway, Render…). Nastavte `HESLO` v `.env`, aby nebyla veřejná,
a provozujte ji za HTTPS. Na serveru musí zůstávat složka `data/` (persistentní disk).
