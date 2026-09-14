import { v } from "convex/values";
import { ABILITY, COMPANION, STATS, WEAPONS } from "./schema";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("characters").collect();
  },
});

// Shared by getProfile/listProfiles: roster fields + stats/weapons/
// abilities/dossier (if authored) + campaign stats computed from real play
// data (not vault content — these change during the session).
async function computeProfile(ctx: QueryCtx, character: Doc<"characters">) {
  const characterId = character._id;
  const attempts = await ctx.db
    .query("autopsyAttempts")
    .withIndex("by_character", (q) => q.eq("characterId", characterId))
    .collect();
  const resourceRow = await ctx.db
    .query("resources")
    .withIndex("by_character", (q) => q.eq("characterId", characterId))
    .unique();
  const itemsRecovered = (
    await ctx.db
      .query("inventory")
      .withIndex("by_character", (q) => q.eq("characterId", characterId))
      .collect()
  ).length;

  return {
    ...character,
    autopsiesCompleted: attempts.filter((a) => a.won).length,
    itemsRecovered,
    scrap: resourceRow?.scrap ?? 0,
    components: resourceRow?.components ?? 0,
  };
}

export const getProfile = query({
  args: { characterId: v.id("characters") },
  handler: async (ctx, { characterId }) => {
    const character = await ctx.db.get(characterId);
    if (!character) return null;
    return await computeProfile(ctx, character);
  },
});

// Every roster member's full profile — powers the Operator Profile's
// "browse other operators" list (see src/components/PlayerProfile.tsx).
export const listProfiles = query({
  args: {},
  handler: async (ctx) => {
    const characters = await ctx.db.query("characters").collect();
    return await Promise.all(characters.map((c) => computeProfile(ctx, c)));
  },
});

// Called by scripts/sync-codex.mjs — vault notes under Published/CODEX/
// Characters/ with a `character: "<exact name>"` frontmatter field. Unlike
// monsters.sync, this only patches rows that already exist in the roster
// (characters are seeded once via seedRoster, never created by vault sync)
// — a name with no match is reported back as a warning instead of silently
// creating an orphan row.
export const syncStats = mutation({
  args: {
    characters: v.array(
      v.object({
        name: v.string(),
        stats: v.optional(STATS),
        weapons: v.optional(WEAPONS),
        abilities: v.optional(v.array(ABILITY)),
        companions: v.optional(v.array(COMPANION)),
        dossier: v.optional(v.string()),
        videoId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { characters }) => {
    let updated = 0;
    const unmatched: string[] = [];
    for (const c of characters) {
      const existing = await ctx.db
        .query("characters")
        .filter((q) => q.eq(q.field("name"), c.name))
        .unique();
      if (!existing) {
        unmatched.push(c.name);
        continue;
      }
      await ctx.db.patch(existing._id, {
        stats: c.stats,
        weapons: c.weapons,
        abilities: c.abilities,
        companions: c.companions,
        dossier: c.dossier,
        videoId: c.videoId,
      });
      updated++;
    }
    return { updated, unmatched };
  },
});

// The real campaign roster. Idempotent — skips names that already exist,
// so it's safe to re-run against a fresh deployment or after adding a row.
export const seedRoster = mutation({
  args: {},
  handler: async (ctx) => {
    const roster = [
      { name: "Lord Inquisitor Seraphina Valeria", playerRealName: "Julius", isGM: true },
      { name: "ALB-XXIII", playerRealName: "Silvan", isGM: false },
      { name: "Gideon Rook", playerRealName: "Alexander", isGM: false },
      { name: "Helbrecht Nullis", playerRealName: "Timo", isGM: false },
      { name: "Isabella Alderidge", playerRealName: "Gion", isGM: false },
      { name: "Vexilia Thornkell", playerRealName: "Lorenz", isGM: false },
      { name: "Slabs", playerRealName: "Alessandro", isGM: false },
    ];

    let created = 0;
    for (const character of roster) {
      const existing = await ctx.db
        .query("characters")
        .filter((q) => q.eq(q.field("name"), character.name))
        .unique();
      if (!existing) {
        await ctx.db.insert("characters", character);
        created++;
      }
    }
    return { created };
  },
});
