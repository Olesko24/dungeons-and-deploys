import type { MonsterKey } from "./combat.ts";

/** Picks a variant deterministically, so a story stays the same on every refresh without being stored. */
const pick = <T>(list: T[], n: number) => list[Math.abs(n) % list.length];

const QUESTS = [
  {
    name: "Hunt the Off-by-One Goblin",
    won: "You counted to ten twice, cornered it at index 9 and showed it the door. Index 10 was empty, as it should be.",
    failed: "The goblin escaped through index -1. Nobody knows where that leads, Python developers least of all.",
  },
  {
    name: "Clear the Merge Conflict Swamp",
    won: "You waded through <<<<<<< HEAD, kept both sides where it made sense and drained the swamp with one clean rebase.",
    failed: "You picked \"accept theirs\" on every hunk. Theirs, it turned out, was a swamp.",
  },
  {
    name: "Escort the Legacy Monolith",
    won: "Twelve thousand lines, zero tests, one sacred cron job. You delivered it without touching anything. Respect.",
    failed: "You renamed one variable. Somewhere, a billing system in 2009 started screaming.",
  },
  {
    name: "Banish the Flaky Test Wraith",
    won: "You found the missing await, the wraith turned green and stayed green for three runs in a row. A miracle.",
    failed: "It passed locally. It passed on retry. It failed on the release branch. The wraith laughs in CI.",
  },
  {
    name: "Recover the Lost Semicolon",
    won: "Found it on line 4,812, hiding behind a closing brace. The build compiles, the crowd cheers.",
    failed: "You searched for hours, then remembered the language does not use semicolons. Partial XP for the walk.",
  },
  {
    name: "Slay the Memory Leak Hydra",
    won: "Every event listener you added, you also removed. The hydra starved at a steady 120 MB.",
    failed: "You cut off one head, it allocated two more. The OOM killer ended the fight for both of you.",
  },
  {
    name: "Map the Undocumented Catacombs",
    won: "You read the code instead of the wiki and drew a map. The README now has a second sentence.",
    failed: "The only documentation was a comment saying \"TODO: explain this\". You got lost in the 2017 branch.",
  },
  {
    name: "Tame the Race Condition Twins",
    won: "You put a lock between them. They now take turns, sulking but in order.",
    failed: "You added a sleep(100). It worked twice. Then the twins arrived in the other order.",
  },
  {
    name: "Storm the Dependency Hell Keep",
    won: "You pinned every version, deleted node_modules once and walked out with a reproducible build.",
    failed: "Package A needed B@2, B@2 needed C@1, C@1 needed A@0. You are still inside, resolving.",
  },
  {
    name: "Silence the Pager at 3 AM",
    won: "Disk full. You cleared the logs, raised the alert threshold and were back in bed by 3:12.",
    failed: "You acknowledged the alert and fell asleep. The pager woke you again. And again. It always wins.",
  },
  {
    name: "Untangle the Regex Labyrinth",
    won: "You replaced ^(?:(?!\\s).)+$ with a split and a trim. The labyrinth collapsed into two readable lines.",
    failed: "You added one more backslash to be safe. Now the regex matches everything, including your hopes.",
  },
  {
    name: "Defend the Production Gate",
    won: "Friday, 4:55 PM, someone tried to deploy. You held the line. The weekend is saved.",
    failed: "\"It's just a config change\", they said. The gate fell, the rollback took an hour.",
  },
];

export const questName = (id: number) => pick(QUESTS, id).name;
export const questStory = (id: number, success: boolean | null) => pick(QUESTS, id)[success ? "won" : "failed"];

const FIGHTS: Record<MonsterKey, { won: string; lost: string }> = {
  bugSwarm: {
    won: "You squashed them one by one and wrote a regression test for each. The swarm will not be back.",
    lost: "You fixed one bug and three new ones crawled out of the fix.",
  },
  memoryLeakSlime: {
    won: "You took a heap snapshot, found the forgotten cache and freed it. The slime shrank to nothing.",
    lost: "The slime grew slowly, quietly, until it filled the room. You restarted and pretended nothing happened.",
  },
  flakyTestGoblin: {
    won: "You froze the clock in the test. The goblin lost its only trick.",
    lost: "You hit it. It was fine. You hit it again. It was not. Nobody can reproduce it.",
  },
  nullPointerWraith: {
    won: "You checked for null before it could strike. The wraith dissolved into undefined.",
    lost: "\"Cannot read properties of undefined\". The wraith left no stack trace, only shame.",
  },
  raceConditionTwins: {
    won: "You awaited both of them. They arrived in order and surrendered together.",
    lost: "One twin distracted you while the other overwrote your state. Classic.",
  },
  legacyCodeGolem: {
    won: "You wrapped it in tests before the first swing. The golem crumbled into small, readable functions.",
    lost: "You tried to refactor it. It turned out the golem was holding up the payment system.",
  },
  mergeConflictHydra: {
    won: "You rebased often and early. Every head you cut stayed cut.",
    lost: "Two branches, 400 conflicts, one force push. The hydra ate your afternoon.",
  },
  dependencyDragon: {
    won: "You audited its hoard, removed 600 transitive packages and the dragon fell over, lighter than ever.",
    lost: "The dragon breathed a major version bump. Everything broke, even things that did not use it.",
  },
};

