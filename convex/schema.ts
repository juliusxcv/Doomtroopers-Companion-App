import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const RARITY = v.union(
  v.literal("scrap"),
  v.literal("common"),
  v.literal("uncommon"),
  v.literal("rare"),
  v.literal("legendary"),
);

export const WEAPON = v.object({
  name: v.string(),
  atk: v.string(),
  dmg: v.string(),
  wr: v.string(),
});

// `inv` (Invulnerable save) is optional — most creatures/characters don't
// have one; ALB-XXIII's Skitarii build is the first to carry it.
export const STATS = v.object({
  rc: v.string(),
  cc: v.string(),
  ap: v.string(),
  mv: v.string(),
  def: v.string(),
  hp: v.string(),
  inv: v.optional(v.string()),
});

export const WEAPONS = v.object({ ranged: v.array(WEAPON), melee: v.array(WEAPON) });
export const ABILITY = v.object({ name: v.string(), description: v.string() });

// A companion/servitor unit belonging to a character — its own full stat
// card (same shape as the character's own), nested under the character
// rather than being a roster entry itself. Parsed from a "# <Name>" section
// in the character's note (see scripts/sync-codex.mjs:parseCompanions) —
// distinct from a monster's "### Stats <Name>:" loadouts, which are
// alternate builds of the same unit rather than a second unit entirely.
export const COMPANION = v.object({
  name: v.string(),
  stats: STATS,
  weapons: WEAPONS,
  abilities: v.optional(v.array(ABILITY)),
});

export default defineSchema({
  sessions: defineTable({
    code: v.string(),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  // The predefined campaign roster. Role (GM vs player) is derived from
  // isGM here, not stored per-session — one source of truth per character.
  // `stats`/`weapons`/`abilities` power the player's own Operator Profile
  // card — same shape as a single monster loadout. Synced from vault notes
  // under Published/CODEX/Characters/ (a `character: "<exact name>"`
  // frontmatter field links a note to its roster row) via
  // scripts/sync-codex.mjs + characters.syncStats — same "### Stats:"/
  // "### Abilities:" convention as the Bestiary notes, just not wrapped in
  // named loadouts since a player character is always a single build.
  // `companions` are a distinct unit belonging to the character (e.g.
  // ALB-XXIII's B-III servitor) — see the COMPANION validator above.
  characters: defineTable({
    name: v.string(),
    playerRealName: v.optional(v.string()),
    isGM: v.boolean(),
    stats: v.optional(STATS),
    weapons: v.optional(WEAPONS),
    abilities: v.optional(v.array(ABILITY)),
    companions: v.optional(v.array(COMPANION)),
  }),

  players: defineTable({
    sessionId: v.id("sessions"),
    characterId: v.id("characters"),
    joinedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_and_character", ["sessionId", "characterId"]),

  // Synced from the vault's Published/CODEX/Bestiary notes — see
  // scripts/sync-codex.mjs. `scanCount` is preserved across re-syncs just
  // like codex_entries.unlocked, since it's real progression, not authored
  // content. `lootTable[].rarity`/`.dropChance`/`.scrapYield`/
  // `.componentsYield` come from the GM-authored "Lootdrop Table.md"
  // reference (per monster+item, since the same item can carry a different
  // rarity/chance/yield depending on which creature drops it), falling back
  // to a historical-log guess (rarity only) or a flat default for anything
  // not yet listed there.
  //
  // `loadouts`/`abilities` power the Monster Stat Card feature — a combat
  // quick-reference, separate from the Autopsy Report's lore tiers. Most
  // creatures have exactly one loadout (an empty `name`); a squad-type
  // creature like Undead Mutant carries several named ones (Sergeant,
  // Grenadier, ...), each with its own stats/weapons — abilities are shared
  // across all of a creature's loadouts. Both optional: a creature note with
  // no "### Stats"/"### Abilities" sections simply has no card content yet.
  monsters: defineTable({
    monsterId: v.string(),
    code: v.string(),
    name: v.string(),
    blurb: v.optional(v.string()),
    organPool: v.array(v.string()),
    attemptsModifier: v.number(),
    identifiedScansRequired: v.number(),
    tierCount: v.number(),
    lootTable: v.array(
      v.object({
        item: v.string(),
        rarity: RARITY,
        dropChance: v.number(),
        scrapYield: v.number(),
        componentsYield: v.number(),
      }),
    ),
    scanCount: v.number(),
    loadouts: v.optional(
      v.array(
        v.object({
          name: v.string(),
          stats: STATS,
          weapons: WEAPONS,
        }),
      ),
    ),
    abilities: v.optional(v.array(ABILITY)),
  }).index("by_monster_id", ["monsterId"]),

  // Campaign-wide (not session-scoped) — items persist for a character across
  // every session. Ported 1:1 from the old app's `loot_log` table; see
  // project memory project-lovable-app-reference and scripts/migrate-inventory.mjs.
  // `smelted` marks an item converted to crafting resources; it stays in the
  // log rather than being deleted, matching the old app's "restore" toggle.
  // `smeltedScrap`/`smeltedComponents` capture exactly what was granted to
  // `resources` at smelt time, so restoring (un-smelting) can reverse the
  // same amount even if the monster's lootTable yield changes later.
  inventory: defineTable({
    characterId: v.id("characters"),
    itemName: v.string(),
    rarity: RARITY,
    source: v.string(),
    monsterId: v.optional(v.string()),
    smelted: v.boolean(),
    smeltedScrap: v.optional(v.number()),
    smeltedComponents: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_character", ["characterId"]),

  // Crafting-material stockpile, one row per character, credited by
  // smelting items (see inventory.setSmelted) using each item's
  // scrapYield/componentsYield from the monster it dropped from.
  resources: defineTable({
    characterId: v.id("characters"),
    scrap: v.number(),
    components: v.number(),
  }).index("by_character", ["characterId"]),

  // One row per Autopsy attempt (win or loss), for the Operator Profile's
  // "Autopsies Completed" campaign stat — see monsters.ts:submitResult.
  // The GM's own character is excluded, matching the existing inventory
  // exclusion (GM scans are test data, not real campaign progress).
  autopsyAttempts: defineTable({
    characterId: v.id("characters"),
    monsterId: v.string(),
    won: v.boolean(),
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
