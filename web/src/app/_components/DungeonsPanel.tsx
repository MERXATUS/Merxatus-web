"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { readSavedPartyIds, resolveSavedPartyIds, writeSavedPartyIds } from "@/shared/savedParty";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { isDungeonPool } from "@/server/minionJobs";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { API_CACHE_TTL } from "@/shared/apiCache";
import { apiGetJson, apiGetJsonCached, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
import { GameBtn, GamePanel, GamePanelTitle, GameStat } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { minionPortraitView, monsterIdFromDisplayName, monsterPortraitView } from "@/shared/combatPortrait";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import { partyHpFromArena, type BattleArenaFrame } from "@/shared/dungeonCombatReplay";
import type { CombatReport } from "@/shared/combatReport";
import { CombatEncounterBlock } from "@/app/_components/CombatEncounterBlock";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { DungeonCashoutConfirmModal } from "@/app/_components/DungeonCashoutConfirmModal";
import { DungeonPartyPickModal } from "@/app/_components/DungeonPartyPickModal";
import { DungeonDropTable } from "@/app/_components/DungeonDropTable";
import { DungeonRunSettlementModal } from "@/app/_components/DungeonRunSettlementModal";
import {
  DungeonPartyHpList,
  type PartyRosterRow,
} from "@/app/_components/DungeonPartyHpList";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import { notifyGameFramePatch } from "@/shared/gameFramePatch";
import type {
  DungeonLootRow,
  DungeonSettlement,
  MinionXpGrantPayload,
} from "@/shared/dungeonSettlement";
import { settlementTitle } from "@/shared/dungeonSettlement";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";
import {
  dungeonIdForStageOrder,
  dungeonStageMetaFor,
  listDungeonStagePickerOptions,
  stageOrderForDungeonId,
} from "@/shared/dungeonStageProgression";
import { checkDungeonPartyEligibility } from "@/shared/dungeonDifficulty";
import { displayCombatPower } from "@/shared/combatPowerScale";
import { pushLuckFloorGoldReward, pushLuckLootMultiplier } from "@/shared/dungeonPushLuck";
import { assertDungeonStage } from "@/shared/dungeonStageProgression";
import { dungeonDropTableForId } from "@/shared/dungeonDropTablesData";
import { DUNGEONS_LIST_LITE } from "@/shared/dungeonsListData";
import { normalizeItemIdLower } from "@/shared/itemId";
import { DUNGEON_IDLE_RULES } from "@/shared/dungeonIdle";
import { fetchCombatRoster } from "@/shared/combatRosterClient";
import { itemGradeFrameClassName } from "@/server/itemGrade";

type DungeonDef = {
  id: string;
  name: string;
  mode?: "AUTO_WAVES" | "PUSH_LUCK" | "IDLE";
  maxFloors?: number;
  maxPartySize?: number;
  baseWaveSeconds: number;
  linkedStageOrder?: number;
  ticketCost?: number;
  stage?: {
    stageOrder: number;
    realm?: "마계" | "천계" | "이계";
    recommendedLevel: number;
    recommendedLevelMax: number;
    recommendedPowerLabel?: string;
    recommendedPartyPower?: number;
    minPartyPower?: number;
    journeyXpPool: number;
    fullClearXp: number;
  };
};

type RunState = {
  ok: boolean;
  active: boolean;
  idle?: boolean;
  combatActive?: boolean;
  run?: {
    id: string;
    dungeonId: string;
    wins: number;
    losses: number;
    floor?: number;
    rollIntervalSeconds?: number;
    nextRollAt?: string | null;
    offlineCapSeconds?: number;
  };
  combat?: { partyPower: number };
  dungeon?: DungeonDef;
  party?: Array<{ minionId: string; hp?: number; maxHp?: number; label?: string }>;
  pendingLoot?: string;
  pendingLootItems?: Array<{ itemId: string; qty: number; name: string; grade: number }>;
  pendingGold?: number;
};

type AdvanceResult = {
  ok: boolean;
  result?: "WIN" | "LOSS" | "WIN_AND_CASHOUT";
  combatLog?: CombatLogLine[];
  combatReplay?: DungeonCombatReplay;
  partyHp?: Array<{ minionId: string; hp: number; maxHp: number; label?: string }>;
  minionXpGrants?: MinionXpGrantPayload[];
  cashedOut?: DungeonLootRow[];
  forfeitedLoot?: DungeonLootRow[];
  forfeitedGold?: number;
  goldGained?: number;
  pendingGold?: number;
  lootMultiplier?: number;
  isBoss?: boolean;
  floor?: number;
  combatReport?: CombatReport;
};

type CashoutResult = {
  ok: boolean;
  cashedOut?: DungeonLootRow[];
  goldGained?: number;
};

type StopResult = {
  ok: boolean;
  forfeitedLoot?: DungeonLootRow[];
  forfeitedGold?: number;
};

type DungeonMinionRow = {
  id: string;
  level: number;
  pool: string;
  combatClassLabel: string;
  displayName?: string;
  nickname?: string | null;
  combatStats?: { combatPower: number };
  equippedWeapon?: {
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    grade: number;
  } | null;
};

type DisplayLogLine = { id: string; text: string; tone: "party" | "enemy" | "system" | "win" | "loss" };

const PARTY_KEY = "dungeon_party_minion_ids_v1";
const SPECIAL_PARTY_KEY = "special_dungeon_party_minion_ids_v1";
const DUNGEON_SELECT_KEY = "dungeon_selected_id_v1";
const SPECIAL_DUNGEON_SELECT_KEY = "special_dungeon_selected_id_v1";
const DUNGEON_STAGE_SELECT_KEY = "dungeon_selected_stage_v1";
const SPECIAL_DUNGEON_STAGE_SELECT_KEY = "special_dungeon_selected_stage_v1";
const IDLE_COLLECT_SUBTITLE = "방치 탐험 보상을 수령했습니다.";

type DungeonContentMode = "idle" | "special";

function specialListEntryToDef(entry: {
  id: string;
  name: string;
  maxFloors: number;
  maxPartySize: number;
  linkedStageOrder: number;
  ticketCost: number;
}): DungeonDef {
  const mainId = dungeonIdForStageOrder(entry.linkedStageOrder) ?? "dungeon_slime_forest";
  const stage = dungeonStageMetaFor(mainId, entry.maxFloors);
  return {
    id: entry.id,
    name: entry.name,
    mode: "PUSH_LUCK",
    maxFloors: entry.maxFloors,
    maxPartySize: entry.maxPartySize,
    baseWaveSeconds: 8,
    linkedStageOrder: entry.linkedStageOrder,
    ticketCost: entry.ticketCost,
    stage: stage ?? undefined,
  };
}

function dungeonMinionLabel(m: Pick<DungeonMinionRow, "displayName" | "combatClassLabel" | "combatStats">) {
  const name = m.displayName ?? m.combatClassLabel;
  const cp = m.combatStats?.combatPower;
  return cp != null ? `${name} · ${cp.toLocaleString()} CP` : name;
}

function resolveDungeonFromList(
  list: DungeonDef[],
  currentId?: string | null,
  keys?: { stageKey: string; idKey: string },
): DungeonDef | null {
  if (!list.length) return null;
  const stageKey = keys?.stageKey ?? DUNGEON_STAGE_SELECT_KEY;
  const idKey = keys?.idKey ?? DUNGEON_SELECT_KEY;
  if (typeof window !== "undefined") {
    const savedStageRaw = localStorage.getItem(stageKey);
    const savedStage = savedStageRaw ? Number(savedStageRaw) : NaN;
    if (Number.isFinite(savedStage) && savedStage > 0) {
      const byStageOrder = list.find((d) => (d.linkedStageOrder ?? d.stage?.stageOrder) === savedStage);
      if (byStageOrder) return byStageOrder;
      const id = dungeonIdForStageOrder(savedStage);
      const byStage = id ? list.find((d) => d.id === id) : null;
      if (byStage) return byStage;
    }
    const savedId = localStorage.getItem(idKey) ?? "";
    const byId = list.find((d) => d.id === savedId);
    if (byId) return byId;
  }
  return list.find((d) => d.id === currentId) ?? list[0] ?? null;
}

function parseLoot(raw: unknown) {
  try {
    const arr = JSON.parse(typeof raw === "string" ? raw : "[]") as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x: { itemId?: unknown; qty?: number }) => ({
        itemId: normalizeItemIdLower(x?.itemId),
        qty: Math.max(0, Math.floor(Number(x?.qty ?? 0))),
      }))
      .filter((x) => x.itemId && x.qty > 0);
  } catch {
    return [];
  }
}

