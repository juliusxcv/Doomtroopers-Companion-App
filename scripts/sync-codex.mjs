// Syncs Published/ from an Obsidian vault into Convex's codex_entries table,
// and — for Bestiary notes that also carry monster mechanical frontmatter
// (organs, monster_id, etc.) — into the monsters table too. One file, read
// once, both destinations: these are the same public notes, not a private
// vs. public split. Run on whichever machine currently has the vault on
// disk — the companion app itself never needs local vault access, only
// Convex.
//
// Usage: node scripts/sync-codex.mjs "<path-to-vault>" ["<path-to-supabase-backup-folder>"]

import { ConvexHttpClient } from "convex/browser";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";
import { api } from "../convex/_generated/api.js";

process.loadEnvFile(".env.local");

const vaultPath = process.argv[2];
const backupDir =
  process.argv[3] ?? "C:\\Users\\juliu\\Documents\\Doomtroopers\\supabase-backup-20260808-120832";
if (!vaultPath) {
  console.error('Usage: node scripts/sync-codex.mjs <path-to-vault> ["<path-to-supabase-backup-folder>"]');
  process.exit(1);
}

const publishedDir = path.join(vaultPath, "Published");
if (!fs.existsSync(publishedDir)) {
  console.error(`No "Published" folder found at ${publishedDir}`);
  process.exit(1);
}

const RARITIES = new Set(["scrap", "common", "uncommon", "rare", "legendary"]);

// A "Monster ID | Item | Rarity | Drop % | Scrap Yield | Components Yield"
// reference table, authored by the GM under Published/ (same "sync only
// reads Published/" rule as everything else) — takes priority over the
// historical-log guess below. Not synced as a codex entry itself; it's
// config, not player-facing content.
//
// Keyed per-monster, not just per-item: the same item can carry a
// different rarity/chance/yield depending on which creature drops it (e.g.
// "Spoiled MedStims" is uncommon from Undead Cadaver but rare from
// Fleshspoil) — an earlier version of this table collapsed that into one
// global rarity per item name, which was wrong for several real items.
const RARITY_TABLE_FILENAME = "Lootdrop Table.md";

// Blank/non-numeric Scrap or Components Yield cells mean "no yield", not
// "unknown" — unlike Drop %, 0 is a legitimate, common real value here.
function toYield(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseLootReferenceTable(content) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));
  const rows = parsePipeTable(lines);
  const map = new Map(); // monsterId -> (lowercase item -> { rarity, dropChance, scrapYield, componentsYield })
  for (const row of rows) {
    const monsterId = (row["monster id"] ?? row.monster ?? "").trim();
    const item = (row.item ?? "").trim();
    const rarity = (row.rarity ?? "").trim().toLowerCase();
    const dropChance = Number(row["drop %"] ?? row["drop chance"]);
    if (!monsterId || !item || !RARITIES.has(rarity)) continue;
    if (!map.has(monsterId)) map.set(monsterId, new Map());
    map.get(monsterId).set(item.toLowerCase(), {
      rarity,
      dropChance: Number.isFinite(dropChance) ? dropChance : undefined,
      scrapYield: toYield(row["scrap yield"]),
      componentsYield: toYield(row["components yield"]),
    });
  }
  return map;
}

// Splits a note's body on "## LVL N Autopsy:" headers, one chunk per tier,
// in order. Returns null if the note has no such sections.
function splitTiers(body) {
  const headerRe = /^##\s*LVL\s*\d+\s*Autopsy:/gim;
  const matches = [...body.matchAll(headerRe)];
  if (matches.length === 0) return null;
  return matches.map((m, i) => {
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    return { body: body.slice(start, end).trim() };
  });
}

