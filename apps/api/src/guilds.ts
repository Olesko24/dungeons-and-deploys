import type { FastifyInstance } from "fastify";
import { GUILD_BUFFS, GUILD_BUFF_MS, GUILD_MAX_MEMBERS, type GuildBuffKey, buffEffects, guildLevel, isGuildBuff, levelFromXp } from "@dnd/shared";
import type { Deps } from "./app.ts";
import { Prisma, type PrismaClient } from "./generated/prisma/client.ts";
import { randomCode } from "./auth.ts";
import { requireCharacter } from "./characters.ts";

/** Effects of the buffs active at `t` in the character's guild, in the shape talents use. */
export async function guildBuffs(db: Pick<PrismaClient, "guildBuff">, characterId: number, t: Date) {
  const buffs = await db.guildBuff.findMany({ where: { endsAt: { gt: t }, guild: { members: { some: { characterId } } } } });
  return buffEffects(buffs.map((b) => b.key));
}

export async function guildView(db: Pick<PrismaClient, "guild">, guildId: number, t: Date) {
  const guild = await db.guild.findUniqueOrThrow({
    where: { id: guildId },
    include: { members: { include: { character: true }, orderBy: { joinedAt: "asc" } }, buffs: true },
  });
  const { level } = guildLevel(guild.xp);
  const endsAt = new Map(guild.buffs.filter((b) => b.endsAt > t).map((b) => [b.key, b.endsAt]));
  return {
    name: guild.name,
    code: guild.code,
    xp: guild.xp,
    gold: guild.gold,
    ...guildLevel(guild.xp),
    members: guild.members.map((m) => ({ name: m.character.name, role: m.role, level: levelFromXp(m.character.xp).level, donated: m.donated })),
    buffs: (Object.keys(GUILD_BUFFS) as GuildBuffKey[]).map((key) => ({
      key,
      ...GUILD_BUFFS[key],
      unlocked: level >= GUILD_BUFFS[key].level,
      endsAt: endsAt.get(key) ?? null,
    })),
  };
}

