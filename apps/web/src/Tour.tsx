import { useEffect, useMemo, useState } from "react";

type Step = {
  /** CSS selector of the element to highlight. Without one the step is a centered dialog. */
  target?: string;
  /** Section the step needs on screen. */
  view?: "character" | "talents";
  text: string;
  /** Shown instead of `text` while the target is not on the page. */
  missing?: string;
  /** Moves on by itself once the player clicks the target, or the element this selector matches. */
  click?: true | string;
};

const steps = (name: string): Step[] => [
  { text: `Welcome to Dungeons & Deploys, ${name}! This takes about a minute. Finish it to unlock the achievement Hello, World.` },
  { target: "[data-tour=hero]", view: "character", text: "This is you: level, gold and XP. Every level gives you a talent point." },
  {
    target: "[data-tour=quest]",
    view: "character",
    click: true,
    text: "Start your first quest. The dice decide at once, then you rest for 45 minutes.",
    missing: "Your character is resting right now. Whenever the Start quest button shows up here, the next quest is ready.",
  },
  { target: "[data-tour=status]", view: "character", text: "Here you see what happened: XP, gold and loot. Monsters also show up here while you work. Fight them before they leave." },
  { target: "[data-tour=equipment]", view: "character", text: "Loot lands in your bag. Equip it to raise attack, defense, luck and fortune." },
  { target: "[data-tour=nav-talents]", click: true, text: "Now open your talent trees." },
  { target: "[data-tour=talent-sharpSyntax]", view: "talents", click: true, text: "Every tile is a talent. Click one to see what it does." },
  {
    target: "[data-tour=talent-details]",
    view: "talents",
    click: "[data-tour=learn]",
    text: "Spend a point with Learn, or keep it for later. Rows further down open as you spend more points in a tree.",
    missing: "Click a talent tile to open its details.",
  },
  { target: "[data-tour=nav-shop]", text: "The shop has three new offers every day. Stats and ranks are next to it." },
  {
    text: "The real game runs next to your work: type `quest` in your terminal, or `! quest` in Claude Code. Your shell and Claude Code send heartbeats that spawn monsters. `quest manual` explains dungeons, guilds and raids.",
  },
  { text: "Tour done. Achievement unlocked: Hello, World!" },
];

/** Text with `backticks` shown as code. */
const rich = (text: string) => text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

const sameRect = (a: DOMRect | null, b: DOMRect | null) =>
  a?.top === b?.top && a?.left === b?.left && a?.width === b?.width && a?.height === b?.height;

/** Walks the player through the page by highlighting real elements. Most steps wait for the real click. */
export function Tour({ name, onView, onEnd }: { name: string; onView: (view: "character" | "talents") => void; onEnd: (done: boolean) => void }) {
  const list = useMemo(() => steps(name), [name]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = list[index];
  const last = index === list.length - 1;
  const next = () => (last ? onEnd(true) : setIndex((i) => Math.min(i + 1, list.length - 1)));

  useEffect(() => {
    if (step.view) onView(step.view);
  }, [step, onView]);

  // The target can render late, move or scroll, so its position is followed every frame.
  useEffect(() => {
    let frame = 0;
    let scrolled = false;
    const follow = () => {
      const el = step.target ? document.querySelector(step.target) : null;
      if (el && !scrolled) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        scrolled = true;
      }
      const r = el?.getBoundingClientRect() ?? null;
      setRect((prev) => (sameRect(prev, r) ? prev : r));
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  useEffect(() => {
    const selector = step.click === true ? step.target : step.click;
    if (!selector) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest(selector)) return;
      document.removeEventListener("click", onClick, true);
      // A short pause lets the player see what the click did.
      setTimeout(() => setIndex((i) => i + 1), 700);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step]);

  const pad = 6;
  const below = rect && rect.bottom < window.innerHeight * 0.6;
  const width = Math.min(352, window.innerWidth - 32);
  const cardStyle = rect
    ? {
        width,
        left: Math.min(Math.max(16, rect.left), window.innerWidth - width - 16),
        ...(below ? { top: rect.bottom + pad + 16 } : { bottom: window.innerHeight - rect.top + pad + 16 }),
      }
    : undefined;

  return (
    <>
      {rect ? (
        <div
          className="tour-spotlight"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      ) : (
        <div className="tour-backdrop" />
      )}
      <div className={`tour-card ${rect ? "" : "center"}`} style={cardStyle} role="dialog" aria-label="Tour">
        <span className="dim">{index + 1}/{list.length}</span>
        <p aria-live="polite">{rich(step.target && !rect && step.missing ? step.missing : step.text)}</p>
        {step.click && rect && <p className="hint">Click the highlighted element, or go on with Next.</p>}
        <div className="row">
          {!last && <button type="button" className="link" onClick={() => onEnd(false)}>Skip tour</button>}
          <button type="button" className="small" onClick={next}>{last ? "Finish" : index === 0 ? "Start" : "Next"}</button>
        </div>
      </div>
    </>
  );
}
