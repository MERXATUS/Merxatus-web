"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DungeonCombatArena } from "@/app/_components/DungeonCombatArena";
import { PushLuckRiskBar } from "@/app/_components/PushLuckRiskBar";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import type { BattleArenaFrame, CombatFeedTone, CombatPlaybackSpeed } from "@/shared/dungeonCombatReplay";
import {
  COMBAT_PLAYBACK_SPEED_OPTIONS,
  loadCombatPlaybackSpeed,
  saveCombatPlaybackSpeed,
} from "@/shared/dungeonCombatReplay";
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
  /** 탐험 세션 키 — 바뀔 때만 로그 초기화 (층 이동 시에는 유지) */
  combatLogSessionKey?: string | number | null;
  /** 층 이동·탐험 시작 등 전환 중 (아레나 대기 문구 강조) */
  transitioning?: boolean;
};

type LogEntry = { id: number; text: string; tone: CombatFeedTone; divider?: boolean };

const MAX_COMBAT_LOG_LINES = 80;

export function CombatEncounterBlock(props: Props) {
  const arenaReady = props.playing && !!props.replay && props.lines.length > 0;
  const combatPlaybackKey = useMemo(() => {
    if (!arenaReady || !props.replay) return "";
    const first = props.lines[0];
    const last = props.lines[props.lines.length - 1];
    return `${props.replay.floor}:${props.lines.length}:${first?.t ?? ""}:${last?.t ?? ""}`;
  }, [arenaReady, props.replay, props.lines]);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [lowHp, setLowHp] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<CombatPlaybackSpeed>("normal");
  const [combatLog, setCombatLog] = useState<LogEntry[]>([]);
  const playbackSpeedRef = useRef<CombatPlaybackSpeed>("normal");
  const savedSpeedRef = useRef<CombatPlaybackSpeed>("normal");
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const sessionKeyRef = useRef<string | number | null | undefined>(undefined);
  const prevPlayingRef = useRef(false);
  const prevHitRef = useRef<string | null>(null);
  const prevSfxRef = useRef<string | null>(null);
  const prevOutcomeRef = useRef<string | null>(null);

  useEffect(() => {
    const saved = loadCombatPlaybackSpeed();
    savedSpeedRef.current = saved;
    setPlaybackSpeed(saved);
    playbackSpeedRef.current = saved;
  }, []);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    setSfxMuted(isCombatSfxMuted());
  }, []);

  useEffect(() => {
    const key = props.combatLogSessionKey ?? null;
    if (sessionKeyRef.current !== undefined && sessionKeyRef.current !== key) {
      if (sessionKeyRef.current != null) {
        setCombatLog([]);
        logIdRef.current = 0;
      }
    }
    sessionKeyRef.current = key;
  }, [props.combatLogSessionKey]);

  useEffect(() => {
    if (!arenaReady) {
      setLowHp(false);
      const saved = loadCombatPlaybackSpeed();
      savedSpeedRef.current = saved;
      setPlaybackSpeed(saved);
      playbackSpeedRef.current = saved;
      prevHitRef.current = null;
      prevSfxRef.current = null;
      prevOutcomeRef.current = null;
      prevPlayingRef.current = false;
      return;
    }

    const floor = props.replay!.floor;
    const label = props.floorLabel ?? `${floor}층`;
    playbackSpeedRef.current = savedSpeedRef.current;
    setPlaybackSpeed(savedSpeedRef.current);

    if (!prevPlayingRef.current) {
      setCombatLog((prev) => {
        if (prev.length === 0) return prev;
        logIdRef.current += 1;
        const divider: LogEntry = {
          id: logIdRef.current,
          text: `── ${label} ──`,
          tone: "neutral",
          divider: true,
        };
        const next = [...prev, divider];
        return next.length > MAX_COMBAT_LOG_LINES ? next.slice(-MAX_COMBAT_LOG_LINES) : next;
      });
    }

    prevPlayingRef.current = true;
    playCombatSfx("start");
  }, [arenaReady, combatPlaybackKey, props.replay, props.floorLabel, props.lines]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [combatLog.length]);

  const appendLogLine = (text: string, tone: CombatFeedTone) => {
    setCombatLog((prev) => {
      logIdRef.current += 1;
      const next = [...prev, { id: logIdRef.current, text, tone }];
      return next.length > MAX_COMBAT_LOG_LINES ? next.slice(-MAX_COMBAT_LOG_LINES) : next;
    });
  };

  const handleFrame = (frame: BattleArenaFrame | null) => {
    if (frame?.lastSfx) {
      const sfxKey = `${frame.lastLog ?? ""}:${frame.lastSfx}`;
      if (sfxKey !== prevSfxRef.current) {
        playCombatSfx(frame.lastSfx);
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

  const selectPlaybackSpeed = (speed: CombatPlaybackSpeed) => {
    savedSpeedRef.current = speed;
    saveCombatPlaybackSpeed(speed);
    playbackSpeedRef.current = speed;
    setPlaybackSpeed(speed);
  };

  const showArena = !props.bossGateIdle || props.playing;
  const showTransition = !!props.preparingLabel && !arenaReady;

  return (
    <div className={`combat-encounter ${props.className ?? ""}`.trim()}>
      {props.clearChance != null && (props.playing || arenaReady) ? (
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

      {showTransition ? (
        <div className="combat-transition" role="status" aria-live="polite">
          <span className="combat-transition__pulse" aria-hidden />
          <span className="combat-transition__text">{props.preparingLabel}</span>
        </div>
      ) : null}

      <div className="combat-speed combat-speed--toolbar" role="group" aria-label="전투 재생 속도">
        <span className="combat-speed__label">재생 속도</span>
        {COMBAT_PLAYBACK_SPEED_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`combat-speed__btn${playbackSpeed === opt.id ? " combat-speed__btn--active" : ""}`}
            aria-pressed={playbackSpeed === opt.id}
            onClick={() => selectPlaybackSpeed(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {showArena ? (
        <DungeonCombatArena
          replay={props.replay}
          lines={props.lines}
          playing={arenaReady}
          playbackKey={combatPlaybackKey}
          compact={props.embedded}
          idleHint={props.preparingLabel ?? props.idleHint}
          idleTransition={showTransition || !!props.transitioning}
          isBoss={props.isBoss}
          hideEnemyPortrait={props.hideEnemyPortrait}
          onComplete={props.onComplete}
          onFrame={handleFrame}
          onLogLine={appendLogLine}
          playbackSpeedRef={playbackSpeedRef}
          showFeed
          shakeOnHit={arenaReady}
          lowHpVignette={lowHp && arenaReady}
        />
      ) : null}

      {combatLog.length > 0 ? (
        <div className="combat-log" aria-live="polite">
          {combatLog.map((entry) => (
            <p
              key={entry.id}
              className={[
                entry.divider ? "combat-log__divider" : "combat-log__line",
                !entry.divider ? `combat-log__line--${entry.tone}` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {entry.text}
            </p>
          ))}
          <div ref={logEndRef} />
        </div>
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
