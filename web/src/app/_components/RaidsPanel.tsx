"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CombatEncounterBlock } from "@/app/_components/CombatEncounterBlock";
import {
  DungeonPartyPickModal,
  partyPickChips,
  type PartyPickMinionRow,
} from "@/app/_components/DungeonPartyPickModal";
import { PushLuckRiskBar } from "@/app/_components/PushLuckRiskBar";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { isDungeonPool } from "@/server/minionJobs";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import { readSavedPartyIds, resolveSavedPartyIds, writeSavedPartyIds } from "@/shared/savedParty";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { apiGetJson, apiPostJson } from "@/shared/sessionClient";

const RAID_PARTY_KEY = "raid_party_minion_ids_v1";

type RaidDef = { id: string; name: string; maxPhases: number; maxPartySize: number };
type MinionRow = PartyPickMinionRow & { pool?: string };
type RunState = {
  active: boolean;
  combat?: { clearChance: number; isBoss?: boolean };
  run?: {
    raidId: string;
    raidName: string;
    phase: number;
    maxPhases: number;
    pendingLoot: Array<{ name: string; qty: number }>;
  };
};

type AdvanceResult = {
  result: string;
  phase?: number;
  clearChance?: number;
  combatLog?: CombatLogLine[];
  combatReplay?: DungeonCombatReplay;
  isBoss?: boolean;
};

