import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getActive = query({
  args: { characterId: v.id("characters") },
  handler: async (ctx, { characterId }) => {
    const row = await ctx.db
      .query("abilityToggle")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .unique();
    return row?.active ?? false;
  },
});

export const setActive = mutation({
  args: { characterId: v.id("characters"), active: v.boolean() },
  handler: async (ctx, { characterId, active }) => {
    const row = await ctx.db
      .query("abilityToggle")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { active, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("abilityToggle", { characterId, active, updatedAt: Date.now() });
    }
  },
});
