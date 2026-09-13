import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { query } from "./_generated/server";

// Crafting-material stockpile per character. Only ever changed by smelting
// (see inventory.ts:setSmelted) — no direct mutation exported here.
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("resources").collect();
    return await Promise.all(
      rows.map(async (row) => {
        const character = await ctx.db.get(row.characterId);
        return { ...row, characterName: character?.name ?? "Unknown" };
      }),
    );
  },
});

// Adjusts a character's stockpile by the given deltas (negative to debit),
// creating the row on first use. `delta` values may be negative when
// reversing a smelt (restoring an item).
export async function adjustResources(
  ctx: MutationCtx,
  characterId: Id<"characters">,
  delta: { scrap: number; components: number },
) {
  const existing = await ctx.db
    .query("resources")
    .withIndex("by_character", (q) => q.eq("characterId", characterId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      scrap: existing.scrap + delta.scrap,
      components: existing.components + delta.components,
    });
  } else {
    await ctx.db.insert("resources", { characterId, scrap: delta.scrap, components: delta.components });
  }
}
