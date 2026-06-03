"use client";

import { useEffect, useRef, useState } from "react";
import { DungeonCombatArena } from "@/app/_components/DungeonCombatArena";
import { PushLuckRiskBar } from "@/app/_components/PushLuckRiskBar";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import type { BattleArenaFrame } from "@/shared/dungeonCombatReplay";
import {
  isCombatSfxMuted,
  playCombatSfx,
  setCombatSfxMuted,
} from "@/shared/gameCombatSfx";

type Props = {
  embedded?: boolean;
  playing: boolean;
  replay: DungeonCombatReplay | null;
  lines: CombatLogLine[];
  onComplete?: () => void;
  onFrame?: (frame: BattleArenaFrame | null) => void;
  clearChance?: number | null;
  pendingSummary?: string;
  floorLabel?: string;
  isBoss?: boolean;
  encounterLabel?: string;
  className?: string;
};

export function CombatEncounterBlock(props: Props) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [arenaPlaying, setArenaPlaying] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [lowHp, setLowHp] = useState(false);
  const prevHitRef = useRef<string | null>(null);
  const prevOutcomeRef = useRef<string | null>(null);

  useEffect(() => {
    setSfxMuted(isCombatSfxMuted());
  }, []);

  useEffect(() => {
    if (!props.playing || !props.replay || props.lines.length === 0) {
      setCountdown(null);
      setArenaPlaying(false);
      setLowHp(false);
      prevHitRef.current = null;
      prevOutcomeRef.current = null;
      return;
    }
    setCountdown(props.isBoss ? 3 : 2);
    setArenaPlaying(false);
  }, [props.playing, props.replay, props.lines, props.isBoss]);

  useEffect(() => {
    if (countdown === null) return;
    playCombatSfx("tick");
    const delay = props.isBoss ? 720 : 520;
    const t = window.setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        setArenaPlaying(true);
        playCombatSfx("start");
      } else {
        setCountdown(countdown - 1);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [countdown, props.isBoss]);

  const handleFrame = (frame: BattleArenaFrame | null) => {
    if (frame?.hitTargetId && frame.hitTargetId !== prevHitRef.current) {
      playCombatSfx("hit");
      prevHitRef.current = frame.hitTargetId;
    }
    if (frame?.outcome && frame.outcome !== prevOutcomeRef.current) {
      playCombatSfx(frame.outcome === "WIN" ? "win" : "loss");
      prevOutcomeRef.current = frame.outcome;
    }
    if (frame) {
      const party = frame.fighters.filter((f) => f.side === "party" && !f.dead);
      setLowHp(
        party.length > 0 && party.some((f) => f.hp / Math.max(1, f.maxHp) <= 0.3),
      );
    }
    props.onFrame?.(frame);
  };

  return (
    <div className={`combat-encounter ${props.className ?? ""}`.trim()}>
      {props.clearChance != null && (props.playing || arenaPlaying) ? (
        <PushLuckRiskBar
          className="mb-2"
          clearChance={props.clearChance}
          floorLabel={props.floorLabel ?? `${props.replay?.floor ?? "?"}층`}
          pendingSummary={props.pendingSummary}
          forfeitHint="패배 시 누적 보상 소멸"
        />
      ) : null}

      {countdown !== null ? (
        <div
          className={`combat-countdown ${props.isBoss ? "combat-countdown--boss" : ""}`.trim()}
          role="status"
        >
          {props.isBoss ? (
            <p className="combat-countdown__boss">⚠ {props.encounterLabel ?? "보스"} 등장</p>
          ) : (
            <p className="combat-countdown__hint">{props.encounterLabel ?? "전투 개시"}</p>
          )}
          <span className="combat-countdown__num">{countdown}</span>
        </div>
      ) : null}

      <DungeonCombatArena
        replay={props.replay}
        lines={props.lines}
        playing={arenaPlaying}
        compact={props.embedded}
        onComplete={props.onComplete}
        onFrame={handleFrame}
        showFeed={false}
        shakeOnHit={arenaPlaying}
        lowHpVignette={lowHp && arenaPlaying}
      />

      <div className="combat-encounter__foot">
        <button
          type="button"
          className="combat-sfx-toggle"
          onClick={() => {
            const next = !sfxMuted;
            setSfxMuted(next);
            setCombatSfxMuted(next);
          }}
        >
          {sfxMuted ? "효과음 켜기" : "효과음 끄기"}
        </button>
      </div>
    </div>
  );
}
