-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "best_quest_streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quest_streak" INTEGER NOT NULL DEFAULT 0;

-- Streaks from the quest history: every failure starts a new run, a run counts its successes.
WITH ordered AS (
  SELECT character_id, success,
    SUM(CASE WHEN success THEN 0 ELSE 1 END) OVER (PARTITION BY character_id ORDER BY started_at, id) AS run
  FROM quests WHERE resolved_at IS NOT NULL
), runs AS (
  SELECT character_id, run, COUNT(*) FILTER (WHERE success) AS length FROM ordered GROUP BY character_id, run
), streaks AS (
  SELECT character_id, MAX(length) AS best, (ARRAY_AGG(length ORDER BY run DESC))[1] AS current FROM runs GROUP BY character_id
)
UPDATE characters SET best_quest_streak = streaks.best, quest_streak = streaks.current
FROM streaks WHERE characters.id = streaks.character_id;
