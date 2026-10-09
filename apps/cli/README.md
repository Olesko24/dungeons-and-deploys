<div align="center">
  <a href="https://dnd.meiners-dev.de">
    <img alt="Dungeons &amp; Deploys icon: gold coin with a sword" src="https://dnd.meiners-dev.de/icon.svg" height="128">
  </a>
  <h1>Dungeons &amp; Deploys</h1>

<a href="https://www.npmjs.com/package/dungeons-and-deploys"><img alt="npm version" src="https://img.shields.io/npm/v/dungeons-and-deploys.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://www.npmjs.com/package/dungeons-and-deploys"><img alt="Node.js 24 or newer" src="https://img.shields.io/node/v/dungeons-and-deploys.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://www.npmjs.com/package/dungeons-and-deploys"><img alt="License" src="https://img.shields.io/npm/l/dungeons-and-deploys.svg?style=for-the-badge&labelColor=000000"></a>
<img alt="Beta" src="https://img.shields.io/badge/status-beta-e8b84c.svg?style=for-the-badge&labelColor=000000">

</div>

## Getting Started

An idle RPG for the terminal. It runs next to Claude Code or any shell: start a quest, keep working, collect loot.
Luck and patience decide, not tokens, tickets or commits.

```sh
npm install -g dungeons-and-deploys
quest login --code <ACCESS_CODE>   # new player, pick a character name
quest                              # start a quest
```

The game is invite-only: you need an access code from whoever runs it. Already playing on the website? Click
**Devices** there and run `quest login --pair <CODE>`.

## Terminal and Claude Code

- **Shell:** add `eval "$(quest init zsh)"` (or `bash`) to your shell config. Your commands spawn monsters, and
  `$(dnd_prompt)` shows the status in your prompt.
- **Claude Code:** prefix commands with `!`, for example `! quest`. For the status line, add to
  `~/.claude/settings.json`:
  ```json
  { "statusLine": { "type": "command", "command": "cat ~/.dungeons-and-deploys/status.txt 2>/dev/null" } }
  ```

In terminals with 24-bit color, monsters, raid bosses and loot come with pixel icons. `DND_ICONS=0` turns them off.

## Documentation

`quest help` lists every command. `quest manual` and `quest changelog` show the player manual and the changes of
the server you play on. Both are also on the website at [dnd.meiners-dev.de](https://dnd.meiners-dev.de).

## Community

Suggest what comes next and vote for other players' ideas under **Ideas & voting** on the website.

## Security

If you believe you have found a security problem, please do not post it as an idea or share it publicly. Tell the
person who gave you your access code.

---

Beta: rules and numbers can still change, and progress may be reset. Not affiliated with Anthropic. MIT license.
