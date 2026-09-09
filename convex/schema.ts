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
});
