import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { RARITY, WEAPON } from "./schema";
import { mutation, query } from "./_generated/server";

const monsterContentFields = {
  monsterId: v.string(),
  code: v.string(),
  name: v.string(),
  blurb: v.optional(v.string()),
  organPool: v.array(v.string()),
  attemptsModifier: v.number(),
  identifiedScansRequired: v.number(),
  lootTable: v.array(
    v.object({
      item: v.string(),
      rarity: RARITY,
      dropChance: v.number(),
      scrapYield: v.number(),
      componentsYield: v.number(),
    }),
  ),
  tierCount: v.number(),
  loadouts: v.optional(
    v.array(
      v.object({
        name: v.string(),
        stats: v.object({
          rc: v.string(),
          cc: v.string(),
          ap: v.string(),
          mv: v.string(),
          def: v.string(),
          hp: v.string(),
        }),
        weapons: v.object({ ranged: v.array(WEAPON), melee: v.array(WEAPON) }),
      }),
    ),
  ),
  abilities: v.optional(v.array(v.object({ name: v.string(), description: v.string() }))),
};

// Called by scripts/sync-codex.mjs — the same public Bestiary note that
// feeds codex_entries also feeds this, in the same pass, so tierCount here
// is always exactly `tiers.length` from that note. `scanCount` is
// intentionally absent from monsterContentFields so a re-sync never resets
// real progression — only new monsters start at 0.
export const sync = mutation({
  args: { monsters: v.array(v.object(monsterContentFields)) },
  handler: async (ctx, { monsters }) => {
    let created = 0;
    let updated = 0;
    for (const monster of monsters) {
      const existing = await ctx.db
        .query("monsters")
        .withIndex("by_monster_id", (q) => q.eq("monsterId", monster.monsterId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, monster);
        updated++;
      } else {
        await ctx.db.insert("monsters", { ...monster, scanCount: 0 });
        created++;
      }
    }
    return { created, updated };
  },
});

// One-time historical catch-up from the old app's biologis_monster_progress
// backup (see scripts/migrate-scan-progress.mjs). Only ever raises a
// monster's scanCount, never lowers it — safe to re-run at any point without
// erasing real progress made since.
export const importScanProgress = mutation({
  args: { rows: v.array(v.object({ monsterId: v.string(), scanCount: v.number() })) },
  handler: async (ctx, { rows }) => {
    let updated = 0;
    let skipped = 0;
    for (const row of rows) {
      const monster = await ctx.db
        .query("monsters")
        .withIndex("by_monster_id", (q) => q.eq("monsterId", row.monsterId))
        .unique();
      if (!monster) {
        skipped++;
        continue;
      }
      if (row.scanCount > monster.scanCount) {
        await ctx.db.patch(monster._id, { scanCount: row.scanCount });
        updated++;
      }
    }
    return { updated, skipped };
  },
});

function isIdentified(m: Doc<"monsters">): boolean {
  return m.identifiedScansRequired > 0 && m.scanCount >= m.identifiedScansRequired;
}

// Stat Card content (loadouts/abilities) is gated behind the same
// threshold as LVL 1 Autopsy — i.e. identification — for both GM and
// players, same "no manual override" rule as the Codex's scan-gated tiers
// (see convex/codex.ts). A locked creature's real stats never reach the
// client, not just hidden client-side.
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const monsters = await ctx.db.query("monsters").collect();
    return monsters.map((m) => (isIdentified(m) ? m : { ...m, loadouts: undefined, abilities: undefined }));
  },
});

// Loss-case drops use each item's own chance (see lootTable[].dropChance),
// scaled way down — a ruined specimen still occasionally yields scraps.
const FAILURE_DROP_PENALTY = 0.1;

// Attempts allowed before a specimen is ruined. Kept identical on the client
// (for the attempts-left display) and here (for the cleanliness roll) —
// see src/components/Autopsy.tsx.
function attemptsAllowed(organPoolLength: number, attemptsModifier: number): number {
  return Math.max(2, organPoolLength + attemptsModifier);
}

export const submitResult = mutation({
  args: {
    monsterId: v.string(),
    characterId: v.id("characters"),
    won: v.boolean(),
    attemptsUsed: v.number(),
  },
  handler: async (ctx, { monsterId, characterId, won, attemptsUsed }) => {
    const monster = await ctx.db
      .query("monsters")
      .withIndex("by_monster_id", (q) => q.eq("monsterId", monsterId))
      .unique();
    if (!monster) throw new Error("Unknown monster.");

    const character = await ctx.db.get(characterId);
    if (!character) throw new Error("Unknown character.");

    const allowed = attemptsAllowed(monster.organPool.length, monster.attemptsModifier);
    const cleanliness = Math.max(0, Math.min(1, 1 - (attemptsUsed - 1) / allowed));

    const drops: { item: string; rarity: (typeof monster.lootTable)[number]["rarity"] }[] = [];
    let scanCount = monster.scanCount;

    if (won) {
      scanCount = monster.scanCount + 1;
      await ctx.db.patch(monster._id, { scanCount });
      const mult = 0.4 + cleanliness * 0.6;
      for (const entry of monster.lootTable) {
        if (Math.random() < (entry.dropChance / 100) * mult) drops.push({ item: entry.item, rarity: entry.rarity });
      }
      if (drops.length === 0 && monster.lootTable.length > 0) {
        const entry = monster.lootTable[Math.floor(Math.random() * monster.lootTable.length)];
        drops.push({ item: entry.item, rarity: entry.rarity });
      }
    } else {
      for (const entry of monster.lootTable) {
        if (Math.random() < (entry.dropChance / 100) * FAILURE_DROP_PENALTY) {
          drops.push({ item: entry.item, rarity: entry.rarity });
        }
      }
    }

    // The GM's own character never logs real inventory, matching the old
    // app's admin-account exclusion.
    if (!character.isGM) {
      for (const drop of drops) {
        await ctx.db.insert("inventory", {
          characterId,
          itemName: drop.item,
          rarity: drop.rarity,
          source: `Autopsy / ${monster.code}`,
          monsterId: monster.monsterId,
          smelted: false,
          createdAt: Date.now(),
        });
      }
    }

    return { drops, scanCount };
  },
});
