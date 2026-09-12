import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const RARITY = v.union(
  v.literal("scrap"),
  v.literal("common"),
  v.literal("uncommon"),
  v.literal("rare"),
  v.literal("legendary"),
);

export default defineSchema({
  sessions: defineTable({
    code: v.string(),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  // The predefined campaign roster. Role (GM vs player) is derived from
  // isGM here, not stored per-session — one source of truth per character.
  characters: defineTable({
    name: v.string(),
    playerRealName: v.optional(v.string()),
    isGM: v.boolean(),
  }),

  players: defineTable({
    sessionId: v.id("sessions"),
    characterId: v.id("characters"),
    joinedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_character", ["sessionId", "characterId"]),

  // Synced from private creature notes (World Lore/Beastiary/**, NOT
  // Published/) — see scripts/sync-monsters.mjs. `scanCount` is preserved
  // across re-syncs just like codex_entries.unlocked, since it's real
  // progression, not authored content. Drop-chance/tier balance data from the
  // old app's `monster_loot` table didn't survive (source Supabase project
  // was deleted before it got backed up) — item rarities here were
  // reconstructed from the old loot_log backup's historical drops instead.
  monsters: defineTable({
    monsterId: v.string(),
    code: v.string(),
    name: v.string(),
    blurb: v.optional(v.string()),
    organPool: v.array(v.string()),
    attemptsModifier: v.number(),
    identifiedScansRequired: v.number(),
    tierCount: v.number(),
    lootTable: v.array(v.object({ item: v.string(), rarity: RARITY })),
    scanCount: v.number(),
  }).index("by_monster_id", ["monsterId"]),

  // Campaign-wide (not session-scoped) — items persist for a character across
  // every session. Ported 1:1 from the old app's `loot_log` table; see
  // project memory project-lovable-app-reference and scripts/migrate-inventory.mjs.
  // `smelted` marks an item converted to crafting resources; it stays in the
  // log rather than being deleted, matching the old app's "restore" toggle.
  inventory: defineTable({
    characterId: v.id("characters"),
    itemName: v.string(),
    rarity: RARITY,
    source: v.string(),
    monsterId: v.optional(v.string()),
    smelted: v.boolean(),
    createdAt: v.number(),
  }).index("by_character", ["characterId"]),

  // Synced from the vault's Published/ folder (see sync-codex script).
  // `unlocked` is campaign-wide, not tied to a session join-code, and is
  // deliberately preserved across re-syncs — only content fields get
  // overwritten when a note changes.
  //
  // Autopsy Report entries are a special case: their body is split into
  // `tiers` (one per "## LVL N Autopsy:" section) instead of using `body` +
  // `unlocked` directly. Unlock state for those is computed from the linked
  // monster's scanCount at query time, not stored per-entry — `monsterId`
  // is how that link is made (see scripts/sync-codex.mjs and convex/codex.ts).
  codex_entries: defineTable({
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
    unlocked: v.boolean(),
    syncedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_code", ["code"]),
});
