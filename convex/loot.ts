import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function pickWeighted(entries: { item: string; weight: number }[]): string {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return entries[entries.length - 1].item;
}

export const listMonsters = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("loot_tables").collect();
  },
});

export const listForSession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const drops = await ctx.db
      .query("loot_drops")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .collect();

    return await Promise.all(
      drops.map(async (drop) => {
        const claimant = drop.claimedBy ? await ctx.db.get(drop.claimedBy) : null;
        const character = claimant ? await ctx.db.get(claimant.characterId) : null;
        return { ...drop, claimedByName: character?.name };
      }),
    );
  },
});

// Called when a player completes the scan/dissect minigame on a body.
export const resolve = mutation({
  args: { sessionId: v.id("sessions"), monsterSlug: v.string() },
  handler: async (ctx, { sessionId, monsterSlug }) => {
    const table = await ctx.db
      .query("loot_tables")
      .withIndex("by_slug", (q) => q.eq("monsterSlug", monsterSlug))
      .unique();
    if (!table) throw new Error("Unknown loot table.");

    const item = pickWeighted(table.entries);
    const dropId = await ctx.db.insert("loot_drops", {
      sessionId,
      monsterName: table.monsterName,
      item,
      createdAt: Date.now(),
    });
    return { dropId, item, monsterName: table.monsterName };
  },
});

export const claim = mutation({
  args: { dropId: v.id("loot_drops"), playerId: v.id("players") },
  handler: async (ctx, { dropId, playerId }) => {
    const drop = await ctx.db.get(dropId);
    if (!drop) throw new Error("That loot drop no longer exists.");
    if (drop.claimedBy) throw new Error("Someone already claimed that.");
    await ctx.db.patch(dropId, { claimedBy: playerId });
  },
});

// Dev-only seed for Phase 1, before the Obsidian sync (Phase 3) writes real
// loot tables. Safe to re-run: skips monsters that already exist.
export const seedTestData = mutation({
  args: {},
  handler: async (ctx) => {
    const testTables = [
      {
        monsterSlug: "miner-zombie",
        monsterName: "Miner Zombie",
        entries: [
          { item: "Rusty Shiv", weight: 5 },
          { item: "Mining Permit", weight: 2 },
          { item: "Corroded Lantern", weight: 1 },
        ],
      },
      {
        monsterSlug: "security-drone",
        monsterName: "Security Drone",
        entries: [
          { item: "Scrap Servo", weight: 4 },
          { item: "Access Chip", weight: 1 },
        ],
      },
    ];

    for (const table of testTables) {
      const existing = await ctx.db
        .query("loot_tables")
        .withIndex("by_slug", (q) => q.eq("monsterSlug", table.monsterSlug))
        .unique();
      if (!existing) await ctx.db.insert("loot_tables", table);
    }
  },
});
