import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
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
  from: v.optional(v.string()),
  origin: v.optional(v.string()),
  dateStamp: v.optional(v.string()),
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
// only new entries start locked, unless the note itself declares
// `unlockedByDefault` (e.g. a reference-archive transmission that isn't
// meant to be gated at all) — that flag only affects the initial insert,
// never patched onto an existing entry, so a GM who later re-locks one
// manually is still respected across re-syncs.
export const sync = mutation({
  args: {
    entries: v.array(v.object({ ...entryContentFields, unlockedByDefault: v.optional(v.boolean()) })),
  },
  handler: async (ctx, { entries }) => {
    let created = 0;
    let updated = 0;
    const seenSlugs = new Set(entries.map((e) => e.slug));

    for (const { unlockedByDefault, ...entry } of entries) {
      const existing = await ctx.db
        .query("codex_entries")
        .withIndex("by_slug", (q) => q.eq("slug", entry.slug))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...entry, syncedAt: Date.now() });
        updated++;
      } else {
        await ctx.db.insert("codex_entries", {
          ...entry,
          unlocked: unlockedByDefault ?? false,
          syncedAt: Date.now(),
        });
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

// Tiered (Autopsy Report) entries unlock automatically from scan count —
// for BOTH GM and players. There's no manual GM override for these (unlike
// Archive/Mainframe/Security, where the GM toggle is the only unlock path),
// so GM doesn't get a spoiler view here: what's not yet scanned isn't shown
// to the GM either, same gating as players get.
async function resolveTieredEntry(ctx: QueryCtx, e: Doc<"codex_entries">) {
  const monster = e.monsterId ? await tierProgress(ctx, e.monsterId) : null;
  const tiers = e.tiers ?? [];
  const unlockedTierCount = monster
    ? computeUnlockedTierCount(monster.identifiedScansRequired, monster.scanCount, tiers.length)
    : 0;
  return {
    ...e,
    tiers: tiers.slice(0, unlockedTierCount),
    tierCount: tiers.length,
    unlockedTierCount,
    scanCount: monster?.scanCount ?? 0,
    unlocked: unlockedTierCount > 0,
  };
}

// GM sees full content for manually-toggled entries regardless of lock
// state; tiered entries are gated identically to the player view (see
// resolveTieredEntry).
export const listForGM = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("codex_entries").collect();
    return await Promise.all(
      entries.map((e) => (e.tiers && e.monsterId ? resolveTieredEntry(ctx, e) : e)),
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
        if (e.tiers && e.monsterId) return resolveTieredEntry(ctx, e);
        return e.unlocked
          ? e
          : { ...e, body: "", code: undefined, from: undefined, origin: undefined, dateStamp: undefined };
      }),
    );
  },
});

// Finds the Codex entry linked to a monster (its Autopsy Report) — used by
// the Bestiary's Stat Card to link back to the matching lore entry. Not
// gated by unlock state: Codex.tsx already shows a "not yet unlocked"
// message for a locked entry, which is informative on its own rather than
// something to hide the link behind.
export const findEntryByMonster = query({
  args: { monsterId: v.string() },
  handler: async (ctx, { monsterId }) => {
    const entry = await ctx.db
      .query("codex_entries")
      .filter((q) => q.eq(q.field("monsterId"), monsterId))
      .first();
    return entry ? { slug: entry.slug, title: entry.title } : null;
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
