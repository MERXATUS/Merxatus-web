"use client";

import { useEffect, useState } from "react";

const ROTATING_LINES = [
  "게임이 시작되는 중…",
  "세계를 준비하는 중…",
  "모험가님을 맞이하는 중…",
] as const;

export type GameBootSplashPhase = "session" | "world" | "default";

function phaseMessage(phase: GameBootSplashPhase): string {
  if (phase === "session") return "연결을 확인하는 중…";
  if (phase === "world") return "세계를 불러오는 중…";
  return ROTATING_LINES[0];
}

export function GameBootSplash(props: {
  phase?: GameBootSplashPhase;
  fading?: boolean;
  className?: string;
}) {
  const phase = props.phase ?? "default";
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    if (phase !== "default") return;
    const t = window.setInterval(() => {
      setLineIdx((i) => (i + 1) % ROTATING_LINES.length);
    }, 2400);
    return () => window.clearInterval(t);
  }, [phase]);

  const status =
    phase === "default" ? ROTATING_LINES[lineIdx] : phaseMessage(phase);

  return (
    <div
      className={`game-overlay game-boot-splash ${props.fading ? "game-boot-splash--exit" : ""} ${props.className ?? ""}`.trim()}
      role="status"
      aria-live="polite"
      aria-label="게임 시작 중"
    >
      <div className="game-boot-splash__backdrop" aria-hidden />
      <div className="game-boot-splash__panel">
        <div className="game-boot-splash__glow" aria-hidden />
        <p className="game-boot-splash__brand">Merxatus</p>
        <div className="game-boot-splash__emblem" aria-hidden>
          <span className="game-boot-splash__ring" />
          <span className="game-boot-splash__core" />
        </div>
        <p className="game-boot-splash__status">{status}</p>
        <p className="game-boot-splash__hint">잠시만 기다려 주세요</p>
      </div>
    </div>
  );
}
