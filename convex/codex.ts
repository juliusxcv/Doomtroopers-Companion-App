import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
};

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

// GM sees everything, locked or not — needed to decide what to unlock.
export const listForGM = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("codex_entries").collect();
  },
});

// Players see every entry's existence (so the Codex tree shows what's out
// there) but locked entries have their content stripped.
export const listForPlayers = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("codex_entries").collect();
    return all.map((e) => (e.unlocked ? e : { ...e, body: "", code: undefined }));
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

    if (!entry) return { status: "invalid" as const };
    if (entry.unlocked) return { status: "already-unlocked" as const, title: entry.title };

    await ctx.db.patch(entry._id, { unlocked: true });
    return { status: "unlocked" as const, title: entry.title };
  },
});
