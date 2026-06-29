"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CombatEncounterBlock } from "@/app/_components/CombatEncounterBlock";
import { DungeonDropTable } from "@/app/_components/DungeonDropTable";
import { DungeonRunSettlementModal } from "@/app/_components/DungeonRunSettlementModal";
import {
  DungeonPartyPickModal,
  partyPickChips,
  type PartyPickMinionRow,
} from "@/app/_components/DungeonPartyPickModal";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import { readSavedPartyIds, resolveSavedPartyIds, writeSavedPartyIds } from "@/shared/savedParty";
import { useEscapeClose } from "@/shared/useEscapeClose";
import type { DungeonLootRow, DungeonSettlement } from "@/shared/dungeonSettlement";
import { formatRaidPartyLootMultiplier, raidPartyLootMultiplier } from "@/shared/raidPartyLoot";
import { raidKindLabel } from "@/shared/raidBossKind";
import { RAID_FACTION_LABELS, RAID_FACTION_ORDER, type RaidFaction } from "@/shared/raidFaction";
import {
  difficultyModeTabLabel,
  formatRaidDifficultyLine,
  partyPowerAdequacy,
  RAID_DIFFICULTY_MODE_ORDER,
} from "@/shared/raidDifficulty";
import type { RaidDifficultyMode } from "@/shared/raidRoster";
import { API_CACHE_TTL } from "@/shared/apiCache";
import { fetchCombatRoster } from "@/shared/combatRosterClient";
import { apiGetJson, apiGetJsonCachedSwr, apiPostJson } from "@/shared/sessionClient";
import { raidDropTableForId } from "@/shared/raidDropTablesData";
import { RAIDS_CATALOG, type RaidCatalogEntry } from "@/shared/raidsCatalogData";

const RAID_PARTY_KEY = "raid_party_minion_ids_v1";

type RaidDef = RaidCatalogEntry & { canEnter?: boolean };
type RaidEntryTicket = {
  itemId: string;
  name: string;
  availableQty: number;
};
type MinionRow = PartyPickMinionRow & { pool?: string };
type RunState = {
  active: boolean;
  combatActive?: boolean;
  combat?: { isBoss?: boolean };
  lootMultiplier?: number;
  partySize?: number;
  maxPartySize?: number;
  run?: {
    raidId: string;
    raidName: string;
    phase: number;
    maxPhases: number;
    pendingLoot: Array<{ name: string; qty: number }>;
  };
};

type AdvanceResult = {
  ok?: boolean;
  result: string;
  phase?: number;
  clearChance?: number;
  lootMultiplier?: number;
  goldGained?: number;
  loot?: DungeonLootRow[];
  lootGained?: DungeonLootRow[];
  pendingLoot?: DungeonLootRow[];
  forfeitedLoot?: DungeonLootRow[];
  combatLog?: CombatLogLine[];
  combatReplay?: DungeonCombatReplay;
  isBoss?: boolean;
};

