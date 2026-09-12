import { v } from "convex/values";
import { RARITY } from "./schema";
import { mutation, query } from "./_generated/server";

const monsterContentFields = {
  monsterId: v.string(),
  code: v.string(),
  name: v.string(),
  blurb: v.optional(v.string()),
  organPool: v.array(v.string()),
  attemptsModifier: v.number(),
  identifiedScansRequired: v.number(),
  tierCount: v.number(),
  lootTable: v.array(v.object({ item: v.string(), rarity: RARITY })),
};

// Called by scripts/sync-monsters.mjs. `scanCount` is intentionally absent
// from monsterContentFields so a re-sync never resets real progression —
// only new monsters start at 0.
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

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("monsters").collect();
  },
});

const BASE_DROP_CHANCE = 0.5;
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
        if (Math.random() < BASE_DROP_CHANCE * mult) drops.push(entry);
      }
      if (drops.length === 0 && monster.lootTable.length > 0) {
        drops.push(monster.lootTable[Math.floor(Math.random() * monster.lootTable.length)]);
      }
    } else {
      for (const entry of monster.lootTable) {
        if (Math.random() < BASE_DROP_CHANCE * FAILURE_DROP_PENALTY) drops.push(entry);
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
