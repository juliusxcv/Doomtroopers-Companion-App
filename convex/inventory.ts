import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Global manifest across every character — matches the old app's "GLOBAL //
// ALL OPERATORS" inventory view. Not session-scoped: items persist for a
// character across every game night.
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("inventory").order("desc").collect();
    return await Promise.all(
      rows.map(async (row) => {
        const character = await ctx.db.get(row.characterId);
        return { ...row, characterName: character?.name ?? "Unknown" };
      }),
    );
  },
});

export const setSmelted = mutation({
  args: { inventoryId: v.id("inventory"), smelted: v.boolean() },
  handler: async (ctx, { inventoryId, smelted }) => {
    await ctx.db.patch(inventoryId, { smelted });
  },
});

const rarities = ["scrap", "common", "uncommon", "rare", "legendary"] as const;

// One-time import from the old app's loot_log backup (see
// scripts/migrate-inventory.mjs). Refuses to run twice so a re-run can't
// duplicate the manifest.
export const importBackup = mutation({
  args: {
    rows: v.array(
      v.object({
        characterId: v.id("characters"),
        itemName: v.string(),
        rarity: v.string(),
        source: v.string(),
        monsterId: v.optional(v.string()),
        smelted: v.boolean(),
        createdAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, { rows }) => {
    const existing = await ctx.db.query("inventory").first();
    if (existing) throw new Error("Inventory already has rows — refusing to re-import.");

    for (const row of rows) {
      if (!rarities.includes(row.rarity as (typeof rarities)[number])) {
        throw new Error(`Unknown rarity "${row.rarity}" on item "${row.itemName}".`);
      }
      await ctx.db.insert("inventory", { ...row, rarity: row.rarity as (typeof rarities)[number] });
    }
    return { imported: rows.length };
  },
});
