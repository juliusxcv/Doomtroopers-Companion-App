import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    code: v.string(),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  players: defineTable({
    sessionId: v.id("sessions"),
    name: v.string(),
    role: v.union(v.literal("gm"), v.literal("player")),
    joinedAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // Seeded manually for Phase 1. Will eventually sync from a single
  // centralized "Loot Tables" note in the vault (Monster | Item | Weight),
  // not per-monster frontmatter — see project memory:
  // project-obsidian-vault-sync-learnings.
  loot_tables: defineTable({
    monsterSlug: v.string(),
    monsterName: v.string(),
    entries: v.array(v.object({ item: v.string(), weight: v.number() })),
  }).index("by_slug", ["monsterSlug"]),

  loot_drops: defineTable({
    sessionId: v.id("sessions"),
    monsterName: v.string(),
    item: v.string(),
    claimedBy: v.optional(v.id("players")),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // Synced from the vault's Published/ folder (see sync-codex script).
  // `unlocked` is campaign-wide, not tied to a session join-code, and is
  // deliberately preserved across re-syncs — only content fields get
  // overwritten when a note changes.
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
    unlocked: v.boolean(),
    syncedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_code", ["code"]),
});