export function RaidsPanel({ embedded = false }: { embedded?: boolean }) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [raids, setRaids] = useState<RaidDef[]>(() =>
    RAIDS_CATALOG.map((r) => ({ ...r, canEnter: false })),
  );
  const [entryTicket, setEntryTicket] = useState<RaidEntryTicket | null>(null);
  const [minions, setMinions] = useState<MinionRow[]>([]);
  const [selectedRaidId, setSelectedRaidId] = useState("");
  const [partyIds, setPartyIds] = useState<Set<string>>(new Set());
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyBusy, setPartyBusy] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const [combatActive, setCombatActive] = useState(false);
  const [playingLog, setPlayingLog] = useState(false);
  const [battleReplay, setBattleReplay] = useState<DungeonCombatReplay | null>(null);
  const [battleLines, setBattleLines] = useState<CombatLogLine[]>([]);
  const [bossPickerOpen, setBossPickerOpen] = useState(false);
  const [difficultyModeTab, setDifficultyModeTab] = useState<RaidDifficultyMode>("normal");
  const [factionTab, setFactionTab] = useState<RaidFaction>("demon");
  const pendingResultRef = useRef<AdvanceResult | null>(null);
  const [clearSettlement, setClearSettlement] = useState<DungeonSettlement | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError(null);
    setDataLoading(true);
    try {
      const [entryR, stateR, roster] = await Promise.all([
        apiGetJsonCachedSwr<{ ok: boolean; entryTicket: RaidEntryTicket }>("/api/raids/entry", {
          ttlMs: API_CACHE_TTL.raidsEntry,
        }),
        apiGetJsonCachedSwr<RunState & { ok: boolean }>("/api/raids/run/state?lite=1", {
          ttlMs: API_CACHE_TTL.runState,
        }),
        fetchCombatRoster(user.id),
      ]);
      const ticketQty = entryR.entryTicket?.availableQty ?? 0;
      setRaids(RAIDS_CATALOG.map((r) => ({ ...r, canEnter: ticketQty >= r.entryTicketCost })));
      setEntryTicket(entryR.entryTicket ?? null);
      setRun(stateR);
      setMinions(roster);
      // ATB 전투 상태가 남아 있어도 UI는 로그 전투로 통일한다.
      if (!selectedRaidId && RAIDS_CATALOG[0]) setSelectedRaidId(RAIDS_CATALOG[0].id);
      if (!stateR.active) {
        const cap = Math.max(
          1,
          RAIDS_CATALOG.find((r) => r.id === (selectedRaidId || RAIDS_CATALOG[0]?.id))?.maxPartySize ?? 3,
        );
        setPartyIds(resolveSavedPartyIds(readSavedPartyIds(RAID_PARTY_KEY), roster, cap));
      }
    } catch (e) {
      setError(e);
    } finally {
      setDataLoading(false);
    }
  }, [user, selectedRaidId]);

  useEffect(() => {
    if (!embedded && sessionLoading) return;
    if (!user) return;
    void refresh();
  }, [embedded, sessionLoading, user?.id, refresh]);

  useEffect(() => {
    if (!embedded) return;
    const onRefresh = () => void refresh();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
  }, [embedded, refresh]);

  useEscapeClose(partyOpen, () => setPartyOpen(false));

  const maxParty = Math.max(1, raids.find((r) => r.id === selectedRaidId)?.maxPartySize ?? 3);
  const partyLootMult = raidPartyLootMultiplier(partyIds.size || 1, maxParty);
  const partyLootMultLabel = formatRaidPartyLootMultiplier(partyIds.size || 1, maxParty);
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

  const selectedRaid = useMemo(
    () => raids.find((r) => r.id === selectedRaidId) ?? null,
    [raids, selectedRaidId],
  );
  const difficultyTabs = useMemo(() => {
    const counts = new Map<RaidDifficultyMode, number>();
    for (const r of raids) {
      const mode = r.difficulty ?? "normal";
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
    }
    return RAID_DIFFICULTY_MODE_ORDER.filter((m) => counts.has(m)).map((m) => ({
      mode: m,
      label: difficultyModeTabLabel(m),
      count: counts.get(m)!,
    }));
  }, [raids]);
  const raidsInDifficulty = useMemo(
    () => raids.filter((r) => (r.difficulty ?? "normal") === difficultyModeTab),
    [raids, difficultyModeTab],
  );
  const factionTabs = useMemo(
    () =>
      RAID_FACTION_ORDER.filter((f) => raidsInDifficulty.some((r) => r.faction === f)).map((f) => ({
        faction: f,
        label: RAID_FACTION_LABELS[f],
        count: raidsInDifficulty.filter((r) => r.faction === f).length,
      })),
    [raidsInDifficulty],
  );
  const visibleRaids = useMemo(
    () => raidsInDifficulty.filter((r) => r.faction === factionTab),
    [raidsInDifficulty, factionTab],
  );
  const partyPower = useMemo(() => {
    let sum = 0;
    for (const id of partyIds) {
      const m = minions.find((row) => row.id === id);
      sum += m?.combatStats?.combatPower ?? 0;
    }
    return sum;
  }, [minions, partyIds]);

  useEffect(() => {
    if (!raids.length || !difficultyTabs.length) return;
    if (!difficultyTabs.some((t) => t.mode === difficultyModeTab)) {
      setDifficultyModeTab(difficultyTabs[0]!.mode);
    }
  }, [raids.length, difficultyTabs, difficultyModeTab]);

  useEffect(() => {
    if (!factionTabs.length) return;
    if (!factionTabs.some((t) => t.faction === factionTab)) {
      setFactionTab(factionTabs[0]!.faction);
    }
  }, [factionTabs, factionTab]);

  useEffect(() => {
    if (!raids.length) return;
    if (visibleRaids.some((r) => r.id === selectedRaidId)) return;
    if (visibleRaids[0]) setSelectedRaidId(visibleRaids[0].id);
  }, [visibleRaids, raids.length, selectedRaidId]);

  useEffect(() => {
    if (!bossPickerOpen || !selectedRaid) return;
    setDifficultyModeTab(selectedRaid.difficulty ?? "normal");
    if (selectedRaid.faction) setFactionTab(selectedRaid.faction);
  }, [bossPickerOpen, selectedRaid]);

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

  function openRaidClearSettlement(adv: AdvanceResult, raidName: string) {
    const lootMultLabel =
      adv.lootMultiplier && adv.lootMultiplier > 1
        ? formatRaidPartyLootMultiplier(run?.partySize ?? partyIds.size, maxParty)
        : null;
    setClearSettlement({
      kind: "clear",
      title: "레이드 클리어!",
      subtitle: lootMultLabel ? `${raidName} · 보상 ${lootMultLabel}` : raidName,
      xpGrants: [],
      loot: adv.loot ?? [],
      goldGained: adv.goldGained,
      lootMultiplier: adv.lootMultiplier,
    });
  }

  function dismissClearSettlement() {
    setClearSettlement(null);
    void refresh();
  }

  function finishBattlePlayback() {
    setCombatActive(false);
    setPlayingLog(false);
    setBattleReplay(null);
    setBattleLines([]);
    const adv = pendingResultRef.current;
    pendingResultRef.current = null;
    if (adv) {
      if (adv.result === "CLEARED") {
        const raidName = run?.run?.raidName ?? raids.find((r) => r.id === selectedRaidId)?.name ?? "레이드";
        openRaidClearSettlement(adv, raidName);
        return;
      }
      if (adv.result === "LOSS") setLastMsg("전멸… 누적 보상 소멸");
      else {
        const mult =
          adv.lootMultiplier && adv.lootMultiplier > 1
            ? ` · 드랍 ${formatRaidPartyLootMultiplier(run?.partySize ?? partyIds.size, maxParty)}`
            : "";
        setLastMsg(`페이즈 ${adv.phase ?? "?"} 클리어${mult}`);
      }
    }
    void refresh();
  }

  async function startRaidCombat() {
    if (!run?.run?.raidId) return;
    setBusy("combat");
    setLastMsg(null);
    setError(null);
    try {
      const r = await apiPostJson<AdvanceResult>("/api/raids/run/advance", { raidId: run.run.raidId });
      pendingResultRef.current = r;
      const lines = r.combatLog ?? [];
      const replay = r.combatReplay ?? null;
      if (lines.length && replay) {
        setBattleReplay(replay);
        setBattleLines(lines);
        setPlayingLog(true);
        setCombatActive(true);
      } else {
        finishBattlePlayback();
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  if (!embedded && sessionLoading) return <GamePanelLoading label="레이드 불러오는 중…" />;
  if (!embedded && !user) return <p className="text-sm text-[var(--game-muted)]">로그인 후 레이드를 이용할 수 있습니다.</p>;
  if (embedded && !user) return null;

  const active = run?.active ?? false;
  const pendingSummary = run?.run?.pendingLoot.map((x) => `${x.name}×${x.qty}`).join(", ");
  const powerAdequacy =
    selectedRaid?.recommendedPartyPower != null
      ? partyPowerAdequacy(partyPower, selectedRaid.recommendedPartyPower)
      : null;
  const minPartyPower = selectedRaid?.minPartyPower ?? 0;
  const entryTicketCost = selectedRaid?.entryTicketCost ?? (selectedRaid?.difficulty === "hard" ? 2 : 1);
  const entryTicketQty = entryTicket?.availableQty ?? 0;
  const hasEntryTicket = entryTicketQty >= entryTicketCost;
  const canStartRaid =
    partyIds.size > 0 && !!selectedRaidId && (minPartyPower <= 0 || partyPower >= minPartyPower) && hasEntryTicket;

  function pickRaid(raidId: string) {
    setSelectedRaidId(raidId);
    setBossPickerOpen(false);
  }

  return (
    <GamePanel className={embedded ? "panel-fit" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="game-label">레이드</p>
          <h2 className="game-title text-lg">진영 레이드</h2>
          <p className="mt-1 text-xs text-[var(--game-muted)]">난이도·진영별 레이드 · 입장권 필요 · 인원 적을수록 보상 증가 · 패배 시 누적 보상 소멸</p>
        </div>
        <span className={`dungeon-status-pill ${active ? "dungeon-status-pill--live" : ""}`.trim()}>
          {active ? "● 진행 중" : "○ 대기"}
        </span>
      </div>

      {error ? <GamePanelError className="mt-3" error={error} /> : null}
      {dataLoading && raids.length === 0 ? <GamePanelLoading label="레이드 불러오는 중…" /> : null}
      {lastMsg && !combatActive ? <p className="mt-2 text-sm text-[var(--game-gold-bright)]">{lastMsg}</p> : null}

      {active && run?.run ? (
        <div className="mt-4 space-y-3">
          <div className="game-subpanel-inset">
            <p className="text-sm font-semibold">{run.run.raidName}</p>
            <p className="text-xs text-[var(--game-muted)]">
              {run.run.maxPhases > 1 ? `페이즈 ${run.run.phase} / ${run.run.maxPhases}` : "보스전"}
              {run.lootMultiplier && run.lootMultiplier > 1
                ? ` · 보상 ${formatRaidPartyLootMultiplier(run.partySize ?? 1, run.maxPartySize ?? maxParty)}`
                : null}
            </p>
          </div>

          <CombatEncounterBlock
            embedded={embedded}
            playing={playingLog}
            replay={battleReplay}
            lines={battleLines}
            onComplete={finishBattlePlayback}
            clearChance={null}
            pendingSummary={pendingSummary}
            floorLabel={run.run.maxPhases > 1 ? `페이즈 ${run.run.phase}` : "보스"}
            isBoss={!!run.combat?.isBoss}
          />

          <div className="flex flex-wrap gap-2">
            <GameBtn
              variant="gold"
              disabled={!!busy || combatActive}
              onClick={() => void startRaidCombat()}
            >
              {combatActive ? "전투 중…" : run.run.maxPhases > 1 ? "다음 페이즈" : "보스 도전"}
            </GameBtn>
            <GameBtn
              variant="ghost"
              disabled={!!busy || combatActive}
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
              <div className="min-w-0">
                <p className="raid-boss-picker__current">
                  {selectedRaid ? selectedRaid.name : "보스를 선택하세요"}
                </p>
                {selectedRaid?.recommendedPartyPower != null ? (
                  <p className="raid-boss-picker__meta">
                    {formatRaidDifficultyLine({
                      recommendedPartyPower: selectedRaid.recommendedPartyPower,
                      label: selectedRaid.difficultyLabel ?? "보통",
                      stars: selectedRaid.difficultyStars ?? 3,
                    })}
                    {partyIds.size > 0 ? (
                      <span
                        className={[
                          "raid-boss-picker__party-power",
                          powerAdequacy === "low"
                            ? "raid-boss-picker__party-power--low"
                            : powerAdequacy === "high"
                              ? "raid-boss-picker__party-power--high"
                              : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {" "}
                        · 파티 {partyPower.toLocaleString()}
                        {powerAdequacy === "low" ? " (부족)" : powerAdequacy === "high" ? " (여유)" : ""}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
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
              <div className="raid-faction-picker">
                <div className="raid-difficulty-tabs" role="tablist" aria-label="레이드 난이도">
                  {difficultyTabs.map((t) => (
                    <button
                      key={t.mode}
                      type="button"
                      role="tab"
                      aria-selected={difficultyModeTab === t.mode}
                      className={[
                        "raid-difficulty-tab",
                        difficultyModeTab === t.mode ? "raid-difficulty-tab--active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setDifficultyModeTab(t.mode)}
                    >
                      <span className="raid-difficulty-tab__label">{t.label}</span>
                      <span className="raid-difficulty-tab__count">{t.count}</span>
                    </button>
                  ))}
                </div>
                <div className="raid-faction-tabs" role="tablist" aria-label="레이드 진영">
                  {factionTabs.map((t) => (
                    <button
                      key={t.faction}
                      type="button"
                      role="tab"
                      aria-selected={factionTab === t.faction}
                      className={["raid-faction-tab", factionTab === t.faction ? "raid-faction-tab--active" : ""]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setFactionTab(t.faction)}
                    >
                      {t.label}
                      <span className="raid-faction-tab__count">{t.count}</span>
                    </button>
                  ))}
                </div>
                <div
                  className="raid-boss-pick-grid"
                  role="listbox"
                  aria-label={`${difficultyModeTabLabel(difficultyModeTab)} ${RAID_FACTION_LABELS[factionTab]} 레이드`}
                >
                  {visibleRaids.length === 0 ? (
                    <p className="raid-boss-pick-empty">이 난이도·진영에 레이드가 없습니다.</p>
                  ) : (
                    visibleRaids.map((r) => {
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
                          <span className="raid-boss-pick-card__kind">{raidKindLabel(r.id, r.isBoss)}</span>
                          <span className="raid-boss-pick-card__name">{r.name}</span>
                          {r.recommendedPartyPower != null ? (
                            <span className="raid-boss-pick-card__meta">
                              권장 {r.recommendedPartyPower.toLocaleString()}
                              {r.recommendedPerMinion != null ? ` · 1인 ${r.recommendedPerMinion.toLocaleString()}` : ""}
                              {r.entryTicketCost != null ? ` · 입장권 ${r.entryTicketCost}장` : ""}
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>
          {selectedRaidId ? (
            <DungeonDropTable
              table={raidDropTableForId(selectedRaidId)}
              compact={embedded}
              ariaLabel="레이드 드랍표"
              hint="페이즈·클리어 시 각각 추첨 · 확률은 해당 풀 기준"
            />
          ) : null}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--game-muted)]">파티 {partyIds.size}/{maxParty}</p>
              <p className="text-xs font-semibold text-[var(--game-gold-bright)]">
                드랍 {partyLootMultLabel}
                {partyLootMult > 1 ? " · 소수 정예" : ""}
              </p>
            </div>
            <p className="mt-0.5 text-[10px] text-[var(--game-muted-dim)]">
              최대 {maxParty}명 기준 — 인원이 적을수록 보상이 늘어납니다.
            </p>
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
          {powerAdequacy === "low" && minPartyPower > 0 ? (
            <p className="text-xs text-amber-300/90">
              최소 파티 전투력 {minPartyPower.toLocaleString()} 필요 (현재 {partyPower.toLocaleString()})
            </p>
          ) : null}
          {!hasEntryTicket ? (
            <p className="text-xs text-amber-300/90">
              {entryTicket?.name ?? "레이드 입장권"} 부족 (보유 {entryTicketQty} / 필요 {entryTicketCost}) · 던전에서 획득
            </p>
          ) : (
            <p className="text-xs text-[var(--game-muted)]">
              {entryTicket?.name ?? "레이드 입장권"} {entryTicketQty}장 · 시작 시 {entryTicketCost}장 소모
            </p>
          )}
          <GameBtn
            variant="gold"
            className="w-full h-10"
            disabled={!!busy || !canStartRaid}
            onClick={async () => {
              setBusy("start");
              const raid = raids.find((r) => r.id === selectedRaidId);
              setRun({
                active: true,
                run: {
                  raidId: selectedRaidId,
                  raidName: raid?.name ?? selectedRaidId,
                  phase: 1,
                  maxPhases: raid?.maxPhases ?? 1,
                  pendingLoot: [],
                },
                partySize: partyIds.size,
                maxPartySize: maxParty,
              });
              try {
                await apiPostJson("/api/raids/run/start", { raidId: selectedRaidId, minionIds: [...partyIds] });
                setLastMsg("레이드 시작");
                void refresh();
              } catch (e) {
                setRun(null);
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

      <DungeonRunSettlementModal
        open={!!clearSettlement}
        settlement={clearSettlement}
        onConfirm={dismissClearSettlement}
      />
    </GamePanel>
  );
}
