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
import { DungeonCashoutConfirmModal } from "@/app/_components/DungeonCashoutConfirmModal";
import { DungeonPartyPickModal } from "@/app/_components/DungeonPartyPickModal";
import { DungeonRunSettlementModal } from "@/app/_components/DungeonRunSettlementModal";
import {
  DungeonPartyHpList,
  type PartyRosterRow,
  type RecoveryPotion,
} from "@/app/_components/DungeonPartyHpList";
import { DungeonPotionModal } from "@/app/_components/DungeonPotionModal";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import type {
  DungeonLootRow,
  DungeonSettlement,
  MinionXpGrantPayload,
} from "@/shared/dungeonSettlement";
import { settlementTitle } from "@/shared/dungeonSettlement";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";
import {
  dungeonIdForStageOrder,
  listDungeonStagePickerOptions,
  stageOrderForDungeonId,
} from "@/shared/dungeonStageProgression";
import { checkDungeonPartyEligibility } from "@/shared/dungeonDifficulty";
import { pushLuckFloorGoldReward, pushLuckLootMultiplier } from "@/shared/dungeonPushLuck";
import { assertDungeonStage } from "@/shared/dungeonStageProgression";
import { normalizeItemIdLower } from "@/shared/itemId";
import { fetchCombatRoster } from "@/shared/combatRosterClient";

type DungeonDef = {
  id: string;
  name: string;
  mode?: "AUTO_WAVES" | "PUSH_LUCK";
  maxFloors?: number;
  maxPartySize?: number;
  baseWaveSeconds: number;
  stage?: {
    stageOrder: number;
    realm?: "마계" | "천계" | "이계";
    recommendedLevel: number;
    recommendedLevelMax: number;
    recommendedLevelLabel: string;
    recommendedPartyPower?: number;
    minPartyLevel?: number;
    journeyXpPool: number;
    fullClearXp: number;
  };
};

