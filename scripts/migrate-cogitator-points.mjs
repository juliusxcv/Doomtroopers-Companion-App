// One-time historical carry-forward of the old app's shared Cogitator
// points pool and the 8 real, paid Mainframe unlocks it bought. Recovered
// from the old Supabase backup's points_ledger/codex_unlocks tables (see
// project memory / plan for the full historical row dump) — not re-derived
// from anything live, since the old backend is gone.
//
// Excluded on purpose: 3 historical unlocks that were admin/GM bypasses and
// never actually spent points (one no longer maps to a live vault file,
// the other two are Security-section — that's a separate, already-working
// redeemCode flow, out of scope here).
//
// The real historical net balance was 155 (72 earn rows − 8 spend rows).
// One of those 8 spends (Vehicle Manifest) was a bug: its `cost: "50"`
// frontmatter was quoted, and the old app's stricter type check silently
// treated that as free. The GM chose to retroactively correct this rather
// than carry the bug forward, so the seed here is 155 − 50 = 105, and
// Vehicle Manifest is unlocked for free alongside the other 7 (it was
// already free historically — this migration doesn't charge for it twice,
// it just stops pretending the party has 50 more points than they should).
//
// Must run AFTER `node scripts/sync-codex.mjs <vault>` has populated
// codex_entries, since it looks up each unlock by slug.
//
// Usage: node scripts/migrate-cogitator-points.mjs

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

process.loadEnvFile(".env.local");

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("VITE_CONVEX_URL not found in .env.local — is `npx convex dev` running?");
  process.exit(1);
}
const client = new ConvexHttpClient(convexUrl);

const STARTING_BALANCE = 105;

// Slug must match scripts/sync-codex.mjs's slugify(path.join(relDir, filename))
// for a frontmatter-less note — same function, copied here rather than
// imported since this script runs standalone against the deployed API.
function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MAINFRAME_FILES = [
  "ADMIN-PROT - Habitation Block Sigma",
  "RND-PROT - Atmospheric Regulation",
  "SEC-PROT - Encounter Record 11-DELTA",
  "ADMIN-PROT - CHAPEL ANNOUNCEMENT",
  "SEC-PROT - SECURITY INCIDENT – MINOR", // en dash, must match the vault filename exactly
  "MAINT-PROT - Plasma Core Operations",
  "SEC-PROT - INQ VU 1",
  "LOG-PROT - Vehicle Manifest",
];

// relDir is "CODEX/Mainframe" (Published/ is the sync root, not Published/CODEX/) —
// confirmed against the live deployment's actual synced slugs.
const slugs = MAINFRAME_FILES.map((filename) => slugify(`CODEX/Mainframe/${filename}`));

const result = await client.mutation(api.cogitatorPoints.importHistorical, {
  startingBalance: STARTING_BALANCE,
  slugs,
});

console.log(`Seeded ${result.seeded} points, unlocked ${result.unlocked.length}/${MAINFRAME_FILES.length} Mainframe entries.`);
for (const slug of result.unlocked) console.log(`  - ${slug}`);
