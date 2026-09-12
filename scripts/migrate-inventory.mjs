// One-time import of the old Lovable app's loot_log backup into Convex's
// inventory table. The source Supabase project is gone (deleted), so this
// runs against the local JSON snapshot saved by that app's backup-supabase.ps1
// script, not a live API.
//
// Usage: node scripts/migrate-inventory.mjs "<path-to-supabase-backup-folder>"

import { ConvexHttpClient } from "convex/browser";
import fs from "node:fs";
import path from "node:path";
import { api } from "../convex/_generated/api.js";

process.loadEnvFile(".env.local");

const backupDir = process.argv[2];
if (!backupDir) {
  console.error("Usage: node scripts/migrate-inventory.mjs <path-to-supabase-backup-folder>");
  process.exit(1);
}

const lootLogPath = path.join(backupDir, "tables", "loot_log.json");
if (!fs.existsSync(lootLogPath)) {
  console.error(`No loot_log.json found at ${lootLogPath}`);
  process.exit(1);
}

// Old app's free-text player_name -> this app's character roster name.
const NAME_MAP = {
  Vex: "Vexilia Thornkell",
  Nullis: "Helbrecht Nullis",
  Isabella: "Isabella Alderidge",
  "Gideon rook": "Gideon Rook",
  AlbXXIII: "ALB-XXIII",
  slabs: "Slabs",
  LISV_INQ: "Lord Inquisitor Seraphina Valeria",
};

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("VITE_CONVEX_URL not found in .env.local — is `npx convex dev` running?");
  process.exit(1);
}
const client = new ConvexHttpClient(convexUrl);

const characters = await client.query(api.characters.list, {});
const characterIdByName = new Map(characters.map((c) => [c.name, c._id]));

const oldRows = JSON.parse(fs.readFileSync(lootLogPath, "utf8"));
const rows = [];
const warnings = [];

for (const old of oldRows) {
  const characterName = NAME_MAP[old.player_name];
  const characterId = characterName ? characterIdByName.get(characterName) : undefined;
  if (!characterId) {
    warnings.push(`Skipping "${old.item_name}" — no character mapping for player_name "${old.player_name}".`);
    continue;
  }

  rows.push({
    characterId,
    itemName: old.item_name,
    rarity: old.rarity,
    source: old.source,
    monsterId: old.monster_id ?? undefined,
    smelted: old.smelted,
    createdAt: new Date(old.created_at).getTime(),
  });
}

const result = await client.mutation(api.inventory.importBackup, { rows });
console.log(`Imported ${result.imported} inventory rows.`);
if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