export const fightStory = (monster: MonsterKey, won: boolean) => FIGHTS[monster][won ? "won" : "lost"];

/** One entry per stage of DUNGEON_STAGES, in the same order. */
const DUNGEON_STAGE_STORIES = [
  {
    running: [
      "The party tiptoes through code nobody has touched since 2011. A comment reads \"do not remove, nobody knows why\".",
      "Every function here is called doStuff2. The golem watches from behind a 900-line switch statement.",
    ],
    cleared: "The golem falls apart into helper functions. Someone finally writes a test.",
    failed: "The party changed one line in the Halls and the whole dungeon stopped compiling. Retreat.",
  },
  {
    running: [
      "Two bridges, one shared variable. Whoever crosses first decides what everyone else sees.",
      "The twins move in perfect sync, except when they don't. The party argues about mutex etiquette.",
    ],
    cleared: "The party crossed one at a time, holding a lock. The twins gave up, deadlocked in confusion.",
    failed: "Two members crossed at once and overwrote each other. The crossing is now in an undefined state.",
  },
  {
    running: [
      "The tunnels split into feature branches. Nobody has pulled main in weeks.",
      "<<<<<<< and >>>>>>> markers cover the walls. The hydra hisses in three versions at once.",
    ],
    cleared: "The party resolved every conflict by actually talking to each other. The hydra had no answer to that.",
    failed: "Someone force pushed. Half the party's progress vanished into the reflog.",
  },
  {
    running: [
      "The dragon sleeps on a hoard of 1,400 packages, half of them deprecated, one of them left-pad.",
      "The lair smells of lockfiles. Every step triggers a postinstall script.",
    ],
    cleared: "The dragon lies slain on a pile of pinned versions. The party splits the loot and runs npm audit, just once.",
    failed: "The dragon released a breaking change in a patch version. The party never saw it coming.",
  },
];

const DUNGEON_LOBBY_STORY = "The party sharpens its keyboards and pretends to read the onboarding docs.";

/** What happens in a dungeon right now, or how it ended. `stage` is the number of cleared stages. */
export function dungeonStory(id: number, state: string, stage: number) {
  if (state === "lobby") return DUNGEON_LOBBY_STORY;
  if (state === "won") return DUNGEON_STAGE_STORIES.at(-1)!.cleared;
  const s = DUNGEON_STAGE_STORIES[stage];
  if (state === "failed") return s.failed;
  return [stage > 0 ? DUNGEON_STAGE_STORIES[stage - 1].cleared : "", pick(s.running, id)].filter(Boolean).join(" ");
}

const RAID_TICK_STORIES = [
  "{boss} deploys a hotfix to itself. The raid hits it anyway.",
  "{boss} spawns a 40-minute build. The raiders attack while it compiles.",
  "Someone found an endpoint without auth. Critical hit!",
  "{boss} pages the whole guild at once. The raiders ignore it and keep hitting.",
  "A raider deleted a dead module. {boss} shudders, lighter by 3,000 lines.",
  "{boss} rolls back to yesterday. Half the damage is undone, the other half is in the logs.",
  "{boss} summons a meeting that could have been an email. The raid loses momentum.",
  "Someone added a cache in front of it. {boss} slows down, confused.",
  "{boss} throws a 500 with no message. The raiders throw it right back.",
  "The healer restarts the pods. Everyone feels better, nobody knows why.",
];

const RAID_STATES: Record<string, string> = {
  scheduled: "The guild gathers in the war room. Someone shares a screen with 47 open tabs.",
  won: "{boss} goes down. Loot for everyone, and a postmortem nobody will read.",
  failed: "{boss} survived. It will be rewritten next quarter. It is always next quarter.",
  cancelled: "Not enough raiders showed up. {boss} stays. The meeting is moved to next week.",
};

/** What happens in a raid against `boss` at its current tick, or how it ended. */
export function raidStory(id: number, state: string, tick: number, boss: string) {
  const story =
    state !== "running" ? RAID_STATES[state]
    : tick === 0 ? "The raid begins. {boss} boots, slowly, like it always does."
    : pick(RAID_TICK_STORIES, id + tick);
  return story.replaceAll("{boss}", boss);
}
