"use client";

import { useEffect, useRef, useState } from "react";
import { CombatPortrait } from "@/app/_components/CombatPortrait";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import {
  applyCombatLogLine,
  combatLogLineText,
  combatLogLineTone,
  initBattleArena,
  combatPlaybackLeadInMs,
  lineDelay,
  type BattleArenaFrame,
  type BattleFloatDamage,
  type CombatPlaybackSpeed,
} from "@/shared/dungeonCombatReplay";
import { playCombatSfx } from "@/shared/gameCombatSfx";

type Props = {
  replay: DungeonCombatReplay | null;
  lines: CombatLogLine[];
  playing: boolean;
  onComplete?: () => void;
  onFrame?: (frame: BattleArenaFrame | null) => void;
  compact?: boolean;
  showFeed?: boolean;
  shakeOnHit?: boolean;
  lowHpVignette?: boolean;
  idleHint?: string;
  idleTransition?: boolean;
  isBoss?: boolean;
  hideEnemyPortrait?: boolean;
  /** 전투마다 고유 — 재생 루프 재시작 트리거 */
  playbackKey?: string;
  playbackSpeedRef: React.MutableRefObject<CombatPlaybackSpeed>;
  onLogLine?: (text: string, tone: BattleArenaFrame["lastLogTone"]) => void;
};

function hpPct(hp: number, maxHp: number) {
  return Math.max(0, Math.min(100, Math.round((hp / Math.max(1, maxHp)) * 100)));
}

function floaterClassName(fl: BattleFloatDamage) {
  if (fl.kind === "heal") return "dungeon-arena__floater dungeon-arena__floater--heal";
  if (fl.kind === "block") return "dungeon-arena__floater dungeon-arena__floater--block";
  const tone = fl.side === "party" ? "party" : "enemy";
  const parts = ["dungeon-arena__floater", "dungeon-arena__damage", `dungeon-arena__damage--${tone}`];
  if (fl.hitKind === "crit") parts.push("dungeon-arena__damage--crit");
  if (fl.hitKind === "extra") parts.push("dungeon-arena__damage--extra");
  return parts.join(" ");
}

function floaterLabel(fl: BattleFloatDamage) {
  if (fl.kind === "heal") return `+${fl.damage}`;
  if (fl.kind === "block") return "막기!";
  return `-${fl.damage}`;
}

function fighterHitClass(
  fighterId: string,
  frame: BattleArenaFrame,
  side: "party" | "enemy",
) {
  if (frame.hitTargetId !== fighterId) return "";
  if (frame.hitFlash === "block") return "dungeon-arena__fighter--block";
  if (frame.hitFlash === "crit") {
    return side === "enemy" ? "dungeon-arena__enemy--crit" : "dungeon-arena__fighter--crit";
  }
  if (frame.hitFlash === "extra") {
    return side === "enemy" ? "dungeon-arena__enemy--extra" : "dungeon-arena__fighter--extra";
  }
  return side === "enemy" ? "dungeon-arena__enemy--hit" : "dungeon-arena__fighter--hit";
}

function feedClassName(tone: BattleArenaFrame["lastLogTone"]) {
  if (tone === "neutral") return "dungeon-arena__feed";
  return `dungeon-arena__feed dungeon-arena__feed--${tone}`;
}

