import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const STAT_KEY = v.union(
  v.literal("rc"),
  v.literal("cc"),
  v.literal("ap"),
  v.literal("mv"),
  v.literal("def"),
  v.literal("hp"),
  v.literal("inv"),
);

// Lowest value a stat may be adjusted down to — mirrors STAT_FLOOR in
// src/components/StatBlock.tsx. "N+" rolls (RC/CC/DEF) bottom out at 1+;
// everything else can reach 0.
const STAT_FLOOR = { rc: 1, cc: 1, def: 1, ap: 0, mv: 0, hp: 0, inv: 0 } as const;
const MAX_DELTA = 20;

export const forCharacter = query({
  args: { characterId: v.id("characters") },
  handler: async (ctx, { characterId }) => {
    return await ctx.db
      .query("statMods")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .take(20);
  },
});

// Nudges one stat up or down. The floor is enforced here against the real
// base value (parsed from the vault-authored string, e.g. "3+" → 3), not
// just in the UI, so two devices can't push a stat below what makes sense.
export const adjust = mutation({
  args: { characterId: v.id("characters"), unit: v.string(), stat: STAT_KEY, delta: v.number() },
  handler: async (ctx, { characterId, unit, stat, delta }) => {
    const character = await ctx.db.get(characterId);
    if (!character) throw new Error("Unknown character.");
    const stats = unit === "" ? character.stats : character.companions?.find((c) => c.name === unit)?.stats;
    if (!stats) throw new Error("No such stat block.");
    const base = parseInt(stats[stat] ?? "", 10);
    if (Number.isNaN(base)) throw new Error("This stat can't be adjusted.");

    const rows = await ctx.db
      .query("statMods")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .take(20);
    const row = rows.find((r) => r.unit === unit);

    const requested = (row?.deltas[stat] ?? 0) + Math.trunc(delta);
    const next = Math.max(STAT_FLOOR[stat] - base, Math.min(MAX_DELTA, Math.max(-MAX_DELTA, requested)));

    if (row) {
      await ctx.db.patch(row._id, { deltas: { ...row.deltas, [stat]: next } });
    } else {
      await ctx.db.insert("statMods", { characterId, unit, deltas: { [stat]: next } });
    }
  },
});

// Clears every adjustment on a character (their own card and companions').
export const reset = mutation({
  args: { characterId: v.id("characters") },
  handler: async (ctx, { characterId }) => {
    const rows = await ctx.db
      .query("statMods")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .take(20);
    for (const row of rows) await ctx.db.delete(row._id);
  },
});
