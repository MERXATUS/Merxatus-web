"use client";

import type { ReactNode } from "react";
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
  bossGateIdle?: boolean;
  encounterLabel?: string;
  preparingLabel?: string;
  className?: string;
  /** 전투 패널 하단 — 던전 「다음 층」 등 */
  actions?: ReactNode;
  idleHint?: string;
  /** 적 초상(몬스터 아이콘) 숨김 — 무한의 탑 등 */
  hideEnemyPortrait?: boolean;
};

export function CombatEncounterBlock(props: Props) {
  const [arenaPlaying, setArenaPlaying] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [lowHp, setLowHp] = useState(false);
  const prevHitRef = useRef<string | null>(null);
  const prevSfxRef = useRef<string | null>(null);
  const prevOutcomeRef = useRef<string | null>(null);

  useEffect(() => {
    setSfxMuted(isCombatSfxMuted());
  }, []);

  useEffect(() => {
    if (!props.playing || !props.replay || props.lines.length === 0) {
      setArenaPlaying(false);
      setLowHp(false);
      prevHitRef.current = null;
      prevSfxRef.current = null;
      prevOutcomeRef.current = null;
      return;
    }
    setArenaPlaying(true);
    playCombatSfx("start");
  }, [props.playing, props.replay, props.lines]);

  const handleFrame = (frame: BattleArenaFrame | null) => {
    if (frame?.lastSfx) {
      const sfxKey = `${frame.lastLog ?? ""}:${frame.lastSfx}`;
      if (sfxKey !== prevSfxRef.current) {
        if (frame.lastSfx !== "skill") {
          playCombatSfx(frame.lastSfx);
        }
        prevSfxRef.current = sfxKey;
      }
    }
    if (frame?.hitTargetId) {
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

  const showArena = !props.bossGateIdle || props.playing;

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

      {props.bossGateIdle && !props.playing ? (
        <div className="dungeon-boss-gate">
          <div className="dungeon-arena__banner dungeon-arena__banner--boss">보스 방 도착</div>
          <p className="dungeon-boss-gate__hint">
            {props.idleHint ?? "「보스 입장」으로 최종 전투를 시작하세요."}
          </p>
        </div>
      ) : null}

      {showArena ? (
        <DungeonCombatArena
          replay={props.replay}
          lines={props.lines}
          playing={arenaPlaying}
          compact={props.embedded}
          idleHint={props.preparingLabel ?? props.idleHint}
          isBoss={props.isBoss}
          hideEnemyPortrait={props.hideEnemyPortrait}
          onComplete={props.onComplete}
          onFrame={handleFrame}
          showFeed={false}
          shakeOnHit={arenaPlaying}
          lowHpVignette={lowHp && arenaPlaying}
        />
      ) : null}

      {props.actions ? <div className="combat-encounter__actions">{props.actions}</div> : null}

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
