"use client";

import { useEffect, useRef, useState } from "react";
import { CombatPortrait } from "@/app/_components/CombatPortrait";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import {
  applyCombatLogLine,
  initBattleArena,
  lineDelay,
  type BattleArenaFrame,
} from "@/shared/dungeonCombatReplay";

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
};

function hpPct(hp: number, maxHp: number) {
  return Math.max(0, Math.min(100, Math.round((hp / Math.max(1, maxHp)) * 100)));
}

export function DungeonCombatArena(props: Props) {
  const { replay, lines, playing, onComplete, onFrame, compact, showFeed = true, shakeOnHit, lowHpVignette } = props;
  const [frame, setFrame] = useState<BattleArenaFrame | null>(null);
  const [shaking, setShaking] = useState(false);
  const timerRef = useRef<number | null>(null);
  const seqRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const onFrameRef = useRef(onFrame);
  onCompleteRef.current = onComplete;
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!playing || !replay || lines.length === 0) {
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

    const step = () => {
      if (seq !== seqRef.current) return;
      if (i >= lines.length) {
        onFrameRef.current?.(current);
        onCompleteRef.current?.();
        return;
      }
      const line = lines[i]!;
      floaterSeq += 1;
      current = applyCombatLogLine(current, line, floaterSeq);
      setFrame({ ...current, floaters: [...current.floaters] });
      onFrameRef.current?.(current);
      if (shakeOnHit && line.t === "hit") {
        setShaking(true);
        window.setTimeout(() => setShaking(false), 280);
      }
      i += 1;
      timerRef.current = window.setTimeout(step, lineDelay(line));
    };

    timerRef.current = window.setTimeout(step, 320);

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [playing, replay, lines, shakeOnHit]);

  const party = frame?.fighters.filter((f) => f.side === "party") ?? [];
  const enemy = frame?.fighters.find((f) => f.side === "enemy") ?? null;
  const portraitSize = compact ? 32 : 44;
  const enemyPortraitSize = compact ? 52 : 64;

  return (
    <div
      className={[
        "dungeon-arena",
        playing ? "dungeon-arena--live" : "",
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
        <p className="dungeon-arena__idle">
          {playing ? "전투 준비 중…" : "「다음 층」을 눌러\n실시간 전투를 관전하세요."}
        </p>
      ) : (
        <>
          {frame.banner ? (
            <div className={`dungeon-arena__banner ${frame.floor > 0 && frame.enemyName.includes("Boss") ? "dungeon-arena__banner--boss" : ""}`.trim()}>
              {frame.banner}
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
                    frame.hitTargetId === f.id ? "dungeon-arena__fighter--hit" : "",
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
                      style={{ width: `${hpPct(f.hp, f.maxHp)}%`, transition: "width 0.22s ease-out" }}
                    />
                  </div>
                    </div>
                  </div>
                  {frame.floaters
                    .filter((fl) => fl.targetId === f.id)
                    .map((fl) => (
                      <span
                        key={fl.id}
                        className={`dungeon-arena__damage dungeon-arena__damage--${fl.side}`}
                      >
                        -{fl.damage}
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
                  frame.hitTargetId === enemy.id ? "dungeon-arena__enemy--hit" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {enemy.portrait ? (
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
                    className="dungeon-hp-fill dungeon-hp-fill--enemy"
                    style={{ width: `${hpPct(enemy.hp, enemy.maxHp)}%`, transition: "width 0.22s ease-out" }}
                  />
                </div>
                <div className="dungeon-arena__enemy-hp-text tabular-nums">
                  {enemy.dead ? "처치!" : `${enemy.hp}/${enemy.maxHp}`}
                </div>
                {frame.floaters
                  .filter((fl) => fl.targetId === enemy.id)
                  .map((fl) => (
                    <span key={fl.id} className="dungeon-arena__damage dungeon-arena__damage--party">
                      -{fl.damage}
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
            <p className="dungeon-arena__feed">{frame.lastLog}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