export function guildRoutes(app: FastifyInstance, { db, now }: Required<Deps>) {
  app.get("/guild", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const membership = await db.guildMember.findUnique({ where: { characterId: character.id } });
    return { guild: membership ? await guildView(db, membership.guildId, now()) : null };
  });

  app.post<{ Body: { name: string } }>(
    "/guild",
    {
      schema: {
        body: { type: "object", required: ["name"], properties: { name: { type: "string", pattern: "^[a-zA-Z0-9 _-]{3,24}$" } } },
      },
    },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      if (await db.guildMember.findUnique({ where: { characterId: character.id } })) {
        return reply.code(409).send({ error: "already in a guild, leave it first" });
      }
      try {
        const guild = await db.guild.create({
          data: { name: req.body.name.trim(), code: randomCode(6), members: { create: { characterId: character.id, role: "leader" } } },
        });
        return reply.code(201).send({ guild: await guildView(db, guild.id, now()) });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return reply.code(409).send({ error: "name taken" });
        throw err;
      }
    },
  );

  app.post<{ Body: { code: string } }>(
    "/guild/join",
    { schema: { body: { type: "object", required: ["code"], properties: { code: { type: "string" } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      if (await db.guildMember.findUnique({ where: { characterId: character.id } })) {
        return reply.code(409).send({ error: "already in a guild, leave it first" });
      }
      const result = await db.$transaction(async (tx) => {
        const guild = await tx.guild.findUnique({ where: { code: req.body.code.trim().toUpperCase() } });
        if (!guild) return { error: "no guild with that code" };
        // Locking the guild row serializes parallel joins, so the guild cannot grow past the limit.
        await tx.$queryRaw`SELECT id FROM guilds WHERE id = ${guild.id} FOR UPDATE`;
        if ((await tx.guildMember.count({ where: { guildId: guild.id } })) >= GUILD_MAX_MEMBERS) return { error: "guild is full" };
        await tx.guildMember.create({ data: { guildId: guild.id, characterId: character.id } });
        return { guildId: guild.id };
      });
      if ("error" in result) return reply.code(400).send(result);
      return { guild: await guildView(db, result.guildId, now()) };
    },
  );

  app.post<{ Body: { amount: number } }>(
    "/guild/donate",
    { schema: { body: { type: "object", required: ["amount"], properties: { amount: { type: "integer", minimum: 1 } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const { amount } = req.body;
      const result = await db.$transaction(async (tx) => {
        const membership = await tx.guildMember.findUnique({ where: { characterId: character.id } });
        if (!membership) return { error: "not in a guild" };
        const paid = await tx.character.updateMany({ where: { id: character.id, gold: { gte: amount } }, data: { gold: { decrement: amount } } });
        if (paid.count === 0) return { error: "not enough gold" };
        await tx.guild.update({ where: { id: membership.guildId }, data: { gold: { increment: amount } } });
        await tx.guildMember.update({ where: { characterId: character.id }, data: { donated: { increment: amount } } });
        return { guildId: membership.guildId };
      });
      if ("error" in result) return reply.code(400).send(result);
      return { guild: await guildView(db, result.guildId, now()) };
    },
  );

  /** The leader buys a buff from the guild bank. It runs for every member, the same buff once at a time. */
  app.post<{ Body: { key: string } }>(
    "/guild/buffs",
    { schema: { body: { type: "object", required: ["key"], properties: { key: { type: "string" } } } } },
    async (req, reply) => {
      const character = await requireCharacter(db, req, reply);
      if (!character) return;
      const { key } = req.body;
      if (!isGuildBuff(key)) return reply.code(400).send({ error: "unknown buff" });
      const buff = GUILD_BUFFS[key];
      const t = now();
      const result = await db.$transaction(async (tx) => {
        const membership = await tx.guildMember.findUnique({ where: { characterId: character.id } });
        if (membership?.role !== "leader") return { error: "only the guild leader can activate buffs" };
        // Locking the guild row keeps two activations from spending the same gold.
        await tx.$queryRaw`SELECT id FROM guilds WHERE id = ${membership.guildId} FOR UPDATE`;
        const guild = await tx.guild.findUniqueOrThrow({ where: { id: membership.guildId }, include: { buffs: { where: { key } } } });
        if (guildLevel(guild.xp).level < buff.level) return { error: `needs guild level ${buff.level}` };
        if (guild.buffs[0] && guild.buffs[0].endsAt > t) return { error: "buff already active" };
        if (guild.gold < buff.cost) return { error: `costs ${buff.cost} gold, the guild bank has ${guild.gold}` };
        await tx.guild.update({ where: { id: guild.id }, data: { gold: { decrement: buff.cost } } });
        const endsAt = new Date(t.getTime() + GUILD_BUFF_MS);
        await tx.guildBuff.upsert({ where: { guildId_key: { guildId: guild.id, key } }, create: { guildId: guild.id, key, endsAt }, update: { endsAt } });
        return { guildId: guild.id };
      });
      if ("error" in result) return reply.code(400).send(result);
      return { guild: await guildView(db, result.guildId, now()) };
    },
  );

  /** The longest-standing member takes over from a leaving leader. The last member to leave dissolves the guild. */
  app.post("/guild/leave", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const membership = await db.guildMember.findUnique({ where: { characterId: character.id } });
    if (!membership) return reply.code(400).send({ error: "not in a guild" });
    await db.$transaction(async (tx) => {
      await tx.guildMember.delete({ where: { characterId: character.id } });
      const next = await tx.guildMember.findFirst({ where: { guildId: membership.guildId }, orderBy: { joinedAt: "asc" } });
      if (!next) await tx.guild.delete({ where: { id: membership.guildId } });
      else if (membership.role === "leader") await tx.guildMember.update({ where: { characterId: next.characterId }, data: { role: "leader" } });
    });
    return reply.code(204).send();
  });
}
