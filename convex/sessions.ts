import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Excludes visually ambiguous characters (0/O, 1/I) so codes are easy to read aloud/type.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export const create = mutation({
  args: { gmName: v.string() },
  handler: async (ctx, { gmName }) => {
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
    const playerId = await ctx.db.insert("players", {
      sessionId,
      name: gmName,
      role: "gm",
      joinedAt: Date.now(),
    });

    return { sessionId, playerId, code };
  },
});

export const join = mutation({
  args: { code: v.string(), name: v.string() },
  handler: async (ctx, { code, name }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .unique();
    if (!session) {
      throw new Error("No session found with that code.");
    }

    const playerId = await ctx.db.insert("players", {
      sessionId: session._id,
      name,
      role: "player",
      joinedAt: Date.now(),
    });

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

    return { session, players };
  },
});