export function RaidsPanel({ embedded = false }: { embedded?: boolean }) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [raids, setRaids] = useState<RaidDef[]>([]);
  const [minions, setMinions] = useState<MinionRow[]>([]);
  const [selectedRaidId, setSelectedRaidId] = useState("");
  const [partyIds, setPartyIds] = useState<Set<string>>(new Set());
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyBusy, setPartyBusy] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const [playingLog, setPlayingLog] = useState(false);
  const [battleReplay, setBattleReplay] = useState<DungeonCombatReplay | null>(null);
  const [battleLines, setBattleLines] = useState<CombatLogLine[]>([]);
  const [combatIsBoss, setCombatIsBoss] = useState(false);
  const [playbackClearChance, setPlaybackClearChance] = useState<number | null>(null);
  const [bossPickerOpen, setBossPickerOpen] = useState(false);
  const pendingResultRef = useRef<AdvanceResult | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [listR, stateR, minionR] = await Promise.all([
        apiGetJson<{ ok: boolean; raids: RaidDef[] }>("/api/raids/list"),
        apiGetJson<RunState & { ok: boolean }>("/api/raids/run/state"),
        apiGetJson<{ ok: boolean; minions: MinionRow[] }>("/api/minions/list"),
      ]);
      setRaids(listR.raids ?? []);
      setRun(stateR);
      const roster = (minionR.minions ?? []).filter((m) => isDungeonPool(m.pool));
      setMinions(roster);
      if (!selectedRaidId && listR.raids?.[0]) setSelectedRaidId(listR.raids[0].id);
      if (!stateR.active) {
        const cap = Math.max(1, listR.raids?.find((r) => r.id === (selectedRaidId || listR.raids?.[0]?.id))?.maxPartySize ?? 3);
        setPartyIds(resolveSavedPartyIds(readSavedPartyIds(RAID_PARTY_KEY), roster, cap));
      }
    } catch (e) {
      setError(e);
    }
  }, [user, selectedRaidId]);

  useEffect(() => {
    if (sessionLoading) return;
    void refresh();
  }, [sessionLoading, user?.id, refresh]);

  useEffect(() => {
    if (!embedded) return;
    const onRefresh = () => void refresh();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
  }, [embedded, refresh]);

  useEscapeClose(partyOpen, () => setPartyOpen(false));

  const maxParty = Math.max(1, raids.find((r) => r.id === selectedRaidId)?.maxPartySize ?? 3);
  const partyChips = useMemo(() => partyPickChips(minions, partyIds), [minions, partyIds]);

  useEffect(() => {
    if (run?.active) return;
    if (!minions.length) return;
    setPartyIds((prev) => {
      const trimmed = resolveSavedPartyIds([...prev], minions, maxParty);
      if (trimmed.size > 0) return trimmed;
      return resolveSavedPartyIds(readSavedPartyIds(RAID_PARTY_KEY), minions, maxParty);
    });
  }, [minions, maxParty, run?.active]);

  async function openParty() {
    setPartyOpen(true);
    setPartyBusy(true);
    try {
      const r = await apiGetJson<{ ok: boolean; minions: MinionRow[] }>("/api/minions/list");
      if (r.ok) setMinions((r.minions ?? []).filter((m) => isDungeonPool(m.pool)));
    } catch (e) {
      setError(e);
    } finally {
      setPartyBusy(false);
    }
  }

  function toggleParty(id: string, on: boolean) {
    setPartyIds((prev) => {
      if (on) {
        if (maxParty <= 1) return new Set([id]);
        const next = new Set(prev);
        if (next.size >= maxParty && !next.has(id)) return prev;
        next.add(id);
        return next;
      }
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function confirmParty() {
    writeSavedPartyIds(RAID_PARTY_KEY, partyIds);
    setPartyOpen(false);
  }

  function finishBattlePlayback() {
    setPlayingLog(false);
    setBattleReplay(null);
    setBattleLines([]);
    const adv = pendingResultRef.current;
    pendingResultRef.current = null;
    if (adv) {
      if (adv.result === "CLEARED") setLastMsg("레이드 클리어!");
      else if (adv.result === "LOSS") setLastMsg("전멸… 누적 보상 소멸");
      else setLastMsg(`페이즈 ${adv.phase ?? "?"} 클리어`);
    }
    void refresh();
  }

  function startBattlePlayback(adv: AdvanceResult) {
    const lines = adv.combatLog ?? [];
    const replay = adv.combatReplay ?? null;
    if (!lines.length || !replay) {
      finishBattlePlayback();
      return;
    }
    pendingResultRef.current = adv;
    setCombatIsBoss(!!adv.isBoss);
    setPlaybackClearChance(adv.clearChance ?? null);
    setBattleReplay(replay);
    setBattleLines(lines);
    setPlayingLog(true);
  }

  if (sessionLoading) return <GamePanelLoading label="레이드 불러오는 중…" />;
  if (!user) return <p className="text-sm text-[var(--game-muted)]">로그인 후 레이드를 이용할 수 있습니다.</p>;

  const active = run?.active ?? false;
  const pendingSummary = run?.run?.pendingLoot.map((x) => `${x.name}×${x.qty}`).join(", ");
  const selectedRaid = raids.find((r) => r.id === selectedRaidId) ?? null;

  function pickRaid(raidId: string) {
    setSelectedRaidId(raidId);
    setBossPickerOpen(false);
  }

  return (
    <GamePanel className={embedded ? "panel-fit" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="game-label">레이드</p>
          <h2 className="game-title text-lg">보스 레이드</h2>
          <p className="mt-1 text-xs text-[var(--game-muted)]">보스 선택 입장 · 전용 파편 · 패배 시 누적 보상 소멸</p>
        </div>
        <span className={`dungeon-status-pill ${active ? "dungeon-status-pill--live" : ""}`.trim()}>
          {active ? "● 진행 중" : "○ 대기"}
        </span>
      </div>

      {error ? <GamePanelError className="mt-3" error={error} /> : null}
      {lastMsg && !playingLog ? <p className="mt-2 text-sm text-[var(--game-gold-bright)]">{lastMsg}</p> : null}

      {active && run?.run ? (
        <div className="mt-4 space-y-3">
          <div className="game-subpanel-inset">
            <p className="text-sm font-semibold">{run.run.raidName}</p>
            <p className="text-xs text-[var(--game-muted)]">
              {run.run.maxPhases > 1 ? `페이즈 ${run.run.phase} / ${run.run.maxPhases}` : "보스전"}
            </p>
          </div>

          {run.combat?.clearChance != null && !playingLog ? (
            <PushLuckRiskBar
              clearChance={run.combat.clearChance}
              floorLabel={run.run.maxPhases > 1 ? `페이즈 ${run.run.phase}` : run.run.raidName}
              pendingSummary={pendingSummary || undefined}
            />
          ) : null}

          <CombatEncounterBlock
            embedded={embedded}
            playing={playingLog}
            replay={battleReplay}
            lines={battleLines}
            isBoss={combatIsBoss || !!run.combat?.isBoss}
            encounterLabel={combatIsBoss ? `${run.run.raidName} (보스)` : run.run.raidName}
            clearChance={playbackClearChance ?? run.combat?.clearChance ?? null}
            floorLabel={run.run.maxPhases > 1 ? `페이즈 ${run.run.phase}` : run.run.raidName}
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
                  const r = await apiPostJson<AdvanceResult>("/api/raids/run/advance", {
                    raidId: run.run!.raidId,
                  });
                  startBattlePlayback(r);
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {playingLog ? "전투 중…" : run.run.maxPhases > 1 ? "다음 페이즈" : "보스 도전"}
            </GameBtn>
            <GameBtn
              variant="ghost"
              disabled={!!busy || playingLog}
              onClick={async () => {
                setBusy("stop");
                try {
                  await apiPostJson("/api/raids/run/stop", {});
                  setLastMsg("레이드 중단");
                  await refresh();
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(null);
                }
              }}
            >
              중단
            </GameBtn>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="raid-boss-picker">
            <div className="raid-boss-picker__row">
              <p className="raid-boss-picker__current">
                {selectedRaid ? selectedRaid.name : "보스를 선택하세요"}
              </p>
              <GameBtn
                variant="ghost"
                className="h-9 shrink-0 px-3 text-xs"
                disabled={!!busy}
                onClick={() => setBossPickerOpen((open) => !open)}
              >
                {bossPickerOpen ? "닫기" : "레이드 선택"}
              </GameBtn>
            </div>
            {bossPickerOpen ? (
              <div className="raid-boss-pick-grid" role="listbox" aria-label="레이드 보스">
                {raids.map((r) => {
                  const selected = selectedRaidId === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={!!busy}
                      className={["raid-boss-pick-card", selected ? "raid-boss-pick-card--selected" : ""]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => pickRaid(r.id)}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[var(--game-muted)]">파티 {partyIds.size}/{maxParty}</p>
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
            disabled={!!busy || partyIds.size === 0 || !selectedRaidId}
            onClick={async () => {
              setBusy("start");
              try {
                await apiPostJson("/api/raids/run/start", { raidId: selectedRaidId, minionIds: [...partyIds] });
                setLastMsg("레이드 시작");
                await refresh();
              } catch (e) {
                setError(e);
              } finally {
                setBusy(null);
              }
            }}
          >
            레이드 시작
          </GameBtn>
        </div>
      )}

      <DungeonPartyPickModal
        open={partyOpen}
        maxParty={maxParty}
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
