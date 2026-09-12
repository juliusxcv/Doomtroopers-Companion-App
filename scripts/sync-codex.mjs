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
const entries = [];
const monsters = [];
const warnings = [];
const slugSources = new Map();

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const { data: fm, content } = matter(raw);

  const relPath = path.relative(publishedDir, file);
  const relDir = path.dirname(relPath);
  const categoryPath = relDir === "." ? [] : relDir.split(path.sep);
  const filename = path.basename(file, ".md");

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
      const rarity = rarityMap.get(item.toLowerCase());
      if (!rarity) warnings.push(`${relPath}: "${item}" has no historical rarity — defaulted to "common".`);
      return { item, rarity: rarity && RARITIES.has(rarity) ? rarity : "common" };
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

console.log(`Synced ${entries.length} entries (${result.created} new, ${result.updated} updated).`);
console.log(`Synced ${monsters.length} monsters (${monsterResult.created} new, ${monsterResult.updated} updated).`);

if (result.stale.length > 0) {
  console.log(`\n${result.stale.length} entries in Convex no longer found in the vault (not deleted automatically):`);
  for (const s of result.stale) console.log(`  - ${s}`);
}

if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