async function getJson<T>(url: string): Promise<T> {
  return apiGetJson<T>(url);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiPostJson<T>(url, body);
}

function floorTransitionMessage(enteringBoss: boolean, isAdvancing: boolean) {
  if (enteringBoss) return "보스 입장 중…";
  if (isAdvancing) return "다음 층으로 가는 중…";
  return "탐험을 시작하는 중…";
}

export function DungeonsPanel({
  embedded = false,
  contentMode = "idle",
}: EmbeddedPanelProps & { contentMode?: DungeonContentMode } = {}) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dungeon, setDungeon] = useState<DungeonDef | null>(null);
  const [dungeons, setDungeons] = useState<DungeonDef[]>(DUNGEONS_LIST_LITE);
  const [run, setRun] = useState<RunState | null>(null);
  const [minions, setMinions] = useState<DungeonMinionRow[]>([]);
  const [partyIds, setPartyIds] = useState<Set<string>>(new Set());
  const [logLines, setLogLines] = useState<DisplayLogLine[]>([]);
  const [combatActive, setCombatActive] = useState(false);
  const [combatReport, setCombatReport] = useState<CombatReport | null>(null);
  const [playingLog, setPlayingLog] = useState(false);
  const [battleReplay, setBattleReplay] = useState<DungeonCombatReplay | null>(null);
  const [battleLines, setBattleLines] = useState<CombatLogLine[]>([]);
  const [battleFrame, setBattleFrame] = useState<BattleArenaFrame | null>(null);
  const pendingPartyHpRef = useRef<AdvanceResult["partyHp"]>(null);
  const pendingAdvanceResultRef = useRef<AdvanceResult | null>(null);
  const idleCollectInFlightRef = useRef(false);
  const sessionXpRef = useRef<Map<string, MinionXpGrantPayload>>(new Map());
  const [settlement, setSettlement] = useState<DungeonSettlement | null>(null);
  const [lastFloorBonus, setLastFloorBonus] = useState<string | null>(null);
  const [combatIsBoss, setCombatIsBoss] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const autoAdvanceRef = useRef(false);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [battlePreparing, setBattlePreparing] = useState(false);
  const [cashoutConfirmOpen, setCashoutConfirmOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyBusy, setPartyBusy] = useState(false);
  /** 탐험 세션 — run.active 갱신 전·후 UI 깜빡임(스테이지 선택) 방지 */
  const [runSession, setRunSession] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const logId = useRef(0);

  const isSpecialMode = contentMode === "special";
  /** 허브 「방치 탐험」 탭 — 던전 mode 필드와 무관하게 방치 UI (API·캐시 불일치 방지) */
  const isIdleMode = contentMode === "idle";
  const storageKeys = isSpecialMode
    ? { stageKey: SPECIAL_DUNGEON_STAGE_SELECT_KEY, idKey: SPECIAL_DUNGEON_SELECT_KEY }
    : { stageKey: DUNGEON_STAGE_SELECT_KEY, idKey: DUNGEON_SELECT_KEY };
  const partyStorageKey = isSpecialMode ? SPECIAL_PARTY_KEY : PARTY_KEY;

  const exploring = runSession || !!run?.active || combatActive;

  function setAutoAdvanceOn(on: boolean) {
    autoAdvanceRef.current = on;
    setAutoAdvance(on);
    if (!on && autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
  }

  function queueAutoAdvance() {
    if (!autoAdvanceRef.current) return;
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      autoAdvanceTimer.current = null;
      if (!autoAdvanceRef.current) return;
      void advance();
    }, 0);
  }

  const floor = Math.max(1, Math.floor(run?.run?.floor ?? 1));
  const maxFloors = dungeon?.maxFloors ?? 20;
  const maxParty = Math.max(1, dungeon?.maxPartySize ?? 1);
  const atBossGate = exploring && floor >= maxFloors && !combatActive && !battlePreparing;
  const idleRollIntervalSec = run?.run?.rollIntervalSeconds ?? DUNGEON_IDLE_RULES.baseRollIntervalSeconds;
  const idleRollPct = useMemo(() => {
    if (!isIdleMode || !exploring || !run?.run?.nextRollAt) return 0;
    const nextAt = new Date(run.run.nextRollAt).getTime();
    const remainMs = Math.max(0, nextAt - Date.now());
    return Math.min(99, Math.round(100 * (1 - remainMs / (idleRollIntervalSec * 1000))));
  }, [isIdleMode, exploring, run?.run?.nextRollAt, idleRollIntervalSec]);
  const floorPct = isIdleMode
    ? idleRollPct
    : atBossGate
      ? Math.min(99, Math.round(((maxFloors - 1) / maxFloors) * 100))
      : Math.min(99, Math.round(((Math.min(floor, maxFloors) - 1) / maxFloors) * 100));
  const floorLabel = isIdleMode
    ? exploring
      ? `누적 롤 ${Math.max(0, run?.run?.wins ?? 0).toLocaleString()}회`
      : "방치 탐험"
    : atBossGate
      ? `보스 · ${maxFloors}층`
      : exploring
        ? `${Math.min(floor, maxFloors)} / ${maxFloors}층`
        : `최대 ${maxFloors}층`;
  const idleNextRollLabel = run?.run?.nextRollAt
    ? new Date(run.run.nextRollAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : null;
  const enteringBossFloor = floor >= maxFloors;
  const isFloorTransition = battlePreparing || busy === "advance" || busy === "start";
  const transitionMessage = isFloorTransition
    ? floorTransitionMessage(enteringBossFloor, busy === "advance" || (battlePreparing && !busy))
    : null;
  const advanceActionLabel = combatActive
    ? "전투 중…"
    : isFloorTransition && transitionMessage
      ? transitionMessage
      : enteringBossFloor
        ? "보스 입장"
        : "다음 층";
  const cashoutLoot = useMemo(() => {
    if (run?.pendingLootItems?.length) return run.pendingLootItems;
    return parseLoot(run?.pendingLoot ?? "[]").map((x) => ({
      itemId: x.itemId,
      qty: x.qty,
      name: x.itemId,
      grade: 1,
    }));
  }, [run?.pendingLootItems, run?.pendingLoot]);

  const stagePickerRows = useMemo(() => {
    if (isSpecialMode) {
      return listDungeonStagePickerOptions()
        .map((opt) => {
          const dungeonsInStage = dungeons.filter(
            (d) => (d.linkedStageOrder ?? d.stage?.stageOrder) === opt.stageOrder,
          );
          if (dungeonsInStage.length === 0) return null;
          return {
            ...opt,
            dungeons: dungeonsInStage,
            primaryDungeonId: dungeonsInStage[0]!.id,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null);
    }
    return listDungeonStagePickerOptions()
      .map((opt) => {
        const dungeonsInStage = opt.dungeonIds
          .map((id) => dungeons.find((d) => d.id === id))
          .filter((d): d is DungeonDef => !!d);
        if (dungeonsInStage.length === 0) return null;
        return { ...opt, dungeons: dungeonsInStage };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }, [dungeons, isSpecialMode]);

  const selectedStageOrder =
    dungeon?.stage?.stageOrder ?? stageOrderForDungeonId(dungeon?.id ?? "") ?? stagePickerRows[0]?.stageOrder ?? 1;

  const selectedStageRow = useMemo(
    () => stagePickerRows.find((r) => r.stageOrder === selectedStageOrder) ?? stagePickerRows[0] ?? null,
    [stagePickerRows, selectedStageOrder],
  );

  const selectedStageDungeon = useMemo(() => {
    if (!selectedStageRow || !dungeon) return selectedStageRow?.dungeons[0] ?? null;
    return selectedStageRow.dungeons.find((d) => d.id === dungeon.id) ?? selectedStageRow.dungeons[0] ?? null;
  }, [selectedStageRow, dungeon]);

  const stageTabRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  useEffect(() => {
    const el = stageTabRefs.current.get(selectedStageOrder);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedStageOrder, stagePickerRows.length]);

  const selectStage = useCallback(
    (stageOrder: number, dungeonId?: string) => {
      if (exploring || busy) return;
      const row = stagePickerRows.find((r) => r.stageOrder === stageOrder);
      if (!row) return;
      const next =
        (dungeonId ? row.dungeons.find((d) => d.id === dungeonId) : null) ??
        row.dungeons.find((d) => d.id === row.primaryDungeonId) ??
        row.dungeons[0];
      if (!next) return;
      setDungeon(next);
      try {
        localStorage.setItem(storageKeys.stageKey, String(stageOrder));
        localStorage.setItem(storageKeys.idKey, next.id);
      } catch {
        /* ignore */
      }
    },
    [exploring, busy, stagePickerRows, storageKeys],
  );

  const partyChips = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const id of partyIds) {
      const m = minions.find((x) => x.id === id);
      if (!m) continue;
      out.push({
        id,
        label: dungeonMinionLabel(m),
      });
    }
    return out;
  }, [partyIds, minions]);

  const partyPower = useMemo(() => {
    let sum = 0;
    for (const id of partyIds) {
      const m = minions.find((row) => row.id === id);
      sum += m?.combatStats?.combatPower ?? 0;
    }
    return sum;
  }, [minions, partyIds]);

  const partyEligibility = useMemo(() => {
    if (!dungeon?.id || partyIds.size === 0) return null;
    try {
      const stageDungeonId =
        dungeon.linkedStageOrder != null
          ? dungeonIdForStageOrder(dungeon.linkedStageOrder) ?? dungeon.id
          : dungeon.id;
      const stage = assertDungeonStage(stageDungeonId);
      return checkDungeonPartyEligibility({ stage, partyPower });
    } catch {
      return null;
    }
  }, [dungeon?.id, dungeon?.linkedStageOrder, partyIds, partyPower]);

  const canStartDungeon =
    !!dungeon && partyIds.size > 0 && (partyEligibility == null || partyEligibility.ok);

  const partyRoster = useMemo(() => {
    if (!exploring || !run?.party?.length) return null;
    const liveHp = battleFrame ? partyHpFromArena(battleFrame.fighters) : null;
    return run.party.map((p) => {
      const live = liveHp?.find((h) => h.minionId === p.minionId);
      const m = minions.find((x) => x.id === p.minionId);
      const maxHp = Math.max(1, Math.floor(live?.maxHp ?? p.maxHp ?? 1));
      const hp = Math.min(maxHp, Math.max(0, Math.floor(live?.hp ?? p.hp ?? maxHp)));
      const fallbackLabel = m ? dungeonMinionLabel(m) : p.minionId.slice(0, 8);
      return {
        id: p.minionId,
        label: live?.label ?? p.label ?? fallbackLabel,
        hp,
        maxHp,
        pct: Math.round((hp / maxHp) * 100),
        dead: hp <= 0,
      };
    });
  }, [exploring, run?.party, minions, battleFrame]);

  const partyAlive = partyRoster?.filter((m) => !m.dead).length ?? 0;

  const dungeonMinions = useMemo(
    () => minions.filter((m) => isDungeonPool(m.pool)),
    [minions],
  );

  function minionLabelForSettlement(minionId: string, fallback?: string) {
    const m = minions.find((x) => x.id === minionId);
    if (m) return dungeonMinionLabel(m);
    return fallback ?? minionId.slice(0, 8);
  }

  function mergeSessionXp(grants?: MinionXpGrantPayload[]) {
    if (!grants?.length) return;
    for (const g of grants) {
      const prev = sessionXpRef.current.get(g.minionId);
      if (!prev) {
        sessionXpRef.current.set(g.minionId, { ...g });
        continue;
      }
      sessionXpRef.current.set(g.minionId, {
        minionId: g.minionId,
        xpGained: prev.xpGained + g.xpGained,
        levelsGained: prev.levelsGained + g.levelsGained,
        statPointsGained: prev.statPointsGained + g.statPointsGained,
        level: g.level,
        experience: g.experience,
        unspentStatPoints: g.unspentStatPoints,
      });
    }
  }

  function resetSessionXp() {
    sessionXpRef.current = new Map();
  }

  function endRunSession() {
    setRunSession(false);
  }

  function runMatchesPanel(state: RunState): boolean {
    if (!state.active) return true;
    const mode = state.dungeon?.mode;
    if (isSpecialMode) return mode === "PUSH_LUCK";
    return mode === "IDLE" || !!state.idle;
  }

  function applyRunStateFromApi(state: RunState) {
    if (state.ok) {
      if (!runMatchesPanel(state)) {
        setRun({ ok: true, active: false });
        if (!combatActive) endRunSession();
        return;
      }
      const mapped: RunState = state.idle
        ? {
            ...state,
            run: state.run
              ? {
                  ...state.run,
                  losses: state.run.losses ?? 0,
                  floor: state.run.wins,
                }
              : state.run,
          }
        : state;
      setRun(mapped);
      if (state.active) setRunSession(true);
      else if (!combatActive) endRunSession();
      if (state.active && state.dungeon) setDungeon(state.dungeon as DungeonDef);
      if (state.active && state.party?.length) {
        setPartyIds(new Set(state.party.map((p) => p.minionId)));
      }
    }
  }

  function optimisticRunAfterStart() {
    setRunSession(true);
    setRun({
      ok: true,
      active: true,
      run: {
        id: "pending",
        dungeonId: dungeon!.id,
        wins: 0,
        losses: 0,
        floor: 1,
      },
      dungeon: dungeon ?? undefined,
      party: [...partyIds].map((minionId) => ({ minionId })),
      combat: { partyPower: 0 },
      pendingLootItems: [],
    });
  }

  function patchRunAfterAdvance(r: AdvanceResult) {
    if (r.result !== "WIN") return;
    const fought = Math.max(1, Math.floor(r.floor ?? 1));
    const nextFloor = Math.min(maxFloors, fought + 1);
    setRun((prev) =>
      prev?.active && prev.run ? { ...prev, run: { ...prev.run, floor: nextFloor } } : prev,
    );
  }

  function buildXpGrantRows(): DungeonSettlement["xpGrants"] {
    return [...sessionXpRef.current.values()].map((g) => ({
      ...g,
      label: minionLabelForSettlement(g.minionId),
    }));
  }

  function openSettlement(payload: Omit<DungeonSettlement, "title">) {
    setSettlement({
      title: settlementTitle(payload.kind),
      ...payload,
    });
  }

  function dismissSettlement() {
    const isIdleCashout =
      settlement?.kind === "cashout" && settlement.subtitle === IDLE_COLLECT_SUBTITLE;
    setSettlement(null);
    setLastFloorBonus(null);
    resetSessionXp();
    if (isIdleCashout) {
      if (!idleCollectInFlightRef.current) {
        void refresh({ runStateOnly: true });
      }
      notifyGameFramePatch(["wallet", "inventory", "weapons", "armor"]);
    } else {
      void refresh();
    }
  }

  function showSettlementAfterAdvance(adv: AdvanceResult) {
    setAutoAdvanceOn(false);
    if (adv.result === "LOSS") {
      openSettlement({
        kind: "defeat",
        subtitle: "누적 보상이 사라졌습니다.",
        xpGrants: buildXpGrantRows(),
        loot: [],
        forfeitedLoot: adv.forfeitedLoot ?? [],
        forfeitedGold: adv.forfeitedGold,
      });
      setRun((prev) => (prev ? { ...prev, active: false, pendingLootItems: [], pendingGold: 0 } : prev));
      endRunSession();
      return;
    }
    if (adv.result === "WIN_AND_CASHOUT") {
      openSettlement({
        kind: "clear",
        subtitle: "최종 층을 클리어했습니다.",
        xpGrants: buildXpGrantRows(),
        loot: adv.cashedOut ?? [],
        goldGained: adv.goldGained,
        lootMultiplier: adv.lootMultiplier,
      });
      resetSessionXp();
      setRun((prev) => (prev ? { ...prev, active: false, pendingLootItems: [], pendingGold: 0 } : prev));
      endRunSession();
    }
  }

  async function executeForfeit() {
    setAutoAdvanceOn(false);
    setCashoutConfirmOpen(false);
    setBusy("stop");
    try {
      const r = await postJson<StopResult>("/api/dungeons/run/stop", {});
      openSettlement({
        kind: "abort",
        subtitle: "남은 누적 보상은 사라졌습니다.",
        xpGrants: buildXpGrantRows(),
        loot: [],
        forfeitedLoot: r.forfeitedLoot ?? cashoutLoot,
        forfeitedGold: r.forfeitedGold ?? run?.pendingGold,
      });
      resetSessionXp();
      setRun((prev) => (prev ? { ...prev, active: false, pendingLootItems: [], pendingGold: 0 } : prev));
      endRunSession();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function executeCashout() {
    setAutoAdvanceOn(false);
    setCashoutConfirmOpen(false);
    setBusy("cashout");
    try {
      const r = await postJson<CashoutResult>("/api/dungeons/run/cashout", {});
      openSettlement({
        kind: "cashout",
        subtitle: "안전하게 보상을 수령했습니다.",
        xpGrants: buildXpGrantRows(),
        loot: r.cashedOut ?? [],
        goldGained: r.goldGained,
      });
      resetSessionXp();
      setRun((prev) => (prev ? { ...prev, active: false, pendingLootItems: [], pendingGold: 0 } : prev));
      endRunSession();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function refreshRunState() {
    if (!user) return;
    try {
      const state = await apiGetJsonCached<RunState>("/api/dungeons/run/state?lite=1", {
        ttlMs: API_CACHE_TTL.runState,
        force: true,
      });
      applyRunStateFromApi(state);
      if (state.active && state.combatActive && state.run?.dungeonId && !combatActive) {
        try {
          // ATB 전투 상태가 남아 있어도 UI는 로그 전투로 통일한다.
        } catch {
          /* stale */
        }
      }
    } catch (e) {
      if (!isUnauthorizedError(e)) setError(e);
    }
  }

  async function refresh(options?: { runStateOnly?: boolean }) {
    if (!user) return;
    if (options?.runStateOnly) {
      await refreshRunState();
      return;
    }
    setDataLoading(true);
    try {
      const rosterPromise = fetchCombatRoster(user.id);
      let list: DungeonDef[];
      if (isSpecialMode) {
        const specialR = await apiGetJsonCached<{
          ok: boolean;
          dungeons: Array<{
            id: string;
            name: string;
            maxFloors: number;
            maxPartySize: number;
            linkedStageOrder: number;
            ticketCost: number;
          }>;
        }>("/api/special-dungeons/list", { ttlMs: API_CACHE_TTL.runState });
        list = (specialR.dungeons ?? []).map(specialListEntryToDef);
      } else {
        list = DUNGEONS_LIST_LITE;
      }
      const [state, roster] = await Promise.all([
        apiGetJsonCached<RunState>("/api/dungeons/run/state?lite=1", { ttlMs: API_CACHE_TTL.runState }),
        rosterPromise,
      ]);
      if (roster.length) setMinions(roster as DungeonMinionRow[]);
      setDungeons(list);
      if (state.ok) {
        applyRunStateFromApi(state);
        if (!state.active && list.length) {
          const next = resolveDungeonFromList(list, dungeon?.id, storageKeys);
          setDungeon(next);
        }
        if (!state.active && roster.length) {
          const cap = Math.max(1, (state.dungeon ?? dungeon)?.maxPartySize ?? 1);
          setPartyIds(
            resolveSavedPartyIds(readSavedPartyIds(partyStorageKey), roster as DungeonMinionRow[], cap),
          );
        }
      } else if (list.length) {
        const next = resolveDungeonFromList(list, dungeon?.id, storageKeys);
        setDungeon(next);
      }
    } catch (e) {
      if (!isUnauthorizedError(e)) setError(e);
    } finally {
      setDataLoading(false);
    }
  }

  function finishBattlePlayback() {
    const adv = pendingAdvanceResultRef.current;
    pendingAdvanceResultRef.current = null;

    if (adv?.result === "WIN") {
      patchRunAfterAdvance(adv);
    }

    setCombatActive(false);
    setPlayingLog(false);
    setBattlePreparing(false);
    setBattleFrame(null);
    setBattleReplay(null);
    setBattleLines([]);
    const after = pendingPartyHpRef.current;
    pendingPartyHpRef.current = null;
    if (after?.length) {
      setRun((prev) =>
        prev?.active
          ? {
              ...prev,
              party: after.map((h) => ({
                minionId: h.minionId,
                hp: h.hp,
                maxHp: h.maxHp,
                label: h.label,
              })),
            }
          : prev,
      );
    }

    if (adv && (adv.result === "LOSS" || adv.result === "WIN_AND_CASHOUT")) {
      setCombatIsBoss(false);
      showSettlementAfterAdvance(adv);
      return;
    }
    if (adv?.result === "WIN") {
      const mult = adv.lootMultiplier ?? 1;
      const gold = adv.goldGained ?? 0;
      const fought = Math.max(1, Math.floor(adv.floor ?? 1));
      const reachedBoss = fought + 1 >= maxFloors;
      setCombatIsBoss(false);
      if (reachedBoss) {
        setLastFloorBonus("보스 방 도착 · 아래 「보스 입장」으로 최종 전투를 시작하세요.");
      } else if (mult > 1 || gold > 0) {
        setLastFloorBonus(`층 클리어 · 드랍 ×${mult}${gold > 0 ? ` · +${gold.toLocaleString()} G` : ""}`);
      }
      if (autoAdvanceRef.current) {
        queueAutoAdvance();
      }
    }
    // advance 응답으로 floor/HP/loot 등이 이미 반영되므로 즉시 state 재조회는 생략
    // (리플레이 종료 직후 중복 호출로 DB 부하/대기만 증가)
  }

  function fallbackCombatReplay(lines: CombatLogLine[]): DungeonCombatReplay | null {
    const roster = partyRoster;
    const start = lines.find((l) => l.t === "floor_start");
    if (!roster?.length || !start || start.t !== "floor_start") return null;
    return {
      floor: start.floor,
      enemy: {
        name: start.enemyName,
        maxHp: start.enemyMaxHp ?? 100,
        monsterId: monsterIdFromDisplayName(start.enemyName),
        portrait: monsterPortraitView({ monsterId: monsterIdFromDisplayName(start.enemyName) }),
      },
      partyBefore: roster.map((m) => {
        const minion = minions.find((x) => x.id === m.id);
        return {
          minionId: m.id,
          label: m.label,
          hp: m.hp,
          maxHp: m.maxHp,
          portrait: minionPortraitView({
            weaponBaseItemId: minion?.equippedWeapon?.baseItemId ?? null,
          }),
        };
      }),
    };
  }

  function startBattlePlayback(lines: CombatLogLine[], replay: DungeonCombatReplay | null, boss?: boolean) {
    setBattlePreparing(false);
    if (!lines.length || !replay) {
      finishBattlePlayback();
      return;
    }
    setCombatIsBoss(!!boss);
    setCombatActive(true);
    setBattleReplay(replay);
    setBattleLines(lines);
    setPlayingLog(true);
  }

  useEffect(() => () => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
  }, []);

  useEffect(() => {
    if (!embedded && sessionLoading) return;
    if (!user) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionLoading, embedded]);

  useEffect(() => {
    if (!embedded) return;
    const onFrameRefresh = () => void refresh();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);

  useEffect(() => {
    if (sessionLoading || !user || combatActive || playingLog || !exploring) return;
    const t = setInterval(() => {
      void refresh({ runStateOnly: true });
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, combatActive, playingLog, exploring]);

  useEffect(() => {
    if (exploring) return;
    if (!minions.length) return;
    setPartyIds(() => {
      if (isIdleMode || maxParty <= 1) {
        return new Set([minions[0]!.id]);
      }
      const trimmed = resolveSavedPartyIds(readSavedPartyIds(partyStorageKey), minions, maxParty);
      if (trimmed.size > 0) return trimmed;
      return new Set([minions[0]!.id]);
    });
  }, [minions, maxParty, exploring, partyStorageKey, isIdleMode]);

  useEscapeClose(partyOpen, () => setPartyOpen(false));
  useEscapeClose(!!settlement, dismissSettlement);

  async function openParty() {
    setPartyOpen(true);
    setPartyBusy(true);
    try {
      const roster = await fetchCombatRoster(user!.id, { force: true });
      setMinions(roster as DungeonMinionRow[]);
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
        const n = new Set(prev);
        if (n.size >= maxParty && !n.has(id)) return prev;
        n.add(id);
        return n;
      }
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  }

  function confirmParty() {
    writeSavedPartyIds(partyStorageKey, partyIds);
    setPartyOpen(false);
  }

  async function runAdvanceFloor(opts?: { dungeonId?: string; minionIds?: string[] }) {
    const r = await postJson<AdvanceResult>("/api/dungeons/run/advance", {
      dungeonId: opts?.dungeonId,
      minionIds: opts?.minionIds,
    });

    pendingAdvanceResultRef.current = r;
    pendingPartyHpRef.current = r.partyHp ?? null;
    mergeSessionXp(r.minionXpGrants);

    const lines = r.combatLog ?? [];
    const replay = r.combatReplay ?? fallbackCombatReplay(lines);
    startBattlePlayback(lines, replay, r.isBoss);
  }

  async function executeIdleCollect() {
    if (!dungeon) return;
    setError(null);

    const previewLoot = run?.pendingLootItems ?? [];
    const previewGold = run?.pendingGold ?? 0;

    openSettlement({
      kind: "cashout",
      subtitle: IDLE_COLLECT_SUBTITLE,
      xpGrants: [],
      loot: previewLoot,
      goldGained: previewGold,
    });
    setRun((prev) => (prev ? { ...prev, active: false, pendingLootItems: [], pendingGold: 0 } : prev));
    endRunSession();

    idleCollectInFlightRef.current = true;
    void (async () => {
      try {
        const r = await postJson<{ ok: boolean; cashedOut?: DungeonLootRow[]; goldGained?: number }>(
          "/api/dungeons/idle/collect",
          { dungeonId: dungeon.id },
        );
        const serverLoot = r.cashedOut ?? [];
        const serverGold = r.goldGained ?? 0;
        const lootKey = (rows: DungeonLootRow[]) =>
          [...rows]
            .map((row) => `${row.itemId}\t${row.qty}`)
            .sort()
            .join("\n");
        const previewMatchesServer =
          previewGold === serverGold &&
          previewLoot.length === serverLoot.length &&
          lootKey(previewLoot) === lootKey(serverLoot);
        if (!previewMatchesServer) {
          setSettlement((prev) =>
            prev?.subtitle === IDLE_COLLECT_SUBTITLE
              ? { ...prev, loot: serverLoot, goldGained: serverGold }
              : prev,
          );
        }
        notifyGameFramePatch(["wallet", "inventory", "weapons", "armor"]);
      } catch (e) {
        setSettlement(null);
        setError(e);
        void refresh({ runStateOnly: true });
      } finally {
        idleCollectInFlightRef.current = false;
      }
    })();
  }

  async function startRun(enableAuto = false) {
    if (!dungeon) return;
    if (isIdleMode) {
      setBusy("start");
      setError(null);
      try {
        await postJson("/api/dungeons/idle/start", {
          dungeonId: dungeon.id,
        });
        writeSavedPartyIds(partyStorageKey, partyIds);
        setRunSession(true);
        await refresh({ runStateOnly: true });
      } catch (e) {
        endRunSession();
        setError(e);
      } finally {
        setBusy(null);
      }
      return;
    }
    setAutoAdvanceOn(enableAuto);
    setBusy("start");
    setLogLines([]);
    setLastFloorBonus(null);
    setError(null);
    setBattlePreparing(true);
    optimisticRunAfterStart();
    try {
      resetSessionXp();
      setRunSession(true);
      if (isSpecialMode) {
        await postJson("/api/special-dungeons/run/start", {
          dungeonId: dungeon.id,
          minionIds: [...partyIds],
        });
      }
      await runAdvanceFloor({ dungeonId: dungeon.id, minionIds: [...partyIds] });
    } catch (e) {
      setPlayingLog(false);
      setAutoAdvanceOn(false);
      endRunSession();
      setRun((prev) => (prev?.active ? { ...prev, active: false } : prev));
      setError(e);
    } finally {
      setBattlePreparing(false);
      setBusy(null);
    }
  }

  async function advance() {
    setBusy("advance");
    setError(null);
    const enteringBoss = floor >= maxFloors;
    if (enteringBoss) setCombatIsBoss(true);
    setBattlePreparing(true);
    try {
      await runAdvanceFloor();
    } catch (e) {
      setPlayingLog(false);
      if (enteringBoss) setCombatIsBoss(false);
      setError(e);
    } finally {
      setBattlePreparing(false);
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!combatActive) return;
    const t = window.setTimeout(() => finishBattlePlayback(), 120_000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combatActive]);

  return (
    <div className={`dungeon-shell ${embedded ? "dungeon-shell--fit panel-fit" : ""}`}>
      <div className={`dungeon-hero ${embedded ? "dungeon-hero--compact" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          {!embedded ? (
            <div>
              <p className="game-label">던전</p>
              <h2 className="game-title mt-1 text-lg">{dungeon?.name ?? "마계 · 오염의 웅덩이"}</h2>
              <p className="mt-1 text-xs text-[var(--game-muted)]">
                {isIdleMode
                  ? "시간에 따라 자동 롤 · 골드·재료 위주 (장비 드랍 축소)"
                  : isSpecialMode
                    ? `층마다 전투 · 티켓 ${dungeon?.ticketCost ?? 1}장 소비 · 패배 시 보상 소멸`
                    : "층마다 전투 진행 · 패배 시 보상 소멸"}
                {!isIdleMode && autoAdvance && exploring ? " · 다음 층 자동 진행 중" : ""}
              </p>
              {dungeon?.stage ? (
                <p className="mt-1 text-[11px] font-semibold text-[var(--game-gold-bright)]">
                  {dungeon.stage.recommendedPowerLabel ??
                    `전투력 ${(dungeon.stage.minPartyPower ?? 0).toLocaleString()}+`}
                  <span className="ml-2 font-normal text-[var(--game-muted)]">
                    · 파티 {partyPower.toLocaleString()} CP
                  </span>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0">
              <h2 className="game-title text-sm">{dungeon?.name ?? "마계 · 오염의 웅덩이"}</h2>
              {dungeon?.stage ? (
                <p className="mt-0.5 text-[10px] text-[var(--game-muted)]">
                  {dungeon.stage.realm ? `${dungeon.stage.realm} · ` : ""}
                  스테이지 {dungeon.stage.stageOrder} ·{" "}
                  {dungeon.stage.recommendedPowerLabel ?? `전투력 ${(dungeon.stage.minPartyPower ?? 0).toLocaleString()}+`}
                </p>
              ) : null}
            </div>
          )}
          <span className={`dungeon-status-pill ${exploring ? "dungeon-status-pill--live" : ""}`.trim()}>
            {isIdleMode && exploring
              ? "● 방치 중"
              : autoAdvance && exploring
                ? "● 자동 탐험"
                : exploring
                  ? "● 탐험 중"
                  : "○ 대기"}
          </span>
        </div>
        {(!isIdleMode || exploring) ? (
          <div className="dungeon-floor-track">
            <div className="dungeon-floor-fill" style={{ width: `${exploring ? floorPct : 0}%` }} />
          </div>
        ) : null}
        {!(isIdleMode && !exploring) ? (
          <p className={`text-right text-[11px] font-semibold tabular-nums text-[var(--game-muted)] ${embedded ? "mt-1" : "mt-2"}`}>
            {floorLabel}
          </p>
        ) : null}
        {exploring ? (
          <p className="text-right text-[10px] text-[var(--game-muted)]">
            {isIdleMode ? (
              <>
                다음 롤 {idleNextRollLabel ?? "—"} · 간격{" "}
                {idleRollIntervalSec >= 60
                  ? `${Math.round(idleRollIntervalSec / 60)}분`
                  : `${idleRollIntervalSec}초`}
                {(run?.pendingGold ?? 0) > 0 ? (
                  <span className="ml-2 text-[var(--game-gold-bright)]">
                    대기 골드 +{(run?.pendingGold ?? 0).toLocaleString()} G
                  </span>
                ) : null}
              </>
            ) : atBossGate ? (
              <span className="font-semibold text-rose-300">최종 보스 대기 중</span>
            ) : (
              <>
                이번 층 드랍 ×{pushLuckLootMultiplier(floor)}
                {selectedStageOrder > 0
                  ? ` · 클리어 +${pushLuckFloorGoldReward(floor, selectedStageOrder).toLocaleString()} G`
                  : null}
              </>
            )}
          </p>
        ) : isSpecialMode && dungeon?.ticketCost ? (
          <p className="text-right text-[10px] text-[var(--game-muted)]">
            입장권 <span className="text-[var(--game-gold-bright)]">{dungeon.ticketCost}장</span> 소비
          </p>
        ) : null}
        {!isIdleMode && lastFloorBonus ? (
          <p className="text-right text-[11px] font-semibold text-[var(--game-gold-bright)]">{lastFloorBonus}</p>
        ) : null}
        {!exploring && stagePickerRows.length > 0 ? (
          <div className={`dungeon-stage-picker ${embedded ? "dungeon-stage-picker--compact" : ""}`.trim()}>
            <div className="dungeon-stage-picker__head">
              <span className="dungeon-stage-picker__title">스테이지 선택</span>
              <span className="dungeon-stage-picker__hint">{stagePickerRows.length}개</span>
            </div>
            <div className="dungeon-stage-picker__strip-wrap">
              <div className="dungeon-stage-picker__strip" role="tablist" aria-label="던전 스테이지">
                {stagePickerRows.map((row) => {
                  const active = selectedStageOrder === row.stageOrder;
                  return (
                    <span
                      key={row.stageOrder}
                      ref={(el) => {
                        if (el) stageTabRefs.current.set(row.stageOrder, el);
                        else stageTabRefs.current.delete(row.stageOrder);
                      }}
                      className="dungeon-stage-tab-btn-wrap"
                      role="presentation"
                    >
                      <GameBtn
                        variant={active ? "gold" : "ghost"}
                        disabled={!!busy}
                        className="dungeon-stage-tab-btn"
                        onClick={() => selectStage(row.stageOrder)}
                      >
                        <span className="dungeon-stage-tab-btn__order">ST.{row.stageOrder}</span>
                        <span className={`dungeon-realm-tag dungeon-realm-tag--${row.realm}`}>{row.realm}</span>
                        <span className="dungeon-stage-tab-btn__name">{row.name}</span>
                      </GameBtn>
                    </span>
                  );
                })}
              </div>
            </div>
            {selectedStageRow && selectedStageDungeon ? (
              <div className="dungeon-stage-picker__detail">
                <div className="dungeon-stage-picker__detail-head">
                  <span className={`dungeon-realm-tag dungeon-realm-tag--${selectedStageRow.realm}`}>
                    {selectedStageRow.realm}
                  </span>
                  <div className="dungeon-stage-picker__detail-name">{selectedStageRow.displayName}</div>
                </div>
                <div className="dungeon-stage-picker__detail-meta">
                  {selectedStageRow.recommendedPowerLabel ??
                    `전투력 ${(selectedStageDungeon.stage?.minPartyPower ?? 0).toLocaleString()}+`}
                </div>
              </div>
            ) : null}
            {selectedStageRow && selectedStageRow.dungeons.length > 1 ? (
              <div className="dungeon-stage-picker__variants">
                {selectedStageRow.dungeons.map((d) => (
                  <GameBtn
                    key={d.id}
                    variant={dungeon?.id === d.id ? "gold" : "ghost"}
                    className="h-8 flex-1 px-2 text-xs"
                    disabled={!!busy}
                    onClick={() => selectStage(selectedStageRow.stageOrder, d.id)}
                  >
                    {d.name}
                  </GameBtn>
                ))}
              </div>
            ) : null}
            {dungeon?.id && !exploring ? (
              <DungeonDropTable
                table={dungeonDropTableForId(dungeon.id)}
                compact={embedded}
                hint={isIdleMode ? "방치 롤마다 추첨 · 확률은 해당 풀 기준" : undefined}
                hideFloorLabels={isIdleMode}
              />
            ) : null}
          </div>
        ) : exploring ? (
          <p className={`${embedded ? "mt-1.5 text-[10px]" : "mt-2 text-xs"} text-[var(--game-muted-dim)]`}>
            탐험 중에는 스테이지를 변경할 수 없습니다.
          </p>
        ) : null}
      </div>

      {error ? <GamePanelError error={error} /> : null}

      {dataLoading && !dungeon ? <GamePanelLoading label="던전 불러오는 중…" /> : null}

      {!embedded && sessionLoading ? (
        <GamePanelLoading label="세션 확인 중…" />
      ) : !embedded && !user ? (
        <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
      ) : (embedded || user) ? (
      <div className={embedded ? "dungeon-body-fit" : "grid gap-4 lg:grid-cols-[16rem_1fr]"}>
        <div className={embedded ? "dungeon-sidebar-fit" : "flex flex-col gap-3"}>
          <GamePanel className={embedded ? "!p-2" : "!p-3"}>
            <GamePanelTitle>{embedded ? "전투·파티" : "전투"}</GamePanelTitle>
            <div className={embedded ? "mt-1.5" : "mt-2"}>
              <GameStat
                label="전투력"
                value={
                  run?.combat?.partyPower != null
                    ? displayCombatPower(run.combat.partyPower).toLocaleString()
                    : "—"
                }
                highlight
              />
            </div>
            {run?.combat?.partyPower != null &&
            displayCombatPower(run.combat.partyPower) < displayCombatPower(120) &&
            !embedded ? (
              <p className="mt-2 text-[11px] leading-snug text-[var(--game-muted)]">
                더 깊은 층은 더 높은 전투력이 필요해요.{" "}
                <Link href="/market" className="font-semibold text-[var(--game-gold-bright)] underline-offset-2 hover:underline">
                  거래소에서 장비 구매
                </Link>
              </p>
            ) : null}
            {embedded ? (
              <>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-[var(--game-muted)]">
                    {exploring && partyRoster
                      ? `생존 ${partyAlive}/${partyRoster.length}`
                      : `파티 ${partyIds.size}/${maxParty}`}
                  </span>
                  {!exploring || !partyRoster?.length
                    ? partyChips.length === 0
                      ? (
                          <span className="text-[10px] text-[var(--game-muted-dim)]">미선택</span>
                        )
                      : (
                          partyChips.map((c) => (
                            <span key={c.id} className="dungeon-party-chip text-[10px]">
                              {c.label}
                            </span>
                          ))
                        )
                    : null}
                </div>
                {exploring && partyRoster && partyRoster.length > 0 ? (
                  <DungeonPartyHpList roster={partyRoster} compact />
                ) : null}
                {!isIdleMode ? (
                <GameBtn
                  variant="ghost"
                  className="mt-1.5 h-8 w-full text-[10px]"
                  disabled={!!busy || exploring}
                  onClick={() => void openParty()}
                >
                  파티 편성
                </GameBtn>
                ) : (
                  <p className="mt-1.5 text-[10px] text-[var(--game-muted)]">미니언 자동 출전</p>
                )}
              </>
            ) : null}
          </GamePanel>

          {!embedded && !isIdleMode ? (
          <GamePanel className="!p-3">
            <div className="flex items-center justify-between">
              <GamePanelTitle>파티</GamePanelTitle>
              <span className="text-[11px] text-[var(--game-muted)]">
                {run?.active && partyRoster
                  ? `생존 ${partyAlive}/${partyRoster.length}`
                  : `${partyIds.size}/${maxParty}`}
              </span>
            </div>
            {exploring && partyRoster && partyRoster.length > 0 ? (
              <DungeonPartyHpList roster={partyRoster} />
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {partyChips.length === 0 ? (
                  <span className="text-xs text-[var(--game-muted-dim)]">미선택</span>
                ) : (
                  partyChips.map((c) => (
                    <span key={c.id} className="dungeon-party-chip">
                      {c.label}
                    </span>
                  ))
                )}
              </div>
            )}
            <GameBtn
              variant="ghost"
              className="mt-2 h-9 w-full text-xs"
              disabled={!!busy || exploring}
              onClick={() => void openParty()}
            >
              파티 편성
            </GameBtn>
          </GamePanel>
          ) : null}

          {exploring && !isIdleMode ? (
          <GamePanel className={embedded ? "!p-2" : "!p-3"}>
            <GamePanelTitle>{embedded ? "명령" : "명령"}</GamePanelTitle>
            <div className={`dungeon-action-grid ${embedded ? "mt-1.5" : "mt-2"}`}>
              <GameBtn
                variant={autoAdvance ? "gold" : "ghost"}
                className={`dungeon-action-span ${embedded ? "h-8 text-xs" : "h-9 text-xs"}`}
                disabled={!!busy || combatActive}
                onClick={() => setAutoAdvanceOn(!autoAdvance)}
              >
                {autoAdvance ? "자동 진행 중 · 중지" : "다음 층 자동"}
              </GameBtn>
              <GameBtn
                variant="ghost"
                className={embedded ? "h-8 text-xs" : "h-10 text-sm"}
                disabled={!!busy || combatActive}
                onClick={() => setCashoutConfirmOpen(true)}
              >
                정산
              </GameBtn>
            </div>
          </GamePanel>
          ) : null}
        </div>

        <div className="combat-encounter mt-3">
          {isIdleMode ? (
            <>
              {exploring && cashoutLoot.length > 0 ? (
                <div
                  className={`dungeon-pending-loot ${embedded ? "dungeon-pending-loot--compact" : ""}`.trim()}
                  aria-label="대기 중인 전리품"
                >
                  <ul className="dungeon-pending-loot__icon-grid">
                    {cashoutLoot.map((row) => (
                      <li
                        key={row.itemId}
                        className="dungeon-pending-loot__icon-cell"
                        title={`${row.name} ×${row.qty.toLocaleString()}`}
                      >
                        <ItemIcon
                          itemId={row.itemId}
                          size={embedded ? 36 : 40}
                          className={`dungeon-pending-loot__icon ${itemGradeFrameClassName(row.grade)}`.trim()}
                        />
                        {row.qty > 1 ? (
                          <span className="dungeon-pending-loot__icon-badge">×{row.qty.toLocaleString()}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="combat-encounter__hint text-xs text-[var(--game-muted)]">
                {exploring
                  ? "오프라인·방치 중에도 롤이 쌓입니다. 수확하면 파티가 해제됩니다."
                  : "스테이지·파티를 고른 뒤 방치 탐험을 시작하세요."}
              </p>
              {exploring ? (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <GameBtn
                    variant="gold"
                    className={`combat-encounter__action-btn flex-1 ${embedded ? "h-10 text-sm" : "h-11 text-base"}`}
                    disabled={!!busy}
                    onClick={() => void executeIdleCollect()}
                  >
                    {busy === "collect" ? "수확 중…" : "보상 수확"}
                  </GameBtn>
                </div>
              ) : (
                <div className="mt-2">
                  <GameBtn
                    variant="primary"
                    className={`combat-encounter__action-btn w-full ${embedded ? "h-10 text-sm" : "h-11 text-base"}`}
                    disabled={!!busy || !canStartDungeon}
                    onClick={() => void startRun(false)}
                  >
                    {busy === "start" ? "시작 중…" : "방치 시작"}
                  </GameBtn>
                </div>
              )}
            </>
          ) : (
            <>
          <CombatEncounterBlock
            embedded={embedded}
            playing={playingLog}
            replay={battleReplay}
            lines={battleLines}
            onComplete={finishBattlePlayback}
            isBoss={combatIsBoss}
            bossGateIdle={atBossGate && !battlePreparing}
            preparingLabel={transitionMessage ?? undefined}
            transitioning={isFloorTransition && !playingLog}
            idleHint={!exploring ? "전투를 시작하면 여기서 재생됩니다." : undefined}
          />

          <p className="combat-encounter__hint mt-2 text-xs text-[var(--game-muted)]">
            {transitionMessage
              ? transitionMessage
              : atBossGate
                ? autoAdvance
                  ? "보스 방 도착 · 곧 보스 전투가 자동으로 시작됩니다."
                  : "보스 방에 도달했습니다. 「보스 입장」으로 최종 전투를 시작하세요."
                : exploring
                  ? autoAdvance
                    ? "층 클리어 후 다음 층이 자동으로 진행됩니다."
                    : floor >= maxFloors
                      ? "「보스 입장」으로 최종 전투를 시작하세요."
                      : "아래 버튼으로 다음 층 전투를 시작하세요."
                  : "스테이지·파티를 고른 뒤 탐험을 시작하세요."}
          </p>

          {exploring ? (
            <div className="mt-2">
              <GameBtn
                variant="gold"
                className={`combat-encounter__action-btn ${embedded ? "h-10 text-sm" : "h-11 text-base"}`}
                disabled={!!busy || combatActive || battlePreparing}
                onClick={() => void advance()}
              >
                {advanceActionLabel}
              </GameBtn>
            </div>
          ) : (
            <div className="mt-2 flex w-full flex-col gap-2">
              {partyEligibility && !partyEligibility.ok ? (
                <p className="text-center text-xs text-amber-300/90">
                  파티 전투력 부족 (현재 {partyEligibility.partyPower.toLocaleString()} / 필요{" "}
                  {partyEligibility.minPower.toLocaleString()})
                </p>
              ) : null}
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <GameBtn
                  variant="primary"
                  className={`combat-encounter__action-btn flex-1 ${embedded ? "h-10 text-sm" : "h-11 text-base"}`}
                  disabled={!!busy || !canStartDungeon || combatActive}
                  onClick={() => void startRun(false)}
                >
                  {busy === "start" ? "탐험을 시작하는 중…" : "탐험 시작"}
                </GameBtn>
                <GameBtn
                  variant="gold"
                  className={`combat-encounter__action-btn flex-1 ${embedded ? "h-10 text-sm" : "h-11 text-base"}`}
                  disabled={!!busy || !canStartDungeon || combatActive}
                  onClick={() => void startRun(true)}
                >
                  {busy === "start" ? "탐험을 시작하는 중…" : "자동 탐험"}
                </GameBtn>
              </div>
            </div>
          )}
            </>
          )}
        </div>
        {logLines.length > 0 && !combatActive ? (
          <div className="dungeon-arena-feed-extra">
            {logLines.map((line) => (
              <p key={line.id} className="dungeon-arena__feed">
                {line.text}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      ) : null}

      <DungeonPartyPickModal
        open={partyOpen}
        maxParty={maxParty}
        partyIds={partyIds}
        minions={dungeonMinions}
        loading={partyBusy}
        emptyLabel="던전에 보낼 미니언이 없습니다."
        onClose={() => setPartyOpen(false)}
        onToggle={toggleParty}
        onConfirm={confirmParty}
      />

      <DungeonCashoutConfirmModal
        open={cashoutConfirmOpen}
        loot={cashoutLoot}
        pendingGold={run?.pendingGold}
        onCancel={() => setCashoutConfirmOpen(false)}
        onConfirm={() => void executeCashout()}
        onForfeit={
          cashoutLoot.length > 0 || (run?.pendingGold ?? 0) > 0 ? () => void executeForfeit() : undefined
        }
      />

      <DungeonRunSettlementModal
        open={settlement != null}
        settlement={settlement}
        onConfirm={dismissSettlement}
      />
    </div>
  );
}