type RunState = {
  ok: boolean;
  active: boolean;
  combatActive?: boolean;
  run?: {
    id: string;
    dungeonId: string;
    wins: number;
    losses: number;
    floor?: number;
  };
  combat?: { partyPower: number };
  dungeon?: DungeonDef;
  party?: Array<{ minionId: string; hp?: number; maxHp?: number; label?: string }>;
  pendingLoot?: string;
  pendingLootItems?: Array<{ itemId: string; qty: number; name: string; grade: number }>;
  pendingGold?: number;
  recoveryPotions?: RecoveryPotion[];
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
const DUNGEON_SELECT_KEY = "dungeon_selected_id_v1";
const DUNGEON_STAGE_SELECT_KEY = "dungeon_selected_stage_v1";

function potionErrorMessage(code: string): string {
  switch (code) {
    case "NO_POTION":
      return "물약이 부족합니다.";
    case "MINION_DEAD":
      return "전투불능 상태에는 사용할 수 없습니다.";
    case "MINION_FULL_HP":
      return "이미 HP가 가득합니다.";
    case "INVALID_POTION":
      return "던전에서 사용할 수 없는 물약입니다.";
    case "NO_ACTIVE_RUN":
      return "진행 중인 던전이 없습니다.";
    default:
      return code;
  }
}

function resolveDungeonFromList(list: DungeonDef[], currentId?: string | null): DungeonDef | null {
  if (!list.length) return null;
  if (typeof window !== "undefined") {
    const savedStageRaw = localStorage.getItem(DUNGEON_STAGE_SELECT_KEY);
    const savedStage = savedStageRaw ? Number(savedStageRaw) : NaN;
    if (Number.isFinite(savedStage) && savedStage > 0) {
      const id = dungeonIdForStageOrder(savedStage);
      const byStage = id ? list.find((d) => d.id === id) : null;
      if (byStage) return byStage;
    }
    const savedId = localStorage.getItem(DUNGEON_SELECT_KEY) ?? "";
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

export function DungeonsPanel({ embedded = false }: EmbeddedPanelProps = {}) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dungeon, setDungeon] = useState<DungeonDef | null>(null);
  const [dungeons, setDungeons] = useState<DungeonDef[]>([]);
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
  const [potionModalOpen, setPotionModalOpen] = useState(false);
  /** 탐험 세션 — run.active 갱신 전·후 UI 깜빡임(스테이지 선택) 방지 */
  const [runSession, setRunSession] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const logId = useRef(0);

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
    }, 700);
  }

  const floor = Math.max(1, Math.floor(run?.run?.floor ?? 1));
  const maxFloors = dungeon?.maxFloors ?? 20;
  const maxParty = Math.max(1, dungeon?.maxPartySize ?? 1);
  const atBossGate = exploring && floor >= maxFloors && !combatActive && !battlePreparing;
  const floorPct = atBossGate
    ? Math.min(99, Math.round(((maxFloors - 1) / maxFloors) * 100))
    : Math.min(99, Math.round(((Math.min(floor, maxFloors) - 1) / maxFloors) * 100));
  const floorLabel = atBossGate
    ? `보스 · ${maxFloors}층`
    : exploring
      ? `${Math.min(floor, maxFloors)} / ${maxFloors}층`
      : `최대 ${maxFloors}층`;
  const advanceActionLabel = combatActive
    ? "전투 중…"
    : busy === "combat" || busy === "start" || battlePreparing
      ? floor >= maxFloors
        ? "보스 입장 중…"
        : "전투 준비…"
      : floor >= maxFloors
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
    return listDungeonStagePickerOptions()
      .map((opt) => {
        const dungeonsInStage = opt.dungeonIds
          .map((id) => dungeons.find((d) => d.id === id))
          .filter((d): d is DungeonDef => !!d);
        if (dungeonsInStage.length === 0) return null;
        return { ...opt, dungeons: dungeonsInStage };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }, [dungeons]);

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
        localStorage.setItem(DUNGEON_STAGE_SELECT_KEY, String(stageOrder));
        localStorage.setItem(DUNGEON_SELECT_KEY, next.id);
      } catch {
        /* ignore */
      }
    },
    [exploring, busy, stagePickerRows],
  );

  const partyChips = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const id of partyIds) {
      const m = minions.find((x) => x.id === id);
      if (!m) continue;
      out.push({
        id,
        label: `${m.combatClassLabel} Lv${m.level}`,
      });
    }
    return out;
  }, [partyIds, minions]);

  const partyEligibility = useMemo(() => {
    if (!dungeon?.id || partyIds.size === 0) return null;
    try {
      const stage = assertDungeonStage(dungeon.id);
      return checkDungeonPartyEligibility({
        stage,
        partyLevels: [...partyIds]
          .map((id) => minions.find((m) => m.id === id)?.level ?? 0)
          .filter((lv) => lv > 0),
      });
    } catch {
      return null;
    }
  }, [dungeon?.id, partyIds, minions]);

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
      const fallbackLabel = m ? `${m.combatClassLabel} Lv${m.level}` : p.minionId.slice(0, 8);
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
  const recoveryPotions = run?.recoveryPotions ?? [];

  async function usePotion(itemId: string, minionId: string) {
    setBusy(`potion-${minionId}`);
    setError(null);
    try {
      const r = await postJson<{
        ok: boolean;
        error?: string;
        healedAmount?: number;
        partyHp?: Array<{ minionId: string; hp: number; maxHp: number; label?: string }>;
      }>("/api/dungeons/run/use-potion", { itemId, minionId });
      if (r.partyHp?.length) {
        setRun((prev) => {
          if (!prev?.active) return prev;
          const nextPotions = (prev.recoveryPotions ?? [])
            .map((p) => (p.itemId === itemId ? { ...p, quantity: Math.max(0, p.quantity - 1) } : p))
            .filter((p) => p.quantity > 0);
          return {
            ...prev,
            party: r.partyHp!.map((h) => ({
              minionId: h.minionId,
              hp: h.hp,
              maxHp: h.maxHp,
              label: h.label,
            })),
            recoveryPotions: nextPotions,
          };
        });
        const healed = r.healedAmount ?? 0;
        if (healed > 0) {
          const potionName = recoveryPotions.find((p) => p.itemId === itemId)?.name ?? "물약";
          const targetLabel = partyRoster?.find((m) => m.id === minionId)?.label ?? "파티원";
          logId.current += 1;
          setLogLines((prev) => [
            ...prev,
            {
              id: `potion-${logId.current}`,
              text: `${targetLabel}에게 ${potionName} 사용 — HP +${healed.toLocaleString()}`,
              tone: "system" as const,
            },
          ]);
        }
      }
      setPotionModalOpen(false);
    } catch (e) {
      const code =
        typeof e === "object" && e && "error" in e && typeof (e as { error?: string }).error === "string"
          ? (e as { error: string }).error
          : e instanceof Error
            ? e.message
            : String(e);
      setError(new Error(potionErrorMessage(code)));
    } finally {
      setBusy(null);
    }
  }

  const dungeonMinions = useMemo(
    () => minions.filter((m) => isDungeonPool(m.pool)),
    [minions],
  );

  function minionLabelForSettlement(minionId: string, fallback?: string) {
    const m = minions.find((x) => x.id === minionId);
    if (m) return `${m.combatClassLabel} Lv${m.level}`;
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

  function applyRunStateFromApi(state: RunState) {
    if (state.ok) {
      setRun(state);
      if (state.active) setRunSession(true);
      else if (!combatActive) endRunSession();
      if (state.active && state.dungeon) setDungeon(state.dungeon);
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
    setSettlement(null);
    setLastFloorBonus(null);
    resetSessionXp();
    void refresh();
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
      const [list, state, roster] = await Promise.all([
        apiGetJsonCached<{ ok: boolean; dungeons: DungeonDef[] }>("/api/dungeons/list?lite=1", {
          ttlMs: API_CACHE_TTL.dungeonsList,
        }),
        apiGetJsonCached<RunState>("/api/dungeons/run/state?lite=1", { ttlMs: API_CACHE_TTL.runState }),
        fetchCombatRoster(user.id),
      ]);
      if (roster.length) setMinions(roster as DungeonMinionRow[]);
      if (list.ok) {
        setDungeons(list.dungeons);
      }
      if (state.ok) {
        applyRunStateFromApi(state);
        if (!state.active && list.ok) {
          const next = resolveDungeonFromList(list.dungeons, dungeon?.id);
          setDungeon(next);
        }
        if (!state.active && roster.length) {
          const cap = Math.max(1, (state.dungeon ?? dungeon)?.maxPartySize ?? 1);
          setPartyIds(resolveSavedPartyIds(readSavedPartyIds(PARTY_KEY), roster as DungeonMinionRow[], cap));
        }
      } else if (list.ok) {
        const next = resolveDungeonFromList(list.dungeons, dungeon?.id);
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
    setPartyIds((prev) => {
      const trimmed = resolveSavedPartyIds([...prev], minions, maxParty);
      if (trimmed.size > 0) return trimmed;
      return resolveSavedPartyIds(readSavedPartyIds(PARTY_KEY), minions, maxParty);
    });
  }, [minions, maxParty, exploring]);

  useEscapeClose(partyOpen, () => setPartyOpen(false));
  useEscapeClose(!!settlement, dismissSettlement);
  useEscapeClose(potionModalOpen, () => setPotionModalOpen(false));

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
    writeSavedPartyIds(PARTY_KEY, partyIds);
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

  async function startRun(enableAuto = false) {
    if (!dungeon) return;
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
    if (enteringBoss) {
      setCombatIsBoss(true);
      setBattlePreparing(true);
    }
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
                층마다 전투 진행 · 패배 시 보상 소멸
                {autoAdvance && exploring ? " · 다음 층 자동 진행 중" : ""}
              </p>
              {dungeon?.stage ? (
                <p className="mt-1 text-[11px] font-semibold text-[var(--game-gold-bright)]">
                  권장 {dungeon.stage.recommendedLevelLabel}
                  {dungeon.stage.minPartyLevel != null ? (
                    <span className="ml-2 font-normal text-[var(--game-muted)]">
                      · 입장 평균 Lv{dungeon.stage.minPartyLevel}+
                    </span>
                  ) : null}
                  <span className="ml-2 font-normal text-[var(--game-muted)]">
                    · 올클 {dungeon.stage.fullClearXp.toLocaleString()} EXP
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
                  스테이지 {dungeon.stage.stageOrder} · 권장 {dungeon.stage.recommendedLevelLabel}
                </p>
              ) : null}
            </div>
          )}
          <span className={`dungeon-status-pill ${exploring ? "dungeon-status-pill--live" : ""}`.trim()}>
            {autoAdvance && exploring ? "● 자동 탐험" : exploring ? "● 탐험 중" : "○ 대기"}
          </span>
        </div>
        <div className="dungeon-floor-track">
          <div className="dungeon-floor-fill" style={{ width: `${exploring ? floorPct : 0}%` }} />
        </div>
        <p className={`text-right text-[11px] font-semibold tabular-nums text-[var(--game-muted)] ${embedded ? "mt-1" : "mt-2"}`}>
          {floorLabel}
        </p>
        {exploring ? (
          <p className="text-right text-[10px] text-[var(--game-muted)]">
            {atBossGate ? (
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
        ) : null}
        {lastFloorBonus ? (
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
                  권장 {selectedStageRow.recommendedLevelLabel.replace(/^Lv\s*/i, "레벨 ")}
                  {selectedStageDungeon.maxFloors ? (
                    <span> · 최대 {selectedStageDungeon.maxFloors}층</span>
                  ) : null}
                  {selectedStageDungeon.stage?.fullClearXp ? (
                    <span> · 올클 {selectedStageDungeon.stage.fullClearXp.toLocaleString()} EXP</span>
                  ) : null}
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
              <GameStat label="전투력" value={run?.combat?.partyPower ?? "—"} highlight />
            </div>
            {run?.combat?.partyPower != null && run.combat.partyPower < 120 && !embedded ? (
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
                <GameBtn
                  variant="ghost"
                  className="mt-1.5 h-8 w-full text-[10px]"
                  disabled={!!busy || exploring}
                  onClick={() => void openParty()}
                >
                  파티 편성
                </GameBtn>
              </>
            ) : null}
          </GamePanel>

          {!embedded ? (
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

          {exploring ? (
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
              {recoveryPotions.length > 0 ? (
                <GameBtn
                  variant="ghost"
                  className={embedded ? "h-8 text-xs" : "h-10 text-sm"}
                  disabled={!!busy || combatActive}
                  onClick={() => setPotionModalOpen(true)}
                >
                  물약
                </GameBtn>
              ) : null}
            </div>
          </GamePanel>
          ) : null}
        </div>

        <div className="combat-encounter mt-3">
          <CombatEncounterBlock
            embedded={embedded}
            playing={playingLog}
            replay={battleReplay}
            lines={battleLines}
            onComplete={finishBattlePlayback}
            isBoss={combatIsBoss}
            bossGateIdle={atBossGate && !battlePreparing}
            preparingLabel={battlePreparing ? (floor >= maxFloors ? "보스 입장 중…" : "전투 준비 중…") : undefined}
            idleHint={!exploring ? "전투를 시작하면 여기서 재생됩니다." : undefined}
          />

          <p className="combat-encounter__hint mt-2 text-xs text-[var(--game-muted)]">
            {battlePreparing
              ? floor >= maxFloors
                ? "보스 입장 중…"
                : "전투 준비 중…"
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
                  평균 레벨 부족 (현재 Lv{partyEligibility.partyLevel} / 필요 Lv
                  {partyEligibility.minLevel})
                </p>
              ) : null}
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <GameBtn
                  variant="primary"
                  className={`combat-encounter__action-btn flex-1 ${embedded ? "h-10 text-sm" : "h-11 text-base"}`}
                  disabled={!!busy || !canStartDungeon || combatActive}
                  onClick={() => void startRun(false)}
                >
                  {busy === "start" ? "전투 준비…" : "탐험 시작"}
                </GameBtn>
                <GameBtn
                  variant="gold"
                  className={`combat-encounter__action-btn flex-1 ${embedded ? "h-10 text-sm" : "h-11 text-base"}`}
                  disabled={!!busy || !canStartDungeon || combatActive}
                  onClick={() => void startRun(true)}
                >
                  {busy === "start" ? "전투 준비…" : "자동 탐험"}
                </GameBtn>
              </div>
            </div>
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

      <DungeonPotionModal
        open={potionModalOpen}
        roster={partyRoster ?? []}
        potions={recoveryPotions}
        busy={!!busy || combatActive}
        onClose={() => setPotionModalOpen(false)}
        onUsePotion={(itemId, minionId) => void usePotion(itemId, minionId)}
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
