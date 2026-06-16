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
  /** true면 재생 없이 즉시 완료 (자동 층 진행 등) */
  skipPlayback?: boolean;
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
  const [skipRequest, setSkipRequest] = useState(0);
  const playbackSpeedRef = useRef<CombatPlaybackSpeed>("normal");
  const savedSpeedRef = useRef<Exclude<CombatPlaybackSpeed, "skip">>("normal");
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
      if (!props.skipPlayback) {
        const saved = loadCombatPlaybackSpeed();
        savedSpeedRef.current = saved;
        setPlaybackSpeed(saved);
        playbackSpeedRef.current = saved;
      }
      prevHitRef.current = null;
      prevSfxRef.current = null;
      prevOutcomeRef.current = null;
      prevPlayingRef.current = false;
      return;
    }

    if (!prevPlayingRef.current) {
      const floor = props.replay!.floor;
      const label = props.floorLabel ?? `${floor}층`;
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

    if (props.skipPlayback) {
      setPlaybackSpeed("skip");
      playbackSpeedRef.current = "skip";
    } else {
      const saved = savedSpeedRef.current;
      setPlaybackSpeed(saved);
      playbackSpeedRef.current = saved;
    }
    prevPlayingRef.current = true;
    if (!props.skipPlayback) playCombatSfx("start");
  }, [arenaReady, props.replay, props.floorLabel, props.skipPlayback]);

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

  const selectPlaybackSpeed = (speed: Exclude<CombatPlaybackSpeed, "skip">) => {
    savedSpeedRef.current = speed;
    saveCombatPlaybackSpeed(speed);
    playbackSpeedRef.current = speed;
    setPlaybackSpeed(speed);
  };

  const skipPlayback = () => {
    playbackSpeedRef.current = "skip";
    setPlaybackSpeed("skip");
    setSkipRequest((n) => n + 1);
  };

  const showArena = !props.bossGateIdle || props.playing;

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

      {arenaReady ? (
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
          <button
            type="button"
            className="combat-speed__btn combat-speed__btn--skip"
            onClick={skipPlayback}
          >
            건너뛰기
          </button>
        </div>
      ) : null}

      {showArena ? (
        <DungeonCombatArena
          replay={props.replay}
          lines={props.lines}
          playing={arenaReady}
          playbackKey={combatPlaybackKey}
          compact={props.embedded}
          idleHint={props.preparingLabel ?? props.idleHint}
          isBoss={props.isBoss}
          hideEnemyPortrait={props.hideEnemyPortrait}
          onComplete={props.onComplete}
          onFrame={handleFrame}
          onLogLine={appendLogLine}
          playbackSpeedRef={playbackSpeedRef}
          skipRequest={skipRequest}
          showFeed
          shakeOnHit={arenaReady && !props.skipPlayback}
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
