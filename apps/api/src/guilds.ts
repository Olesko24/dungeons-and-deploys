import type { FastifyInstance } from "fastify";
import { GUILD_MAX_MEMBERS, guildLevel, levelFromXp } from "@tokenquest/shared";
import { Prisma, type PrismaClient } from "./generated/prisma/client.ts";
import { randomCode } from "./auth.ts";
import { requireCharacter } from "./characters.ts";

export async function guildView(db: Pick<PrismaClient, "guild">, guildId: number) {
  const guild = await db.guild.findUniqueOrThrow({
    where: { id: guildId },
    include: { members: { include: { character: true }, orderBy: { joinedAt: "asc" } } },
  });
  return {
    name: guild.name,
    code: guild.code,
    xp: guild.xp,
    ...guildLevel(guild.xp),
    members: guild.members.map((m) => ({ name: m.character.name, role: m.role, level: levelFromXp(m.character.xp).level })),
  };
}

export function guildRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get("/guild", async (req, reply) => {
    const character = await requireCharacter(db, req, reply);
    if (!character) return;
    const membership = await db.guildMember.findUnique({ where: { characterId: character.id } });
    return { guild: membership ? await guildView(db, membership.guildId) : null };
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
        return reply.code(201).send({ guild: await guildView(db, guild.id) });
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
      const guild = await db.guild.findUnique({
        where: { code: req.body.code.trim().toUpperCase() },
        include: { _count: { select: { members: true } } },
      });
      if (!guild) return reply.code(400).send({ error: "no guild with that code" });
      if (guild._count.members >= GUILD_MAX_MEMBERS) return reply.code(400).send({ error: "guild is full" });
      await db.guildMember.create({ data: { guildId: guild.id, characterId: character.id } });
      return { guild: await guildView(db, guild.id) };
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
