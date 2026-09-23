import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getValue = query({
  args: { characterId: v.id("characters") },
  handler: async (ctx, { characterId }) => {
    const row = await ctx.db
      .query("abilityResource")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .unique();
    return row?.value ?? 0;
  },
});

// Always +1 — both Faith and Wrecka are gained one point at a time (a turn
// starting, a single die landing on 6); the client never gets to pick an
// arbitrary amount. `cap` (Faith's 5, Wrecka has none) is enforced here,
// not just in the UI, same convention as statMods' floor.
export const gain = mutation({
  args: { characterId: v.id("characters"), cap: v.optional(v.number()) },
  handler: async (ctx, { characterId, cap }) => {
    const row = await ctx.db
      .query("abilityResource")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .unique();
    const current = row?.value ?? 0;
    const next = cap !== undefined ? Math.min(cap, current + 1) : current + 1;
    if (row) {
      await ctx.db.patch(row._id, { value: next, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("abilityResource", { characterId, value: next, updatedAt: Date.now() });
    }
    return next;
  },
});

export const spend = mutation({
  args: { characterId: v.id("characters"), cost: v.number() },
  handler: async (ctx, { characterId, cost }) => {
    const row = await ctx.db
      .query("abilityResource")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .unique();
    const current = row?.value ?? 0;
    if (current < cost) throw new Error("Not enough points.");
    await ctx.db.patch(row!._id, { value: current - cost, updatedAt: Date.now() });
    return current - cost;
  },
});

// Slabs' Wrecka points decay if he didn't shoot/fight during an activation —
// the app can't detect that on its own, so this is a manual reset the
// player taps themselves (see src/lib/abilityResources.ts's `manualClear`).
export const clear = mutation({
  args: { characterId: v.id("characters") },
  handler: async (ctx, { characterId }) => {
    const row = await ctx.db
      .query("abilityResource")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .unique();
    if (row) await ctx.db.patch(row._id, { value: 0, updatedAt: Date.now() });
  },
});
