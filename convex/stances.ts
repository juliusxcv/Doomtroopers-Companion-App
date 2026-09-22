import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getChoice = query({
  args: { characterId: v.id("characters") },
  handler: async (ctx, { characterId }) => {
    const row = await ctx.db
      .query("activeStance")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .unique();
    return row?.choice ?? null;
  },
});

export const setChoice = mutation({
  args: { characterId: v.id("characters"), choice: v.string() },
  handler: async (ctx, { characterId, choice }) => {
    const row = await ctx.db
      .query("activeStance")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { choice, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("activeStance", { characterId, choice, updatedAt: Date.now() });
    }
  },
});
