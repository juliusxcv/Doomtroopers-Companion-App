import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

// Get-or-create the one-row balance and apply a delta — mirrors
// resources.ts's adjustResources, just with no characterId to key on since
// this pool is shared party-wide, not per-character.
async function creditPoints(ctx: MutationCtx, delta: number): Promise<number> {
  const existing = await ctx.db.query("cogitatorPoints").first();
  if (existing) {
    const next = existing.points + delta;
    await ctx.db.patch(existing._id, { points: next, updatedAt: Date.now() });
    return next;
  }
  const next = delta;
  await ctx.db.insert("cogitatorPoints", { points: next, updatedAt: Date.now() });
  return next;
}

export const getBalance = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("cogitatorPoints").first())?.points ?? 0,
});

// Called once per cleared Cogitator Scanner stage. GM status is re-derived
// from the character doc server-side (not trusted from the client) so the
// GM's test runs never bank real party points, matching the same exclusion
// monsters.ts:submitResult applies to autopsyAttempts/inventory.
export const award = mutation({
  args: { characterId: v.id("characters"), amount: v.number(), reason: v.string() },
  handler: async (ctx, { characterId, amount, reason }) => {
    const character = await ctx.db.get(characterId);
    if (!character) throw new Error("Unknown character.");
    if (character.isGM) return (await ctx.db.query("cogitatorPoints").first())?.points ?? 0;
    if (amount <= 0) throw new Error("Invalid amount.");

    const balance = await creditPoints(ctx, amount);
    await ctx.db.insert("cogitatorPointsLedger", {
      delta: amount,
      reason: reason.slice(0, 120),
      characterId,
      createdAt: Date.now(),
    });
    return balance;
  },
});

// Atomic check-and-deduct + unlock for a Mainframe codex entry. Cost is
// read from entry.cost server-side (never trust a client-supplied cost).
// No explicit row lock is needed the way a Postgres RPC would need one — a
// Convex mutation is already one serializable transaction, so two players
// unlocking the same entry at once can't both win the read-then-write race.
export const spendAndUnlockMainframe = mutation({
  args: { characterId: v.id("characters"), entryId: v.id("codex_entries") },
  handler: async (ctx, { characterId, entryId }) => {
    const character = await ctx.db.get(characterId);
    if (!character) throw new Error("Unknown character.");
    const entry = await ctx.db.get(entryId);
    if (!entry) throw new Error("Unknown codex entry.");
    if (entry.cost === undefined) throw new Error("This entry has no unlock cost.");

    const currentBalance = (await ctx.db.query("cogitatorPoints").first())?.points ?? 0;
    if (entry.unlocked) return { ok: true as const, alreadyUnlocked: true, balance: currentBalance };
    // GM preview-only — enforced server-side, not just skipped client-side.
    if (character.isGM) return { ok: true as const, preview: true, balance: currentBalance };
    if (currentBalance < entry.cost) {
      throw new Error(`Insufficient points: have ${currentBalance}, need ${entry.cost}.`);
    }

    const balance = await creditPoints(ctx, -entry.cost);
    await ctx.db.patch(entryId, { unlocked: true });
    await ctx.db.insert("cogitatorPointsLedger", {
      delta: -entry.cost,
      reason: `mainframe-unlock:${entry.slug}`,
      characterId,
      createdAt: Date.now(),
    });
    return { ok: true as const, balance };
  },
});

// One-time historical carry-forward — see scripts/migrate-cogitator-points.mjs.
// Refuses to run twice, same idempotency guard as monsters.importHistoricalAttempts.
export const importHistorical = mutation({
  args: {
    startingBalance: v.number(),
    slugs: v.array(v.string()),
  },
  handler: async (ctx, { startingBalance, slugs }) => {
    const existingPoints = await ctx.db.query("cogitatorPoints").first();
    const existingLedger = await ctx.db.query("cogitatorPointsLedger").first();
    if (existingPoints || existingLedger) {
      throw new Error("cogitatorPoints already seeded — refusing to re-import.");
    }

    await ctx.db.insert("cogitatorPoints", { points: startingBalance, updatedAt: Date.now() });
    await ctx.db.insert("cogitatorPointsLedger", {
      delta: startingBalance,
      reason: "historical-carry-forward",
      createdAt: Date.now(),
    });

    const unlocked: string[] = [];
    for (const slug of slugs) {
      const entry = await ctx.db
        .query("codex_entries")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (!entry) throw new Error(`No codex entry with slug "${slug}" — run sync-codex.mjs first?`);
      await ctx.db.patch(entry._id, { unlocked: true });
      await ctx.db.insert("cogitatorPointsLedger", {
        delta: 0,
        reason: `historical-unlock:${entry.slug}`,
        createdAt: Date.now(),
      });
      unlocked.push(slug);
    }
    return { seeded: startingBalance, unlocked };
  },
});
