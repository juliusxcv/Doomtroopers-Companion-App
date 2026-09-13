import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { adjustResources } from "./resources";

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

// Smelting credits the item's scrapYield/componentsYield (from the monster
// it dropped from) to the owning character's resources; restoring reverses
// exactly what was granted, captured on the row at smelt time so a later
// change to the monster's lootTable can't cause drift on restore.
export const setSmelted = mutation({
  args: { inventoryId: v.id("inventory"), smelted: v.boolean() },
  handler: async (ctx, { inventoryId, smelted }) => {
    const row = await ctx.db.get(inventoryId);
    if (!row) throw new Error("Unknown inventory item.");
    if (smelted === row.smelted) return;

    if (smelted) {
      let scrapYield = 0;
      let componentsYield = 0;
      const monsterId = row.monsterId;
      if (monsterId) {
        const monster = await ctx.db
          .query("monsters")
          .withIndex("by_monster_id", (q) => q.eq("monsterId", monsterId))
          .unique();
        const entry = monster?.lootTable.find((e) => e.item.toLowerCase() === row.itemName.toLowerCase());
        if (entry) {
          scrapYield = entry.scrapYield;
          componentsYield = entry.componentsYield;
        }
      }
      await adjustResources(ctx, row.characterId, { scrap: scrapYield, components: componentsYield });
      await ctx.db.patch(inventoryId, { smelted: true, smeltedScrap: scrapYield, smeltedComponents: componentsYield });
    } else {
      const scrapYield = row.smeltedScrap ?? 0;
      const componentsYield = row.smeltedComponents ?? 0;
      await adjustResources(ctx, row.characterId, { scrap: -scrapYield, components: -componentsYield });
      await ctx.db.patch(inventoryId, { smelted: false, smeltedScrap: undefined, smeltedComponents: undefined });
    }
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
