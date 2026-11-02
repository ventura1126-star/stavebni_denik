// Úložiště: SQLite (vestavěné v Node.js) + fotky jako soubory v data/fotky
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
export const FOTO_DIR = path.join(DATA_DIR, 'fotky');
mkdirSync(FOTO_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'denik.sqlite'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS stavby (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nazev TEXT NOT NULL,
  misto TEXT,                 -- adresa / parcela
  lat REAL, lon REAL,
  stanice_wsi TEXT,           -- ruční volba stanice ČHMÚ (jinak nejbližší)
  povoleni TEXT,              -- povolení: č. j., datum, úřad
  typ_evidence TEXT DEFAULT 'denik',   -- 'denik' | 'zaznam' (jednoduchý záznam o stavbě)
  stavebnik TEXT,
  zhotovitel TEXT,
  projektant TEXT,
  poddodavatele TEXT,
  stavbyvedouci TEXT,         -- jméno, č. autorizace ČKAIT
  tds TEXT,                   -- technický dozor stavebníka
  ad TEXT,                    -- autorský dozor
  opravnene_osoby TEXT,       -- další osoby oprávněné k zápisu
  dokumentace TEXT,           -- údaje o projektové dokumentaci a jejích změnách
  doklady TEXT,               -- seznam dokladů (smlouvy, povolení, protokoly…)
  pracovnici TEXT,            -- výchozí parta (jedno jméno na řádek)
  mechanizace TEXT,           -- obvyklá mechanizace (jedna na řádek)
  datum_predani TEXT,         -- předání staveniště
  datum_zahajeni TEXT,
  poznamky TEXT,
  vytvoreno TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS zapisy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stavba_id INTEGER NOT NULL REFERENCES stavby(id) ON DELETE CASCADE,
  cislo INTEGER,              -- pořadové číslo, přiděleno při uzavření
  datum TEXT NOT NULL,        -- YYYY-MM-DD
  popisek TEXT,               -- krátký popis od uživatele (vstup)
  pocasi TEXT,                -- JSON snapshot počasí
  pracovnici TEXT,            -- jména a příjmení osob na staveništi
  stav_staveniste TEXT,
  provedene_prace TEXT,
  dodavky TEXT,
  mechanizace TEXT,
  opatreni TEXT,              -- prašnost, přístupnost, BOZP
  dalsi_zaznamy TEXT,         -- kontroly, zkoušky, zakrývání prací, změny…
  upozorneni TEXT,            -- interní poznámky z generování (netiskne se)
  zapsal TEXT,                -- jméno a funkce
  stav TEXT DEFAULT 'koncept',  -- 'koncept' | 'uzavren'
  uzavreno TEXT,
  vytvoreno TEXT DEFAULT (datetime('now')),
  upraveno TEXT
);

CREATE TABLE IF NOT EXISTS fotky (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zapis_id INTEGER NOT NULL REFERENCES zapisy(id) ON DELETE CASCADE,
  soubor TEXT NOT NULL,
  popisek TEXT,
  poradi INTEGER DEFAULT 0,
  porizeno TEXT,
  vytvoreno TEXT DEFAULT (datetime('now'))
);
`);

export const STAVBA_POLE = [
  'nazev', 'misto', 'lat', 'lon', 'stanice_wsi', 'povoleni', 'typ_evidence', 'stavebnik',
  'zhotovitel', 'projektant', 'poddodavatele', 'stavbyvedouci', 'tds', 'ad', 'opravnene_osoby',
  'dokumentace', 'doklady', 'pracovnici', 'mechanizace', 'datum_predani', 'datum_zahajeni', 'poznamky',
];

export const ZAPIS_POLE = [
  'datum', 'popisek', 'pocasi', 'pracovnici', 'stav_staveniste', 'provedene_prace', 'dodavky',
  'mechanizace', 'opatreni', 'dalsi_zaznamy', 'upozorneni', 'zapsal',
];

export function vyber(obj, pole) {
  const out = {};
  for (const k of pole) if (k in obj) out[k] = obj[k] === '' ? null : obj[k];
  return out;
}
