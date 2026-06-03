const MUTE_KEY = "merxatus_combat_sfx_mute";

type SfxKind = "tick" | "start" | "hit" | "ko" | "win" | "loss";

let ctx: AudioContext | null = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function isCombatSfxMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCombatSfxMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function tone(freq: number, dur: number, type: OscillatorType = "square", gain = 0.04) {
  const ac = audioContext();
  if (!ac || isCombatSfxMuted()) return;
  void ac.resume().catch(() => undefined);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(ac.destination);
  const t = ac.currentTime;
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t);
  osc.stop(t + dur);
}

export function playCombatSfx(kind: SfxKind) {
  switch (kind) {
    case "tick":
      tone(440, 0.06, "sine", 0.03);
      break;
    case "start":
      tone(220, 0.08, "sawtooth", 0.035);
      setTimeout(() => tone(330, 0.1, "sawtooth", 0.04), 80);
      break;
    case "hit":
      tone(120, 0.07, "square", 0.045);
      break;
    case "ko":
      tone(90, 0.15, "sawtooth", 0.05);
      break;
    case "win":
      tone(523, 0.1, "sine", 0.04);
      setTimeout(() => tone(659, 0.12, "sine", 0.04), 90);
      break;
    case "loss":
      tone(180, 0.2, "sawtooth", 0.05);
      setTimeout(() => tone(110, 0.25, "sawtooth", 0.04), 120);
      break;
    default:
      break;
  }
}
