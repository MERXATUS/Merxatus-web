"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CombatEncounterBlock } from "@/app/_components/CombatEncounterBlock";
import {
  DungeonPartyPickModal,
  partyPickChips,
  type PartyPickMinionRow,
} from "@/app/_components/DungeonPartyPickModal";
import { PushLuckRiskBar } from "@/app/_components/PushLuckRiskBar";
import { DungeonCashoutConfirmModal } from "@/app/_components/DungeonCashoutConfirmModal";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import type { DungeonLootRow } from "@/shared/dungeonSettlement";
import { readSavedPartyIds, resolveSavedPartyIds, writeSavedPartyIds } from "@/shared/savedParty";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { fetchCombatRoster } from "@/shared/combatRosterClient";
import { API_CACHE_TTL } from "@/shared/apiCache";
import { apiGetJson, apiGetJsonCached, apiPostJson } from "@/shared/sessionClient";

const TOWER_PARTY_KEY = "tower_party_minion_ids_v1";
const MAX_PARTY = 3;

type MinionRow = PartyPickMinionRow & { pool?: string };
type LeaderRow = { rank: number; username: string; score: number };
type TowerState = {
  ok: boolean;
  active: boolean;
  combat?: { clearChance: number; isBoss?: boolean };
  config?: { name: string; seasonKey: string };
  rank?: { rank: number; score: number } | null;
  leaderboard?: LeaderRow[];
  run?: { floor: number; bestFloor: number; pendingLoot: Array<{ itemId?: string; name: string; qty: number }> };
};

type AdvanceResult = {
  result: string;
  floor?: number;
  clearChance?: number;
  combatLog?: CombatLogLine[];
  combatReplay?: DungeonCombatReplay;
  isBoss?: boolean;
  lootMultiplier?: number;
};

