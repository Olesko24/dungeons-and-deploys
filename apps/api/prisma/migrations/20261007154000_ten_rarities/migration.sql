-- Ten rarities with new stat ranges: every item is reset. Loot links on quests, fights, dungeons and raids become null.
DELETE FROM "items";

-- Combat power without gear, from the level only. Talent bonuses come back with the next progress sync.
UPDATE "characters" c
SET "power" = round(((4 + x.level) * (1 + x.level / 20.0) * 10)::numeric)
FROM (
  SELECT ch."id", 1 + count(t.l) AS level
  FROM "characters" ch
  LEFT JOIN (
    SELECT l, sum(round((100 * power(l, 1.5))::numeric)) OVER (ORDER BY l) AS total
    FROM generate_series(1, 99) AS l
  ) t ON t.total <= ch."xp"
  GROUP BY ch."id"
) x
WHERE x."id" = c."id";
