// Syncs private creature notes (World Lore/Beastiary/**, NOT Published/)
// into Convex's monsters table — organ pool, attempts, scan thresholds, and
// a loot table parsed from each note's "Loot Table" list.
//
// Per-item rarity isn't in the vault (that data lived in the old app's
// `monster_loot` Supabase table, which was never backed up before that
// project was deleted) — it's reconstructed from the historical loot_log
// backup instead, by majority vote per item name.
//
// Usage: node scripts/sync-monsters.mjs "<path-to-vault>" ["<path-to-supabase-backup-folder>"]

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
  console.error('Usage: node scripts/sync-monsters.mjs <path-to-vault> ["<path-to-supabase-backup-folder>"]');
  process.exit(1);
}

const beastiaryDir = path.join(vaultPath, "World Lore", "Beastiary");
if (!fs.existsSync(beastiaryDir)) {
  console.error(`No "World Lore/Beastiary" folder found at ${beastiaryDir}`);
  process.exit(1);
}

const RARITIES = new Set(["scrap", "common", "uncommon", "rare", "legendary"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

// Parses the single-column "| Loot Table |" pipe table into item names.
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

function countLvlSections(body) {
  const matches = body.match(/^##\s*LVL\s*\d+\s*Autopsy:/gim);
  return matches ? matches.length : 0;
}

// Historical item name -> rarity, by majority vote across the old loot_log backup.
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

const rarityMap = buildRarityMap(backupDir);
const files = walk(beastiaryDir);
const monsters = [];
const warnings = [];

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const { data: fm, content } = matter(raw);
  const relPath = path.relative(vaultPath, file);

  if (fm.type !== "creature") continue;

  const organPool = Array.isArray(fm.organs) ? fm.organs : [];
  if (organPool.length < 3) {
    if (organPool.length > 0) warnings.push(`${relPath}: only ${organPool.length} organs — not playable, skipped.`);
    continue;
  }
  if (!fm.monster_id) {
    warnings.push(`${relPath}: missing "monster_id" — skipped (would break scan-progress linking).`);
    continue;
  }

  const lootItems = parseLootTable(content);
  const lootTable = lootItems.map((item) => {
    const rarity = rarityMap.get(item.toLowerCase());
    if (!rarity) warnings.push(`${relPath}: "${item}" has no historical rarity — defaulted to "common".`);
    return { item, rarity: rarity && RARITIES.has(rarity) ? rarity : "common" };
  });

  monsters.push({
    monsterId: String(fm.monster_id),
    code: fm.code ? String(fm.code) : String(fm.monster_id),
    name: path.basename(file, ".md"),
    blurb: fm.blurb ? String(fm.blurb) : undefined,
    organPool,
    attemptsModifier: Number(fm.attempts_modifier ?? 0),
    identifiedScansRequired: Number(fm.identified ?? 0),
    tierCount: countLvlSections(content),
    lootTable,
  });
}

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("VITE_CONVEX_URL not found in .env.local — is `npx convex dev` running?");
  process.exit(1);
}
const client = new ConvexHttpClient(convexUrl);
const result = await client.mutation(api.monsters.sync, { monsters });

console.log(`Synced ${monsters.length} monsters (${result.created} new, ${result.updated} updated).`);
if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
