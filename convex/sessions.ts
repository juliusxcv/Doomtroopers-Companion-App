import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Excludes visually ambiguous characters (0/O, 1/I) so codes are easy to read aloud/type.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// Resumes an existing player row for this (session, character) pair instead
// of creating a duplicate — covers reconnecting on a new device or after
// clearing local storage, since there's no password to re-authenticate with.
async function upsertPlayer(ctx: MutationCtx, sessionId: Id<"sessions">, characterId: Id<"characters">) {
  const existing = await ctx.db
    .query("players")
    .withIndex("by_session_and_character", (q) => q.eq("sessionId", sessionId).eq("characterId", characterId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { joinedAt: Date.now() });
    return existing._id;
  }
  return await ctx.db.insert("players", { sessionId, characterId, joinedAt: Date.now() });
}

export const create = mutation({
  args: { characterId: v.id("characters") },
  handler: async (ctx, { characterId }) => {
    const character = await ctx.db.get(characterId);
    if (!character) throw new Error("Unknown character.");

    let code = generateCode();
    while (
      await ctx.db
        .query("sessions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique()
    ) {
      code = generateCode();
    }

    const sessionId = await ctx.db.insert("sessions", {
      code,
      createdAt: Date.now(),
    });
    const playerId = await upsertPlayer(ctx, sessionId, characterId);

    return { sessionId, playerId, code };
  },
});

export const join = mutation({
  args: { code: v.string(), characterId: v.id("characters") },
  handler: async (ctx, { code, characterId }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .unique();
    if (!session) throw new Error("No session found with that code.");

    const character = await ctx.db.get(characterId);
    if (!character) throw new Error("Unknown character.");

    const playerId = await upsertPlayer(ctx, session._id, characterId);

    return { sessionId: session._id, playerId };
  },
});

export const get = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const players = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    const withCharacters = await Promise.all(
      players.map(async (p) => {
        const character = await ctx.db.get(p.characterId);
        return {
          ...p,
          characterName: character?.name ?? "Unknown",
          isGM: character?.isGM ?? false,
        };
      }),
    );

    return { session, players: withCharacters };
  },
});
