// One-time import of the old Lovable app's biologis_monster_progress backup
// into Convex's monsters.scanCount — the real scan-count history behind
// each creature's Codex autopsy-tier progression. Source Supabase project
// is gone, so this reads the local JSON snapshot, not a live API.
//
// Only ever raises a monster's scanCount (see monsters:importScanProgress),
// so it's safe to run again later without erasing progress made since.
//
// Usage: node scripts/migrate-scan-progress.mjs ["<path-to-supabase-backup-folder>"]

import { ConvexHttpClient } from "convex/browser";
import fs from "node:fs";
import path from "node:path";
import { api } from "../convex/_generated/api.js";

process.loadEnvFile(".env.local");

const backupDir =
  process.argv[2] ?? "C:\\Users\\juliu\\Documents\\Doomtroopers\\supabase-backup-20260808-120832";
const progressPath = path.join(backupDir, "tables", "biologis_monster_progress.json");
if (!fs.existsSync(progressPath)) {
  console.error(`No biologis_monster_progress.json found at ${progressPath}`);
  process.exit(1);
}

const oldRows = JSON.parse(fs.readFileSync(progressPath, "utf8"));
const rows = oldRows.map((r) => ({ monsterId: r.monster_id, scanCount: r.scan_count }));

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("VITE_CONVEX_URL not found in .env.local — is `npx convex dev` running?");
  process.exit(1);
}
const client = new ConvexHttpClient(convexUrl);
const result = await client.mutation(api.monsters.importScanProgress, { rows });

console.log(`Applied historical scan progress: ${result.updated} monster(s) updated, ${result.skipped} not found in the current sync.`);
