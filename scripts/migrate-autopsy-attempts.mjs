// One-time historical backfill of the Operator Profile's "Autopsies
// Completed" stat. The old app never tracked autopsy attempts as their own
// event — its own "AUTOPSIES" counter (src/routes/players.tsx in the old
// repo) was actually just a raw loot_log row count due to a dead if/else
// branch, not a real attempt count.
//
// This reconstructs a better (but still approximate) estimate from the
// already-migrated `inventory` table (see migrate-inventory.mjs): rows
// dropped by the same character at the exact same instant came from one
// resolved Autopsy win, so grouping by (characterId, createdAt) gives one
// entry per historical win. Only wins that yielded at least one item left
// any trace — losses and zero-drop wins are lost to history — so this is a
// lower-bound estimate, not an exact count. The GM's character is excluded,
// matching submitResult's own exclusion of GM scans from real campaign
// progress.
//
// Usage: node scripts/migrate-autopsy-attempts.mjs

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

process.loadEnvFile(".env.local");

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("VITE_CONVEX_URL not found in .env.local — is `npx convex dev` running?");
  process.exit(1);
}
const client = new ConvexHttpClient(convexUrl);

const characters = await client.query(api.characters.list, {});
const gmCharacterId = characters.find((c) => c.isGM)?._id;
const nameById = new Map(characters.map((c) => [c._id, c.name]));

const rows = await client.query(api.inventory.listAll, {});

const clusters = new Map(); // `${characterId}::${createdAt}` -> { characterId, monsterId, createdAt }
for (const row of rows) {
  if (!row.monsterId) continue;
  if (row.characterId === gmCharacterId) continue;
  if (!row.source?.toLowerCase().startsWith("autopsy")) continue;
  const key = `${row.characterId}::${row.createdAt}`;
  if (!clusters.has(key)) {
    clusters.set(key, { characterId: row.characterId, monsterId: row.monsterId, createdAt: row.createdAt });
  }
}

const attempts = [...clusters.values()];
const result = await client.mutation(api.monsters.importHistoricalAttempts, { attempts });

console.log(
  `Imported ${result.imported} historical Autopsy win events (from ${rows.length} inventory rows, ${clusters.size} distinct timestamp clusters).`,
);

const byCharacter = new Map();
for (const a of attempts) {
  byCharacter.set(a.characterId, (byCharacter.get(a.characterId) ?? 0) + 1);
}
console.log("\nPer character:");
for (const [characterId, count] of byCharacter) {
  console.log(`  - ${nameById.get(characterId) ?? characterId}: ${count}`);
}
