"use client";

import { useCallback, useEffect, useState } from "react";
import { CombatEncounterBlock } from "@/app/_components/CombatEncounterBlock";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import { formatPanelError } from "@/shared/formatPanelError";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";
import { apiGetJson, apiPostJson } from "@/shared/sessionClient";

type Opponent = {
  userId: string;
  username: string;
  honorTitle: string | null;
  minionId: string;
  combatClassLabel: string;
  level: number;
  combatPower: number;
};

type PvpState = {
  ok: boolean;
  hasRepresentative: boolean;
  myCombat: {
    minionId: string;
    combatClassLabel: string;
    level: number;
    combatPower: number;
  } | null;
  opponents: Opponent[];
  dailyLimit: number;
  attacksToday: number;
  remainingAttacks: number;
  rank: { rank: number; score: number } | null;
};

type AttackResult = {
  ok: boolean;
  won: boolean;
  outcome: string;
  combatLog: CombatLogLine[];
  combatReplay: DungeonCombatReplay;
  attackerLabel: string;
  defenderLabel: string;
  remainingAttacksToday: number;
};

type HistoryRow = {
  id: string;
  role: "attack" | "defense";
  opponentUsername: string;
  won: boolean;
  createdAt: string;
};

function displayName(username: string, honorTitle: string | null) {
  return honorTitle?.trim() ? `${honorTitle} ${username}` : username;
}

export function PvpPanel({ embedded = false }: EmbeddedPanelProps = {}) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [state, setState] = useState<PvpState | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const [playingLog, setPlayingLog] = useState(false);
  const [battleReplay, setBattleReplay] = useState<DungeonCombatReplay | null>(null);
  const [battleLines, setBattleLines] = useState<CombatLogLine[]>([]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [oppR, histR] = await Promise.all([
        apiGetJson<PvpState>("/api/pvp/opponents"),
        apiGetJson<{ ok: boolean; history: HistoryRow[] }>("/api/pvp/history"),
      ]);
      setState(oppR);
      setHistory(histR.history ?? []);
    } catch (e) {
      setError(e);
    }
  }, [user]);

  useEffect(() => {
    if (sessionLoading) return;
    void refresh();
  }, [refresh, sessionLoading]);

  useEffect(() => {
    if (!embedded || !user) return;
    const onRefresh = () => void refresh();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
  }, [embedded, user, refresh]);

  const startBattlePlayback = (r: AttackResult) => {
    setBattleReplay(r.combatReplay);
    setBattleLines(r.combatLog ?? []);
    setPlayingLog(true);
    setLastMsg(r.won ? "결투 승리!" : "결투 패배…");
  };

  const finishBattlePlayback = () => {
    setPlayingLog(false);
    setBattleReplay(null);
    setBattleLines([]);
    void refresh();
  };

  const attack = async (defenderUserId: string) => {
    setBusy(defenderUserId);
    setError(null);
    setLastMsg(null);
    try {
      const r = await apiPostJson<AttackResult>("/api/pvp/attack", { defenderUserId });
      setState((prev) =>
        prev
          ? {
              ...prev,
              remainingAttacks: r.remainingAttacksToday,
              attacksToday: prev.dailyLimit - r.remainingAttacksToday,
            }
          : prev,
      );
      startBattlePlayback(r);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  if (!embedded && sessionLoading) {
    return <GamePanelLoading label="세션 확인 중…" />;
  }
  if (!embedded && !user) {
    return <GamePanelInfo>로그인이 필요합니다.</GamePanelInfo>;
  }

  return (
    <GamePanel className={`pvp-panel ${embedded ? "pvp-panel--fit panel-fit" : ""}`}>
      <header className="pvp-panel__head">
        <div>
          <p className="game-label">비동기 결투</p>
          <h2 className="game-title text-lg">대표 미니언 결투</h2>
          <p className="mt-1 text-xs text-[var(--game-muted)]">
            상대의 대표 미니언 데이터로 자동 전투 · 실시간 대전 아님
          </p>
        </div>
      </header>

      {error ? <GamePanelError className="mt-3" error={error} /> : null}
      {lastMsg && !playingLog ? (
        <p className="mt-2 text-sm text-[var(--game-gold-bright)]">{lastMsg}</p>
      ) : null}

      {!state ? (
        <GamePanelLoading label="결투장 불러오는 중…" className="mt-4" />
      ) : !state.hasRepresentative ? (
        <div className="mt-4 game-subpanel-inset">
          <p className="text-sm text-[var(--game-muted)]">
            홈 또는 미니언 관리에서 <strong className="text-[var(--game-text)]">대표 미니언</strong>을 먼저 지정해 주세요.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="pvp-panel__status game-subpanel-inset">
            <div className="pvp-panel__status-row">
              <span className="text-xs text-[var(--game-muted)]">내 대표</span>
              <span className="text-sm font-semibold">
                {state.myCombat?.combatClassLabel} Lv{state.myCombat?.level}
              </span>
              <span className="text-xs tabular-nums text-[var(--game-gold-bright)]">
                전투력 {state.myCombat?.combatPower.toLocaleString()}
              </span>
            </div>
            <div className="pvp-panel__status-row">
              <span className="text-xs text-[var(--game-muted)]">오늘 도전</span>
              <span className="text-sm tabular-nums">
                {state.attacksToday}/{state.dailyLimit}
              </span>
              {state.rank ? (
                <span className="text-xs text-[var(--game-muted)]">
                  승수 랭킹 #{state.rank.rank} · {state.rank.score}승
                </span>
              ) : null}
            </div>
          </div>

          {playingLog ? (
            <CombatEncounterBlock
              embedded={embedded}
              playing={playingLog}
              replay={battleReplay}
              lines={battleLines}
              encounterLabel="결투"
              floorLabel="1:1"
              onComplete={finishBattlePlayback}
            />
          ) : (
            <>
              <div>
                <p className="mb-2 text-xs font-semibold text-[var(--game-muted)]">상대 목록</p>
                {state.opponents.length === 0 ? (
                  <p className="text-xs text-[var(--game-muted)]">도전할 상대가 없어요.</p>
                ) : (
                  <ul className="pvp-panel__opponents">
                    {state.opponents.map((o) => (
                      <li key={o.userId} className="pvp-panel__opponent">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{displayName(o.username, o.honorTitle)}</p>
                          <p className="text-xs text-[var(--game-muted)]">
                            {o.combatClassLabel} Lv{o.level} · 전투력 {o.combatPower.toLocaleString()}
                          </p>
                        </div>
                        <GameBtn
                          variant="gold"
                          className="h-8 shrink-0 px-3 text-xs"
                          disabled={!!busy || state.remainingAttacks <= 0}
                          onClick={() => void attack(o.userId)}
                        >
                          {busy === o.userId ? "…" : "도전"}
                        </GameBtn>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {history.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold text-[var(--game-muted)]">최근 전적</p>
                  <ul className="pvp-panel__history">
                    {history.map((h) => (
                      <li key={h.id} className="pvp-panel__history-row">
                        <span className={h.won ? "text-emerald-300" : "text-rose-300"}>
                          {h.won ? "승" : "패"}
                        </span>
                        <span className="text-[var(--game-muted)]">{h.role === "attack" ? "공격" : "방어"}</span>
                        <span className="truncate">{h.opponentUsername}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </GamePanel>
  );
}