// Parses the single-column "| Loot Table |" pipe table into item names.
// Never sent to players — see codex.ts: `body` is blanked for tiered
// entries and this text never lives inside a "## LVL N" section anyway.
function parseLootTable(body) {
  const lines = body.split(/\r?\n/);
  const items = [];
  let inTable = false;
  let sawSeparator = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inTable) {
      if (/^\|\s*Loot Table\s*\|$/i.test(trimmed)) inTable = true;
      continue;
    }
    if (!sawSeparator) {
      sawSeparator = true; // the row right after the header is the --- separator
      continue;
    }
    if (!trimmed.startsWith("|")) break; // table ended
    const cell = trimmed.replace(/^\|/, "").replace(/\|$/, "").trim();
    if (cell) items.push(cell);
  }
  return items;
}

// Historical item name -> rarity, by majority vote across the old loot_log
// backup — the old app's per-item drop-chance/tier data (monster_loot table)
// was never backed up before that Supabase project was deleted.
function buildRarityMap(backupDir) {
  const lootLogPath = path.join(backupDir, "tables", "loot_log.json");
  if (!fs.existsSync(lootLogPath)) {
    console.warn(`No loot_log.json found at ${lootLogPath} — every item will default to "common".`);
    return new Map();
  }
  const rows = JSON.parse(fs.readFileSync(lootLogPath, "utf8"));
  const counts = new Map(); // lowercase name -> { rarity -> count }
  for (const row of rows) {
    const key = row.item_name.toLowerCase();
    const byRarity = counts.get(key) ?? new Map();
    byRarity.set(row.rarity, (byRarity.get(row.rarity) ?? 0) + 1);
    counts.set(key, byRarity);
  }
  const result = new Map();
  for (const [key, byRarity] of counts) {
    let best = null;
    for (const [rarity, n] of byRarity) {
      if (!best || n > best[1]) best = [rarity, n];
    }
    if (best) result.set(key, best[0]);
  }
  return result;
}

// Extracts the raw text under a "#{1..level} Name" heading, up to the next
// heading whose level is <= the given level (so e.g. an Abilities section
// stops at the next "## LVL N Autopsy:", not just another "###"). Returns
// null if the heading isn't present.
function extractSection(body, level, name) {
  const hashes = "#".repeat(level);
  const headingRe = new RegExp(`^${hashes}\\s*${name}\\s*:?\\s*$`, "im");
  const m = body.match(headingRe);
  if (!m) return null;
  const after = body.slice(m.index + m[0].length);
  const nextIdx = after.search(new RegExp(`\\n#{1,${level}}\\s`));
  return (nextIdx === -1 ? after : after.slice(0, nextIdx)).trim();
}

