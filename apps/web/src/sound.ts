/** Short chiptune alerts, synthesized with the Web Audio API. A note is [frequency in Hz, length in ms], 0 Hz is a pause. */
const SOUNDS = {
  questReady: [[880, 90], [1320, 160]],
  monster: [[220, 110], [0, 50], [220, 160]],
  start: [[523, 90], [659, 90], [784, 180]],
  won: [[784, 90], [988, 90], [1319, 240]],
  lost: [[392, 160], [311, 280]],
} satisfies Record<string, [number, number][]>;
export type Sound = keyof typeof SOUNDS;

const MUTED = "dnd.muted";
let ctx: AudioContext | null = null;

// Browsers only allow audio after a user gesture, so the context starts on the first click or key press.
function unlock() {
  ctx ??= new AudioContext();
  void ctx.resume();
}
for (const event of ["pointerdown", "keydown"]) addEventListener(event, unlock, { once: true });

let muted = (() => {
  try {
    return localStorage.getItem(MUTED) === "1";
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTED, value ? "1" : "0");
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
}

export function play(sound: Sound) {
  if (muted || ctx?.state !== "running") return;
  let t = ctx.currentTime;
  for (const [freq, ms] of SOUNDS[sound]) {
    const end = t + ms / 1000;
    if (freq) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(end);
    }
    t = end;
  }
}
