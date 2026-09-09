import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("characters").collect();
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