export function TowerPanel({ embedded = false }: { embedded?: boolean }) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [state, setState] = useState<TowerState | null>(null);
  const [minions, setMinions] = useState<MinionRow[]>([]);
  const [partyIds, setPartyIds] = useState<Set<string>>(new Set());
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyBusy, setPartyBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const [playingLog, setPlayingLog] = useState(false);
  const [battleReplay, setBattleReplay] = useState<DungeonCombatReplay | null>(null);
  const [battleLines, setBattleLines] = useState<CombatLogLine[]>([]);
  const [combatIsBoss, setCombatIsBoss] = useState(false);
  const [playbackClearChance, setPlaybackClearChance] = useState<number | null>(null);
  const [cashoutConfirmOpen, setCashoutConfirmOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const pendingResultRef = useRef<AdvanceResult | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [towerR, roster] = await Promise.all([
        apiGetJson<TowerState>("/api/tower/run/state"),
        fetchCombatRoster(user.id),
      ]);
      setState(towerR);
      setMinions(roster);
      if (!towerR.active) {
        setPartyIds(resolveSavedPartyIds(readSavedPartyIds(TOWER_PARTY_KEY), roster, MAX_PARTY));
      }
    } catch (e) {
      setError(e);
    }
  }, [user]);

  const refreshLeaderboard = useCallback(async (force?: boolean) => {
    if (!user) return;
    setLeaderboardLoading(true);
    try {
      const boardR = await apiGetJsonCached<{
        ok: boolean;
        rank?: TowerState["rank"];
        leaderboard?: LeaderRow[];
      }>("/api/tower/leaderboard", { ttlMs: API_CACHE_TTL.towerLeaderboard, force });
      setState((prev) =>
        prev
          ? {
              ...prev,
              rank: boardR.rank ?? prev.rank,
              leaderboard: boardR.leaderboard ?? prev.leaderboard,
            }
          : prev,
      );
    } catch {
      /* 랭킹은 부가 정보 */
    } finally {
      setLeaderboardLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!embedded && sessionLoading) return;
    if (!user) return;
    void refresh();
  }, [embedded, sessionLoading, user?.id, refresh]);

  useEffect(() => {
    if (!leaderboardOpen || !user) return;
    void refreshLeaderboard();
  }, [leaderboardOpen, user?.id, refreshLeaderboard]);

  useEffect(() => {
    if (!embedded) return;
    const onRefresh = () => void refresh();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
  }, [embedded, refresh]);

  useEscapeClose(partyOpen, () => setPartyOpen(false));

  const partyChips = useMemo(() => partyPickChips(minions, partyIds), [minions, partyIds]);

  useEffect(() => {
    if (state?.active) return;
    if (!minions.length) return;
    setPartyIds((prev) => {
      const trimmed = resolveSavedPartyIds([...prev], minions, MAX_PARTY);
      if (trimmed.size > 0) return trimmed;
      return resolveSavedPartyIds(readSavedPartyIds(TOWER_PARTY_KEY), minions, MAX_PARTY);
    });
  }, [minions, state?.active]);

  async function openParty() {
    setPartyOpen(true);
    setPartyBusy(true);
    try {
      const roster = await fetchCombatRoster(user!.id, { force: true });
      setMinions(roster);
    } catch (e) {
      setError(e);
    } finally {
      setPartyBusy(false);
    }
  }

  function toggleParty(id: string, on: boolean) {
    setPartyIds((prev) => {
      if (on) {
        if (MAX_PARTY <= 1) return new Set([id]);
        const next = new Set(prev);
        if (next.size >= MAX_PARTY && !next.has(id)) return prev;
        next.add(id);
        return next;
      }
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function confirmParty() {
    writeSavedPartyIds(TOWER_PARTY_KEY, partyIds);
    setPartyOpen(false);
  }

  const pendingSummary = state?.run?.pendingLoot.map((x) => `${x.name}×${x.qty}`).join(", ");
  const cashoutLoot: DungeonLootRow[] = (state?.run?.pendingLoot ?? []).map((x, i) => ({
    itemId: x.itemId ?? `tower_loot_${i}`,
    name: x.name,
    qty: x.qty,
    grade: 1,
  }));

  function finishBattlePlayback() {
    setPlayingLog(false);
    setBattleReplay(null);
    setBattleLines([]);
    const adv = pendingResultRef.current;
    pendingResultRef.current = null;
    if (adv) {
      if (adv.result === "LOSS") setLastMsg("패배 — 기록 갱신");
      else setLastMsg(`클리어 (배수 ×${adv.lootMultiplier ?? 1})`);
    }
    void refresh();
  }

  function startBattlePlayback(adv: AdvanceResult) {
    const lines = adv.combatLog ?? [];
    const replay = adv.combatReplay ?? null;
    pendingResultRef.current = adv;
    if (!lines.length || !replay) {
      finishBattlePlayback();
      return;
    }
    setCombatIsBoss(!!adv.isBoss);
    setPlaybackClearChance(adv.clearChance ?? null);
    setBattleReplay(replay);
    setBattleLines(lines);
    setPlayingLog(true);
  }

  async function executeCashout() {
    setCashoutConfirmOpen(false);
    setBusy("cashout");
    try {
      const r = await apiPostJson<{ bestFloor?: number; rank?: { rank: number } | null }>(
        "/api/tower/run/cashout",
        {},
      );
      setLastMsg(`정산 · ${r.bestFloor ?? 0}층${r.rank ? ` · #${r.rank.rank}` : ""}`);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  if (!embedded && sessionLoading) return <GamePanelLoading label="삼계의 탑 불러오는 중…" />;
  if (!embedded && !user) return <p className="text-sm text-[var(--game-muted)]">로그인 후 이용할 수 있습니다.</p>;
  if (embedded && !user) return null;

  const active = state?.active ?? false;

  return (
    <GamePanel className={embedded ? "panel-fit" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="game-label">삼계의 탑</p>
          <h2 className="game-title text-lg">{state?.config?.name ?? "삼계의 탑"}</h2>
          <p className="mt-1 text-xs text-[var(--game-muted)]">Push Luck · 층↑ 배수↑ · 랭킹은 최고 층 기준</p>
        </div>
        <span className={`dungeon-status-pill ${active ? "dungeon-status-pill--live" : ""}`.trim()}>
          {active ? "● 도전 중" : "○ 대기"}
        </span>
      </div>

      {state?.rank ? (
        <p className="mt-2 text-xs text-[var(--game-muted)]">
          내 최고 기록: {state.rank.score}층 · 순위 #{state.rank.rank}
        </p>
      ) : null}

      {error ? <GamePanelError className="mt-3" error={error} /> : null}
      {lastMsg && !playingLog ? <p className="mt-2 text-sm text-[var(--game-gold-bright)]">{lastMsg}</p> : null}

      {active && state?.run ? (
        <div className="mt-4 space-y-3">
          <div className="game-subpanel-inset">
            <p className="text-sm font-semibold">{state.run.floor}층 도전 중</p>
            <p className="text-xs text-[var(--game-muted)]">이번 run 최고: {state.run.bestFloor}층</p>
          </div>

          {state.combat?.clearChance != null && !playingLog ? (
            <PushLuckRiskBar
              clearChance={state.combat.clearChance}
              floorLabel={`${state.run.floor}층`}
              pendingSummary={pendingSummary || undefined}
            />
          ) : null}

          <CombatEncounterBlock
            embedded={embedded}
            playing={playingLog}
            replay={battleReplay}
            lines={battleLines}
            isBoss={combatIsBoss || !!state.combat?.isBoss}
            encounterLabel={combatIsBoss ? `${state.run.floor}층 보스` : `${state.run.floor}층`}
            clearChance={playbackClearChance ?? state.combat?.clearChance ?? null}
            floorLabel={`${state.run.floor}층`}
            pendingSummary={pendingSummary || undefined}
            onComplete={finishBattlePlayback}
          />

          <div className="flex flex-wrap gap-2">
            <GameBtn
              variant="gold"
              disabled={!!busy || playingLog}
              onClick={async () => {
                setBusy("advance");
                setLastMsg(null);
                try {
                  const r = await apiPostJson<AdvanceResult>("/api/tower/run/advance", {});
                  startBattlePlayback(r);
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {playingLog ? "전투 중…" : "다음 층"}
            </GameBtn>
            <GameBtn variant="ghost" disabled={!!busy || playingLog} onClick={() => setCashoutConfirmOpen(true)}>
              정산
            </GameBtn>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[var(--game-muted)]">파티 {partyIds.size}/{MAX_PARTY}</p>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {partyChips.length === 0 ? (
                <span className="text-xs text-[var(--game-muted-dim)]">미선택</span>
              ) : (
                partyChips.map((c) => (
                  <span key={c.id} className="dungeon-party-chip text-xs">
                    {c.label}
                  </span>
                ))
              )}
            </div>
            <GameBtn
              variant="ghost"
              className="mt-2 h-9 w-full text-xs"
              disabled={!!busy}
              onClick={() => void openParty()}
            >
              파티 편성
            </GameBtn>
          </div>
          <GameBtn
            variant="gold"
            className="w-full h-10"
            disabled={!!busy || partyIds.size === 0}
            onClick={async () => {
              setBusy("start");
              setState((prev) => ({
                ok: true,
                active: true,
                config: prev?.config ?? { name: "삼계의 탑", seasonKey: "" },
                run: { floor: 1, bestFloor: 0, pendingLoot: [] },
              }));
              try {
                await apiPostJson("/api/tower/run/start", { minionIds: [...partyIds] });
                setLastMsg("탑 도전 시작");
                void refresh();
              } catch (e) {
                setState((prev) => (prev?.active ? { ...prev, active: false, run: undefined } : prev));
                setError(e);
              } finally {
                setBusy(null);
              }
            }}
          >
            도전 시작
          </GameBtn>
        </div>
      )}

      <div className="mt-4">
        <GameBtn
          variant="ghost"
          className="h-8 w-full text-xs"
          onClick={() => setLeaderboardOpen((v) => !v)}
        >
          {leaderboardOpen ? "랭킹 접기" : "랭킹 보기"}
          {state?.rank ? ` · 내 기록 ${state.rank.score}층 (#${state.rank.rank})` : ""}
        </GameBtn>
        {leaderboardOpen ? (
          <div className="mt-2 game-subpanel-inset">
            {leaderboardLoading && !state?.leaderboard?.length ? (
              <p className="text-xs text-[var(--game-muted)]">랭킹 불러오는 중…</p>
            ) : state?.leaderboard && state.leaderboard.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-[var(--game-muted)]">랭킹 TOP 10</p>
                <ol className="mt-2 space-y-1 text-xs">
                  {state.leaderboard.map((row) => (
                    <li key={row.rank} className="flex justify-between">
                      <span>
                        #{row.rank} {row.username}
                      </span>
                      <span className="tabular-nums">{row.score}층</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-xs text-[var(--game-muted)]">아직 랭킹 기록이 없어요.</p>
            )}
          </div>
        ) : null}
      </div>

      <DungeonCashoutConfirmModal
        open={cashoutConfirmOpen}
        loot={cashoutLoot}
        onCancel={() => setCashoutConfirmOpen(false)}
        onConfirm={() => void executeCashout()}
      />

      <DungeonPartyPickModal
        open={partyOpen}
        maxParty={MAX_PARTY}
        partyIds={partyIds}
        minions={minions}
        loading={partyBusy}
        onClose={() => setPartyOpen(false)}
        onToggle={toggleParty}
        onConfirm={confirmParty}
      />
    </GamePanel>
  );
}
