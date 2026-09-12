// Syncs Published/ from an Obsidian vault into Convex's codex_entries table.
// Run on whichever machine currently has the vault on disk — the companion
// app itself never needs local vault access, only Convex.
//
// Usage: node scripts/sync-codex.mjs "<path-to-vault>"

import { ConvexHttpClient } from "convex/browser";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";
import { api } from "../convex/_generated/api.js";

process.loadEnvFile(".env.local");

const vaultPath = process.argv[2];
if (!vaultPath) {
  console.error("Usage: node scripts/sync-codex.mjs <path-to-vault>");
  process.exit(1);
}

const publishedDir = path.join(vaultPath, "Published");
if (!fs.existsSync(publishedDir)) {
  console.error(`No "Published" folder found at ${publishedDir}`);
  process.exit(1);
}

// The public Bestiary autopsy report notes don't carry `monster_id` yet
// (the private creature notes do). These 4 are the known display-name
// mismatches from the old app's vault-id-migration — prefer an explicit
// `monster_id` frontmatter field over this if one is ever added.
const AUTOPSY_MONSTER_ID_FALLBACK = {
  "Fleshspoil - Autopsy Report": "fleshspoil",
  "Spore Wretch - Autopsy Report": "sporewretch",
  "Undead Cadaver - Autopsy Report": "undead_legionnaire",
  "Undead Mutant - Autopsy Report": "necromutant",
};

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

const files = walk(publishedDir);
const entries = [];
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
  let monsterId;
  if (tiers) {
    monsterId = fm.monster_id ? String(fm.monster_id) : AUTOPSY_MONSTER_ID_FALLBACK[title];
    if (!monsterId) {
      warnings.push(`${relPath}: has LVL Autopsy sections but no monster_id link — tiers will never unlock.`);
    }
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
}

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("VITE_CONVEX_URL not found in .env.local — is `npx convex dev` running?");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);
const result = await client.mutation(api.codex.sync, { entries });

// This note's own tier count is the one authoritative source for how many
// LVL sections a creature has (see convex/monsters.ts setTierCount) — push
// it onto the linked monster so the Autopsy screen's progress bar agrees
// with what the Codex actually gates.
for (const entry of entries) {
  if (entry.tiers && entry.monsterId) {
    await client.mutation(api.monsters.setTierCount, {
      monsterId: entry.monsterId,
      tierCount: entry.tiers.length,
    });
  }
}

console.log(`Synced ${entries.length} entries (${result.created} new, ${result.updated} updated).`);

if (result.stale.length > 0) {
  console.log(`\n${result.stale.length} entries in Convex no longer found in the vault (not deleted automatically):`);
  for (const s of result.stale) console.log(`  - ${s}`);
}

if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
