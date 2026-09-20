import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

// Mirrors MIN_PERIL_LEVEL/MAX_PERIL_LEVEL in src/lib/perils.ts — one column
// (one extra d6) per level, 1D6 through 8D6.
const MIN_LEVEL = 1;
const MAX_LEVEL = 8;

function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.trunc(level)));
}

// Current gauge level (defaults to 1 if the psyker has never set one) plus a
// short recent-rolls trail, so the Peril screen and anyone else glancing at
// it can see the last few checks without a second round trip.
export const getState = query({
  args: { characterId: v.id("characters") },
  handler: async (ctx, { characterId }) => {
    const gauge = await ctx.db
      .query("perilGauge")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .unique();
    const rolls = await ctx.db
      .query("perilRolls")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .order("desc")
      .take(5);
    return { level: gauge?.level ?? MIN_LEVEL, rolls };
  },
});

export const setLevel = mutation({
  args: { characterId: v.id("characters"), level: v.number() },
  handler: async (ctx, { characterId, level }) => {
    const clamped = clampLevel(level);
    const existing = await ctx.db
      .query("perilGauge")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { level: clamped, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("perilGauge", { characterId, level: clamped, updatedAt: Date.now() });
    }
    return clamped;
  },
});

// Rolls the psyker's current gauge level in d6 server-side (so the result
// can't be influenced client-side) and logs it. Which named Peril the total
// resolves to is looked up client-side from the static table — see
// src/lib/perils.ts. `actingCharacterId` is whoever is actually pressing the
// button (Vex herself, or the GM overseeing her) — re-derived server-side
// (never trusted from the client) so a GM using this screen to check
// something doesn't pollute Vex's real Peril log, matching the same
// GM-exclusion convention as monsters.submitResult/cogitatorPoints.award.
export const roll = mutation({
  args: { characterId: v.id("characters"), actingCharacterId: v.id("characters") },
  handler: async (ctx, { characterId, actingCharacterId }) => {
    const actingCharacter = await ctx.db.get(actingCharacterId);
    if (!actingCharacter) throw new Error("Unknown character.");

    const gauge = await ctx.db
      .query("perilGauge")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .unique();
    const level = gauge?.level ?? MIN_LEVEL;
    const dice = Array.from({ length: level }, () => Math.floor(Math.random() * 6) + 1);
    const total = dice.reduce((sum, d) => sum + d, 0);
    if (!actingCharacter.isGM) {
      await ctx.db.insert("perilRolls", { characterId, level, dice, total, createdAt: Date.now() });
    }
    return { level, dice, total };
  },
});

// Admin cleanup only — no in-app UI calls this. Lets a bad/test roll be
// pruned from the log via `npx convex run`.
export const deleteRoll = internalMutation({
  args: { rollId: v.id("perilRolls") },
  handler: async (ctx, { rollId }) => {
    await ctx.db.delete(rollId);
  },
});
