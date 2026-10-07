# Style direction

16-bit fantasy RPG, SNES era. Dark UI, pixel fonts, hard edges, gold accents.
Reference for the feel: [rpg.sola.rip](https://rpg.sola.rip). Take the direction, not the assets.

## Rules

- **Everything snaps to the pixel grid.** One pixel unit = `4px`. Sizes, borders, gaps and offsets are multiples of it.
- **No rounded corners, no blur shadows, no gradients.** Depth comes from hard offset shadows and two-tone borders.
- **Pixel art stays sharp.** `image-rendering: pixelated`, scale sprites by whole numbers only (2×, 3×, 4×).
- **Dark only.** No light theme.
- **Glow is rare.** Only for rare+ loot and active encounters. Never on regular UI.

## Colors

```css
:root {
  --pixel: 4px;

  --ground: #0e0b16;      /* page background */
  --panel: #1c1630;       /* cards, windows */
  --panel-deep: #130e22;  /* inset areas, inputs */
  --edge-dark: #06050b;   /* outer border, shadows */
  --edge-light: #e4d2a6;  /* inner border, parchment */

  --ink: #eee7d8;         /* text */
  --ink-dim: #9a92a8;     /* secondary text */

  --gold: #f0c05a;        /* accent, gold, links, focus */
  --gold-dim: #a8843c;

  --good: #7cc86e;        /* success, presence, HP */
  --bad: #e86a56;         /* failure, damage */
  --warn: #e8b84c;        /* cooldown, expiring */
}
```

### Rarity

| Rarity | Color | Glow |
|---|---|---|
| Common | `#b8bec8` | no |
| Uncommon | `#7cd47c` | no |
| Rare | `#6aa8f0` | yes |
| Epic | `#b48cff` | yes |
| Legendary | `#ffb45c` | yes |
| Mythic | `#ff6b8a` | yes |
| Ancient | `#3fd0c0` | yes |
| Divine | `#fff07a` | yes |
| Celestial | `#f070ff` | yes |
| Eternal | `#f4f2ff` | yes |

Every rarity also has its own pixel shape, so it reads without telling the colors apart.

## Typography

| Use | Font | Size |
|---|---|---|
| Headings, buttons, numbers | [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) | 8 / 12 / 16 / 24px |
| Body text, logs, item descriptions | [VT323](https://fonts.google.com/specimen/VT323) | 20 / 24px |

Both are OFL. Self-host the `woff2` files. Fallback: `monospace`.
Press Start 2P only in multiples of 8px, otherwise it blurs. Keep it short: no paragraphs in Press Start 2P.

## Components

**Window / panel** – the base building block.

```css
.panel {
  background: var(--panel);
  border: var(--pixel) solid var(--edge-light);
  box-shadow: 0 0 0 var(--pixel) var(--edge-dark);
}
```

**Button** – pressed look via offset shadow.

```css
.btn {
  font-family: "Press Start 2P", monospace;
  background: var(--gold);
  color: var(--edge-dark);
  border: 0;
  box-shadow: 0 var(--pixel) 0 var(--gold-dim), 0 calc(var(--pixel) * 2) 0 var(--edge-dark);
}
.btn:active { transform: translateY(var(--pixel)); box-shadow: 0 var(--pixel) 0 var(--edge-dark); }
```

**Bars** (HP, XP, presence slots) – segmented blocks, one block per unit. Presence: one block per 5-minute slot, filled = present.

**Icons and sprites** – 16×16 or 32×32 pixel art, same palette. No vector icon sets.

**Motion** – stepped, not smooth: `animation-timing-function: steps(n)`. Respect `prefers-reduced-motion`.

## Terminal (CLI, statusline)

Same palette, mapped to 24-bit ANSI colors. Fall back to basic ANSI when `COLORTERM` is not `truecolor`/`24bit`.

- Statusline: one line, no frames. Example: `⚔ Quest 23m · ■■■■□□□□□ · Lv 7 · 312g`
- Rarity colors on item names, gold for gold and level-ups, `--bad` for failures.
- Box-drawing characters (`┌─┐`) for character sheet and inventory, never inside the statusline.
- Respect `NO_COLOR`.

## Accessibility

- Text contrast at least 4.5:1 against `--panel` (`--ink-dim` is the lower limit).
- Rarity is never shown by color alone: add the rarity name or a symbol.
- Visible focus: `outline: var(--pixel) solid var(--gold)`.