// Parses a generic markdown pipe table (header row, "---" separator row,
// data rows) into an array of { <lowercase header>: cell } objects.
function parsePipeTable(lines) {
  if (lines.length < 2) return [];
  const cells = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const header = cells(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(2).map((line) => {
    const values = cells(line);
    const row = {};
    header.forEach((h, i) => (row[h] = values[i] ?? ""));
    return row;
  });
}

// Splits a chunk of text into its separate pipe tables — a "### Stats"
// section has 3 back-to-back tables (the RC/CC/AP/MV/DEF/HP row, a Ranged
// weapon table, a Melee weapon table), not one, so a single parsePipeTable
// call over the whole chunk would merge them into garbage.
function splitPipeTables(text) {
  const lines = text.split(/\r?\n/);
  const tables = [];
  let current = [];
  for (const line of lines) {
    if (line.trim().startsWith("|")) {
      current.push(line);
    } else if (current.length > 0) {
      tables.push(current);
      current = [];
    }
  }
  if (current.length > 0) tables.push(current);
  return tables.map(parsePipeTable);
}

// A "Ranged"/"Melee" weapon table uses that word as its own first column
// header (e.g. "| Ranged | ATK | DMG | WR |"), not a generic "Weapon"
// column — the row's value under that key is the weapon's name. A "-"
// placeholder name (no weapon of that kind) is dropped.
function tableToWeapons(rows, key) {
  return rows
    .map((r) => ({
      name: (r[key] ?? "").trim(),
      atk: (r.atk ?? "").trim(),
      dmg: (r.dmg ?? "").trim(),
      wr: (r.wr ?? "").trim(),
    }))
    .filter((w) => w.name && w.name !== "-");
}

// Parses a "stats row + optional Ranged/Melee weapon tables" chunk — the
// content shared by a "### Stats:" loadout section and a companion's "#
// Name" section (see parseLoadouts/parseCompanions below). Returns null if
// the chunk has no recognizable stats table at all.
function parseStatsAndWeapons(chunk) {
  const [statsRows, ...weaponTables] = splitPipeTables(chunk);
  const statsRow = statsRows?.[0];
  if (!statsRow) return null;
  const pick = (key) => (statsRow[key] ?? "").trim();
  const stats = { rc: pick("rc"), cc: pick("cc"), ap: pick("ap"), mv: pick("mv"), def: pick("def"), hp: pick("hp") };
  const inv = pick("inv");
  if (inv) stats.inv = inv;

  const ranged = [];
  const melee = [];
  for (const rows of weaponTables) {
    const firstKey = Object.keys(rows[0] ?? {})[0];
    if (firstKey === "ranged") ranged.push(...tableToWeapons(rows, "ranged"));
    else if (firstKey === "melee") melee.push(...tableToWeapons(rows, "melee"));
  }

  return { stats, weapons: { ranged, melee } };
}

// One "### Stats[ <Loadout Name>]:" section and everything under it, up to
// the next heading of any level. Real notes stack these back-to-back for
// squad-type creatures with multiple loadouts (see Undead Mutant: Sergeant,
// Grenadier, Trooper, ...); most creatures have exactly one, with no name.
function parseLoadouts(body) {
  const headingRe = /^###\s*Stats(?:\s+([^:\n]+))?\s*:?\s*$/gim;
  const matches = [...body.matchAll(headingRe)];
  if (matches.length === 0) return undefined;

  const loadouts = [];
  matches.forEach((m, i) => {
    const name = (m[1] ?? "").trim();
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    let chunk = body.slice(start, end);
    const nextHeadingIdx = chunk.search(/\n#{1,6}\s/);
    if (nextHeadingIdx !== -1) chunk = chunk.slice(0, nextHeadingIdx);

    const parsed = parseStatsAndWeapons(chunk);
    if (parsed) loadouts.push({ name, ...parsed });
  });

  return loadouts.length > 0 ? loadouts : undefined;
}

// A companion/servitor unit belonging to a character note — a "# <Name>"
// (H1) section containing its own bare stats table (no "### Stats:"
// heading needed, unlike a loadout), optional weapon tables, and its own
// "### Abilities:". Everything up to the next "# " heading or end of body
// belongs to that companion, LVL/Stats/Abilities headings included, since
// (unlike a loadout) a companion owns its whole section.
function parseCompanions(body) {
  const headingRe = /^#\s+(.+)$/gm;
  const matches = [...body.matchAll(headingRe)];
  if (matches.length === 0) return undefined;

  const companions = [];
  matches.forEach((m, i) => {
    const name = m[1].trim();
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const chunk = body.slice(start, end);

    const parsed = parseStatsAndWeapons(chunk);
    if (parsed) companions.push({ name, ...parsed, abilities: parseAbilities(chunk) });
  });

  return companions.length > 0 ? companions : undefined;
}

// Obsidian wikilinks (e.g. "[[Synaptic Node Core]]" or "[[target|alias]]")
// read as broken syntax to a player — abilities are shown as plain text,
// not rendered markdown, so these need flattening to their display text.
function stripWikilinks(text) {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target);
}

// "### Abilities:" section. Two author styles both appear in real notes,
// so both are supported:
//   - "- **Name**: description" bullets (monster notes, ALB-XXIII) — one
//     line per ability, description optional ("- Name" alone is kept with
//     an empty one).
//   - "**Name**" alone on its own line, with the description as one or
//     more plain paragraph lines following it, up to the next "**Name**"
//     header or bullet (character notes like Slabs/Isabella/Vexilia).
// A note can mix both (e.g. Helbrecht: a "**Acts of Faith**" paragraph
// intro followed by "- **N FP - Guidance**: ..." bullets) — each marker
// line (bullet or bare header) starts a new ability; anything else is
// appended to the current one's description.
function parseAbilities(body) {
  const section = extractSection(body, 3, "Abilities");
  if (!section) return undefined;

  const abilities = [];
  let current = null;
  const flush = () => {
    // A trailing colon can end up inside the bold markers depending on
    // authoring style (e.g. "**Light 'Em Up:**") — strip it either way so
    // the name doesn't carry stray punctuation.
    if (current && current.name) {
      abilities.push({ name: current.name.trim().replace(/:\s*$/, ""), description: current.description.trim() });
    }
    current = null;
  };

  for (const raw of section.split(/\r?\n/)) {
    const line = stripWikilinks(raw.trim());
    if (!line) continue;

    const bulletMatch = line.match(/^-+\s*\*\*(.+?)\*\*:?\s*(.*)$/);
    if (bulletMatch) {
      flush();
      current = { name: bulletMatch[1], description: bulletMatch[2] };
      continue;
    }

    const headerMatch = line.match(/^\*\*(.+?)\*\*\s*$/);
    if (headerMatch) {
      flush();
      current = { name: headerMatch[1], description: "" };
      continue;
    }

    const bareBulletMatch = line.match(/^-+\s*(.+)$/);
    if (bareBulletMatch) {
      flush();
      current = { name: bareBulletMatch[1], description: "" };
      continue;
    }

    if (current) current.description = current.description ? `${current.description} ${line}` : line;
  }
  flush();

  return abilities.length > 0 ? abilities : undefined;
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

const rarityMap = buildRarityMap(backupDir);
const files = walk(publishedDir);

const rarityTableFile = files.find((f) => path.basename(f) === RARITY_TABLE_FILENAME);
const lootRefMap = rarityTableFile
  ? parseLootReferenceTable(matter(fs.readFileSync(rarityTableFile, "utf8")).content)
  : new Map();

// Flat fallback for an item with no listed or historical drop chance —
// matches the old uniform rate every item used before per-item chances existed.
const DEFAULT_DROP_CHANCE = 50;

const entries = [];
const monsters = [];
const characters = [];
const warnings = [];
const slugSources = new Map();

for (const file of files) {
  if (path.basename(file) === RARITY_TABLE_FILENAME) continue;

  const raw = fs.readFileSync(file, "utf8");
  const { data: fm, content } = matter(raw);

  const relPath = path.relative(publishedDir, file);
  const relDir = path.dirname(relPath);
  const categoryPath = relDir === "." ? [] : relDir.split(path.sep);
  const filename = path.basename(file, ".md");

  // Player-character notes (Published/CODEX/Characters/) are a separate
  // destination — Operator Profile stats/weapons/abilities, not Codex
  // lore — so they never become a codex entry, same principle as the
  // Lootdrop Table exclusion above.
  const characterName = fm.character ? String(fm.character).trim() : undefined;
  if (characterName) {
    const loadouts = parseLoadouts(content);
    characters.push({
      name: characterName,
      stats: loadouts?.[0]?.stats,
      weapons: loadouts?.[0]?.weapons,
      abilities: parseAbilities(content),
      companions: parseCompanions(content),
    });
    continue;
  }

  // Prefer an explicit id/slug from frontmatter (stable across file moves)
  // and only fall back to a path-derived slug when the note has neither.
  const slug = fm.slug || fm.id || slugify(path.join(relDir, filename));
  const title = fm.title || filename;
  const body = content.trim();

  if (!fm.type) warnings.push(`${relPath}: missing "type"`);
  if (!body && !fm.code) warnings.push(`${relPath}: no body and no code — nothing to show players`);

  if (slugSources.has(slug)) {
    warnings.push(`Duplicate slug "${slug}": "${slugSources.get(slug)}" and "${relPath}"`);
  }
  slugSources.set(slug, relPath);

  const tiers = splitTiers(body);
  const monsterId = fm.monster_id ? String(fm.monster_id) : undefined;
  if (tiers && !monsterId) {
    warnings.push(`${relPath}: has LVL Autopsy sections but no monster_id — tiers will never unlock.`);
  }

  entries.push({
    slug,
    title,
    categoryPath,
    type: fm.type,
    status: fm.status,
    code: fm.code !== undefined ? String(fm.code).trim().toUpperCase() : undefined,
    cost: fm.cost !== undefined ? Number(fm.cost) : undefined,
    lvl: fm.lvl !== undefined ? String(fm.lvl) : undefined,
    body: tiers ? "" : body,
    tiers: tiers ?? undefined,
    monsterId,
  });

  // Mechanical data lives on the same public note now (not a separate
  // private one) — a Bestiary note is "playable" once it has both an
  // explicit monster_id and a usable organ pool.
  const organPool = Array.isArray(fm.organs) ? fm.organs : [];
  if (monsterId && organPool.length >= 3) {
    const lootItems = parseLootTable(content);
    const lootTable = lootItems.map((item) => {
      const key = item.toLowerCase();
      const listed = lootRefMap.get(monsterId)?.get(key);
      const rarity = listed?.rarity ?? rarityMap.get(key);
      if (!rarity) warnings.push(`${relPath}: "${item}" has no listed or historical rarity — defaulted to "common".`);
      const dropChance = listed?.dropChance;
      if (dropChance === undefined) {
        warnings.push(`${relPath}: "${item}" has no listed drop chance — defaulted to ${DEFAULT_DROP_CHANCE}%.`);
      }
      return {
        item,
        rarity: rarity && RARITIES.has(rarity) ? rarity : "common",
        dropChance: dropChance ?? DEFAULT_DROP_CHANCE,
        scrapYield: listed?.scrapYield ?? 0,
        componentsYield: listed?.componentsYield ?? 0,
      };
    });

    monsters.push({
      monsterId,
      code: fm.code ? String(fm.code) : monsterId,
      name: title.replace(/\s*-\s*Autopsy Report$/i, ""),
      blurb: fm.blurb ? String(fm.blurb) : undefined,
      organPool,
      attemptsModifier: Number(fm.attempts_modifier ?? 0),
      identifiedScansRequired: Number(fm.identified ?? 0),
      lootTable,
      tierCount: tiers ? tiers.length : 0,
      loadouts: parseLoadouts(content),
      abilities: parseAbilities(content),
    });
  } else if (monsterId && organPool.length > 0) {
    warnings.push(`${relPath}: only ${organPool.length} organs — not playable, skipped from monsters.`);
  }
}

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("VITE_CONVEX_URL not found in .env.local — is `npx convex dev` running?");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);
const result = await client.mutation(api.codex.sync, { entries });
const monsterResult = await client.mutation(api.monsters.sync, { monsters });
const characterResult = characters.length > 0 ? await client.mutation(api.characters.syncStats, { characters }) : null;

console.log(`Synced ${entries.length} entries (${result.created} new, ${result.updated} updated).`);
console.log(`Synced ${monsters.length} monsters (${monsterResult.created} new, ${monsterResult.updated} updated).`);
if (characterResult) {
  console.log(`Synced ${characters.length} character profiles (${characterResult.updated} updated).`);
  for (const name of characterResult.unmatched) {
    warnings.push(`Character "${name}" has no matching roster entry (check spelling against characters:list) — skipped.`);
  }
}

if (result.stale.length > 0) {
  console.log(`\n${result.stale.length} entries in Convex no longer found in the vault (not deleted automatically):`);
  for (const s of result.stale) console.log(`  - ${s}`);
}

if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