export function DungeonCombatArena(props: Props) {
  const {
    replay,
    lines,
    playing,
    onComplete,
    onFrame,
    compact,
    showFeed = true,
    shakeOnHit,
    lowHpVignette,
    idleHint,
    idleTransition = false,
    isBoss,
    hideEnemyPortrait,
    playbackKey = "",
    playbackSpeedRef,
    onLogLine,
  } = props;
  const [frame, setFrame] = useState<BattleArenaFrame | null>(null);
  const [shaking, setShaking] = useState(false);
  const timerRef = useRef<number | null>(null);
  const seqRef = useRef(0);
  const linesRef = useRef(lines);
  const replayRef = useRef(replay);
  const playProgressRef = useRef<{
    i: number;
    current: BattleArenaFrame;
    floaterSeq: number;
    seq: number;
  } | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onFrameRef = useRef(onFrame);
  const onLogLineRef = useRef(onLogLine);
  onCompleteRef.current = onComplete;
  onFrameRef.current = onFrame;
  onLogLineRef.current = onLogLine;
  linesRef.current = lines;
  replayRef.current = replay;

  const resolveSpeed = (): CombatPlaybackSpeed => playbackSpeedRef.current;

  useEffect(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const replay = replayRef.current;
    const playbackLines = linesRef.current;

    if (!playing || !replay || playbackLines.length === 0) {
      if (!playing) {
        setFrame(null);
        onFrameRef.current?.(null);
      }
      return;
    }

    seqRef.current += 1;
    const seq = seqRef.current;
    let i = 0;
    let floaterSeq = 0;
    let current = initBattleArena(replay);
    setFrame(current);
    onFrameRef.current?.(current);
    playProgressRef.current = { i: 0, current, floaterSeq: 0, seq };

    const step = () => {
      if (seq !== seqRef.current) return;

      if (i >= playbackLines.length) {
        onFrameRef.current?.(current);
        onCompleteRef.current?.();
        return;
      }
      const line = playbackLines[i]!;
      floaterSeq += 1;
      current = applyCombatLogLine(current, line, floaterSeq);
      playProgressRef.current = { i: i + 1, current, floaterSeq, seq };
      setFrame({ ...current, floaters: [...current.floaters] });
      onFrameRef.current?.(current);
      const logText = current.lastLog ?? combatLogLineText(line);
      if (logText) {
        onLogLineRef.current?.(logText, current.lastLog ? current.lastLogTone : combatLogLineTone(line));
      }
      if (shakeOnHit && line.t === "hit" && (line.kind === "crit" || line.kind === "extra" || !line.kind)) {
        setShaking(true);
        window.setTimeout(() => setShaking(false), line.kind === "crit" ? 480 : 380);
      }
      if (line.t === "skill") {
        playCombatSfx("start");
      }
      i += 1;
      timerRef.current = window.setTimeout(step, lineDelay(line, resolveSpeed()));
    };

    timerRef.current = window.setTimeout(step, combatPlaybackLeadInMs(resolveSpeed()));

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [playing, playbackKey, shakeOnHit]);

  const party = frame?.fighters.filter((f) => f.side === "party") ?? [];
  const enemy = frame?.fighters.find((f) => f.side === "enemy") ?? null;
  const portraitSize = compact ? 32 : 44;
  const enemyPortraitSize = compact ? 52 : 64;

  return (
    <div
      className={[
        "dungeon-arena",
        playing ? "dungeon-arena--live" : "",
        idleTransition ? "dungeon-arena--transition" : "",
        isBoss ? "dungeon-arena--boss" : "",
        compact ? "dungeon-arena--compact" : "",
        shaking ? "dungeon-arena--shake" : "",
        lowHpVignette ? "dungeon-arena--danger" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="dungeon-arena__head">
        <span className="dungeon-arena__title">전투</span>
        {playing ? <span className="dungeon-arena__live">진행 중</span> : null}
      </div>

      {!frame ? (
        <p
          className={[
            "dungeon-arena__idle",
            idleTransition ? "dungeon-arena__idle--transition" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {playing
            ? "전투 준비 중…"
            : idleHint ?? "「다음 층」을 눌러\n실시간 전투를 관전하세요."}
        </p>
      ) : (
        <>
          {frame.banner ? (
            <div
              className={[
                "dungeon-arena__banner",
                isBoss || frame.enemyName.includes("Boss") ? "dungeon-arena__banner--boss" : "",
                frame.bossPhaseId != null && frame.bossPhaseId >= 2 ? "dungeon-arena__banner--boss-phase" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {frame.banner}
              {frame.bossPhaseLabel ? (
                <span className="dungeon-arena__boss-phase"> · {frame.bossPhaseLabel}</span>
              ) : null}
            </div>
          ) : null}
          {frame.skillBanner ? (
            <div className="dungeon-arena__skill-banner" role="status">
              {frame.skillActor ? (
                <span className="dungeon-arena__skill-banner-actor">{frame.skillActor}</span>
              ) : null}
              <span className="dungeon-arena__skill-banner-name">{frame.skillBanner}</span>
            </div>
          ) : null}
          <div className="dungeon-arena__field">
            <div className="dungeon-arena__party">
              {party.map((f) => (
                <div
                  key={f.id}
                  className={[
                    "dungeon-arena__fighter",
                    f.dead ? "dungeon-arena__fighter--dead" : "",
                    frame.actingId === f.id ? "dungeon-arena__fighter--acting" : "",
                    fighterHitClass(f.id, frame, "party"),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="dungeon-arena__fighter-body">
                    {f.portrait ? (
                      <CombatPortrait
                        portrait={f.portrait}
                        size={portraitSize}
                        side="party"
                        dead={f.dead}
                      />
                    ) : null}
                    <div className="dungeon-arena__fighter-main">
                  <div className="dungeon-arena__fighter-head">
                    <span className="truncate">{f.label}</span>
                    <span className="tabular-nums text-[var(--game-muted)]">
                      {f.dead ? "KO" : `${f.hp}/${f.maxHp}`}
                    </span>
                  </div>
                  <div className="dungeon-hp-track">
                    <div
                      className={`dungeon-hp-fill${hpPct(f.hp, f.maxHp) <= 30 && !f.dead ? " dungeon-hp-fill--low" : ""}`.trim()}
                      style={{ width: `${hpPct(f.hp, f.maxHp)}%`, transition: "width 0.42s ease-out" }}
                    />
                  </div>
                    </div>
                  </div>
                  {frame.floaters
                    .filter((fl) => fl.targetId === f.id)
                    .map((fl) => (
                      <span key={fl.id} className={floaterClassName(fl)}>
                        {floaterLabel(fl)}
                      </span>
                    ))}
                </div>
              ))}
            </div>

            <div className="dungeon-arena__vs" aria-hidden>
              VS
            </div>

            {enemy ? (
              <div
                className={[
                  "dungeon-arena__enemy",
                  enemy.dead ? "dungeon-arena__enemy--dead" : "",
                  frame.actingId === enemy.id ? "dungeon-arena__enemy--acting" : "",
                  fighterHitClass(enemy.id, frame, "enemy"),
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {!hideEnemyPortrait && enemy.portrait ? (
                  <CombatPortrait
                    portrait={enemy.portrait}
                    size={enemyPortraitSize}
                    side="enemy"
                    dead={enemy.dead}
                    className="dungeon-arena__enemy-portrait"
                  />
                ) : null}
                <div className="dungeon-arena__enemy-name">{enemy.label}</div>
                <div className="dungeon-hp-track dungeon-arena__enemy-hp">
                  <div
                    className={[
                      "dungeon-hp-fill",
                      "dungeon-hp-fill--enemy",
                      frame.bossPhaseId === 2 ? "dungeon-hp-fill--phase-2" : "",
                      frame.bossPhaseId != null && frame.bossPhaseId >= 3 ? "dungeon-hp-fill--phase-3" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ width: `${hpPct(enemy.hp, enemy.maxHp)}%`, transition: "width 0.42s ease-out" }}
                  />
                </div>
                <div className="dungeon-arena__enemy-hp-text tabular-nums">
                  {enemy.dead ? "처치!" : `${enemy.hp}/${enemy.maxHp}`}
                </div>
                {frame.floaters
                  .filter((fl) => fl.targetId === enemy.id)
                  .map((fl) => (
                    <span key={fl.id} className={floaterClassName(fl)}>
                      {floaterLabel(fl)}
                    </span>
                  ))}
              </div>
            ) : null}
          </div>

          {frame.outcome ? (
            <div
              className={`dungeon-arena__result ${frame.outcome === "WIN" ? "dungeon-arena__result--win" : "dungeon-arena__result--loss"}`}
            >
              {frame.outcome === "WIN" ? "✦ 층 클리어!" : "✦ 전멸…"}
            </div>
          ) : showFeed && frame.lastLog ? (
            <p className={feedClassName(frame.lastLogTone)}>{frame.lastLog}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
