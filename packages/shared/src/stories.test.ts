import assert from "node:assert/strict";
import { test } from "node:test";
import { DUNGEON_STAGES } from "./dungeons.ts";
import { RAID_TICKS } from "./raids.ts";
import { dungeonStory, questName, questStory, raidStory } from "./stories.ts";

test("every quest, dungeon state and raid tick has a story", () => {
  assert.equal(questName(1), questName(13), "quest names cycle through the list");
  assert.notEqual(questStory(1, true), questStory(1, false));
  for (const state of ["lobby", "won"]) assert.ok(dungeonStory(1, state, 0));
  DUNGEON_STAGES.forEach((_, stage) => {
    assert.ok(dungeonStory(1, "running", stage));
    assert.ok(dungeonStory(1, "failed", stage));
  });
  for (const state of ["scheduled", "won", "failed", "cancelled"]) assert.ok(raidStory(1, state, 0));
  for (let tick = 0; tick <= RAID_TICKS; tick++) assert.ok(raidStory(1, "running", tick));
});
