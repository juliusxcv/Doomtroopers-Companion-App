import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";

const entryContentFields = {
  slug: v.string(),
  title: v.string(),
  categoryPath: v.array(v.string()),
  type: v.optional(v.string()),
  status: v.optional(v.string()),
  code: v.optional(v.string()),
  cost: v.optional(v.number()),
  lvl: v.optional(v.string()),
  body: v.string(),
  tiers: v.optional(v.array(v.object({ body: v.string() }))),
  monsterId: v.optional(v.string()),
};

// Mirrors the old app's autopsy-tiers.ts curve exactly (tier 0 = base,
// tier 1 = 15x, tier 2 = 45x, tier 3 = 120x) so ported scan-count data means
// the same thing here as it did there.
const TIER_MULTIPLIERS = [1, 15, 45, 120];

function tierThreshold(base: number, tierIndex: number): number {
  const mult = TIER_MULTIPLIERS[tierIndex] ?? TIER_MULTIPLIERS[TIER_MULTIPLIERS.length - 1];
  return Math.max(0, Math.trunc(base)) * mult;
}

function computeUnlockedTierCount(base: number, scanCount: number, tierCount: number): number {
  let unlocked = 0;
  for (let i = 0; i < tierCount; i++) {
    if (scanCount >= tierThreshold(base, i)) unlocked = i + 1;
    else break;
  }
  return unlocked;
}

// Called by scripts/sync-codex.mjs. `unlocked` is intentionally absent from
// entryContentFields so a re-sync never touches it on existing entries —
// only new entries start locked.
export const sync = mutation({
  args: { entries: v.array(v.object(entryContentFields)) },
  handler: async (ctx, { entries }) => {
    let created = 0;
    let updated = 0;
    const seenSlugs = new Set(entries.map((e) => e.slug));

    for (const entry of entries) {
      const existing = await ctx.db
        .query("codex_entries")
        .withIndex("by_slug", (q) => q.eq("slug", entry.slug))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...entry, syncedAt: Date.now() });
        updated++;
      } else {
        await ctx.db.insert("codex_entries", { ...entry, unlocked: false, syncedAt: Date.now() });
        created++;
      }
    }

    const all = await ctx.db.query("codex_entries").collect();
    const stale = all.filter((e) => !seenSlugs.has(e.slug)).map((e) => e.slug);

    return { created, updated, stale };
  },
});

function tierProgress(ctx: QueryCtx, monsterId: string) {
  return ctx.db
    .query("monsters")
    .withIndex("by_monster_id", (q) => q.eq("monsterId", monsterId))
    .unique();
}

// GM sees every tier's full text, plus how many are actually unlocked (tier
// unlock is automatic, computed from scan count — not the GM toggle).
export const listForGM = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("codex_entries").collect();
    return await Promise.all(
      entries.map(async (e) => {
        if (!e.tiers || !e.monsterId) return e;
        const monster = await tierProgress(ctx, e.monsterId);
        const unlockedTierCount = monster
          ? computeUnlockedTierCount(monster.identifiedScansRequired, monster.scanCount, e.tiers.length)
          : 0;
        return { ...e, tierCount: e.tiers.length, unlockedTierCount, scanCount: monster?.scanCount ?? 0 };
      }),
    );
  },
});

// Players see every entry's existence (so the Codex tree shows what's out
// there) but locked entries/tiers have their content stripped — a locked
// tier's text never reaches the client, same principle as the old app's
// server-side gate.
export const listForPlayers = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("codex_entries").collect();
    return await Promise.all(
      entries.map(async (e) => {
        if (e.tiers && e.monsterId) {
          const monster = await tierProgress(ctx, e.monsterId);
          const unlockedTierCount = monster
            ? computeUnlockedTierCount(monster.identifiedScansRequired, monster.scanCount, e.tiers.length)
            : 0;
          return {
            ...e,
            tiers: e.tiers.slice(0, unlockedTierCount),
            tierCount: e.tiers.length,
            unlockedTierCount,
            unlocked: unlockedTierCount > 0,
          };
        }
        return e.unlocked ? e : { ...e, body: "", code: undefined };
      }),
    );
  },
});

export const setUnlocked = mutation({
  args: { entryId: v.id("codex_entries"), unlocked: v.boolean() },
  handler: async (ctx, { entryId, unlocked }) => {
    await ctx.db.patch(entryId, { unlocked });
  },
});

// Players type in a code they found in-fiction (e.g. a Security handout's
// access code); if it matches a note's `code` frontmatter, that entry
// unlocks for the whole session. Codes are compared case-insensitively.
export const redeemCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = code.trim().toUpperCase();
    const entry = await ctx.db
      .query("codex_entries")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique();

    // Tiered (Autopsy Report) entries unlock only via scan progress — their
    // `code` is just the specimen designation shown in the minigame, not a
    // redeemable access code, so patching `unlocked` here would silently do
    // nothing (the query recomputes it from scanCount regardless).
    if (!entry || entry.tiers !== undefined) return { status: "invalid" as const };
    if (entry.unlocked) return { status: "already-unlocked" as const, title: entry.title };

    await ctx.db.patch(entry._id, { unlocked: true });
    return { status: "unlocked" as const, title: entry.title };
  },
});
