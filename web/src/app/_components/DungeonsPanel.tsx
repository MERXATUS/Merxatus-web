"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { readSavedPartyIds, resolveSavedPartyIds, writeSavedPartyIds } from "@/shared/savedParty";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { isDungeonPool } from "@/server/minionJobs";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { apiGetJson, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
import { GameBtn, GamePanel, GamePanelTitle, GameStat } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { minionPortraitView, monsterIdFromDisplayName, monsterPortraitView } from "@/shared/combatPortrait";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import { partyHpFromArena, type BattleArenaFrame } from "@/shared/dungeonCombatReplay";
import { CombatEncounterBlock } from "@/app/_components/CombatEncounterBlock";
import { DungeonCashoutConfirmModal } from "@/app/_components/DungeonCashoutConfirmModal";
import { DungeonPartyPickModal } from "@/app/_components/DungeonPartyPickModal";
import { PushLuckRiskBar } from "@/app/_components/PushLuckRiskBar";
import { DungeonRunSettlementModal } from "@/app/_components/DungeonRunSettlementModal";
import {
  DungeonPartyHpList,
  type PartyRosterRow,
  type RecoveryPotion,
} from "@/app/_components/DungeonPartyHpList";
import { DungeonPotionModal } from "@/app/_components/DungeonPotionModal";
import { PendingLootSummaryModal } from "@/app/_components/PendingLootSummaryModal";
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
import { pushLuckFloorGoldReward, pushLuckLootMultiplier } from "@/shared/dungeonPushLuck";
import { pickBestRecoveryPotion, pickLowestHpMemberId } from "@/shared/potionEffects";

type DungeonDef = {
  id: string;
  name: string;
  mode?: "AUTO_WAVES" | "PUSH_LUCK";
  maxFloors?: number;
  maxPartySize?: number;
  baseWaveSeconds: number;
  stage?: {
    stageOrder: number;
    recommendedLevel: number;
    recommendedLevelMax: number;
    recommendedLevelLabel: string;
    journeyXpPool: number;
    fullClearXp: number;
  };
};

type RunState = {
  ok: boolean;
  active: boolean;
  run?: {
    id: string;
    dungeonId: string;
    wins: number;
    losses: number;
    floor?: number;
  };
  combat?: { partyPower: number; clearChance: number };
  dungeon?: DungeonDef;
  party?: Array<{ minionId: string; hp?: number; maxHp?: number; label?: string }>;
  pendingLoot?: string;
  pendingLootItems?: Array<{ itemId: string; qty: number; name: string; grade: number }>;
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
  goldGained?: number;
  lootMultiplier?: number;
  isBoss?: boolean;
  clearChance?: number;
};

type CashoutResult = {
  ok: boolean;
  cashedOut?: DungeonLootRow[];
};

type StopResult = {
  ok: boolean;
  forfeitedLoot?: DungeonLootRow[];
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
      .map((x: { itemId?: string; qty?: number }) => ({
        itemId: String(x?.itemId ?? ""),
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
  const [itemNames, setItemNames] = useState<Map<string, string>>(new Map());
  const [logLines, setLogLines] = useState<DisplayLogLine[]>([]);
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
  const [playbackClearChance, setPlaybackClearChance] = useState<number | null>(null);
  const [cashoutConfirmOpen, setCashoutConfirmOpen] = useState(false);
  const [pendingLootSummaryOpen, setPendingLootSummaryOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyBusy, setPartyBusy] = useState(false);
  const [potionModalOpen, setPotionModalOpen] = useState(false);
  const logId = useRef(0);

  const floor = Math.max(1, Math.floor(run?.run?.floor ?? 1));
  const maxFloors = dungeon?.maxFloors ?? 20;
  const maxParty = Math.max(1, dungeon?.maxPartySize ?? 1);
  const floorPct = Math.min(100, Math.round((floor / maxFloors) * 100));
  const cashoutLoot = useMemo(() => {
    if (run?.pendingLootItems?.length) return run.pendingLootItems;
    return parseLoot(run?.pendingLoot ?? "[]").map((x) => ({
      itemId: x.itemId,
      qty: x.qty,
      name: itemNames.get(x.itemId) ?? x.itemId,
      grade: 1,
    }));
  }, [run?.pendingLootItems, run?.pendingLoot, itemNames]);

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
      if (run?.active || busy) return;
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
    [run?.active, busy, stagePickerRows],
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

  const partyRoster = useMemo(() => {
    if (!run?.active || !run.party?.length) return null;
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
  }, [run?.active, run?.party, minions, battleFrame]);

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

  function healLowestHp() {
    if (!partyRoster?.length || !recoveryPotions.length) return;
    const targetId = pickLowestHpMemberId(partyRoster);
    if (!targetId) return;
    const target = partyRoster.find((m) => m.id === targetId);
    if (!target) return;
    const missing = Math.max(0, target.maxHp - target.hp);
    const itemId = pickBestRecoveryPotion(missing, target.maxHp, recoveryPotions);
    if (itemId) void usePotion(itemId, targetId);
  }

  const canHealParty =
    run?.active &&
    recoveryPotions.some((p) => p.quantity > 0) &&
    (partyRoster?.some((m) => !m.dead && m.hp < m.maxHp) ?? false);

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
    if (adv.result === "LOSS") {
      openSettlement({
        kind: "defeat",
        subtitle: "누적 보상이 사라졌습니다.",
        xpGrants: buildXpGrantRows(),
        loot: [],
        forfeitedLoot: adv.forfeitedLoot ?? [],
      });
      setRun((prev) => (prev ? { ...prev, active: false, pendingLootItems: [] } : prev));
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
      setRun((prev) => (prev ? { ...prev, active: false, pendingLootItems: [] } : prev));
    }
  }

  async function executeForfeit() {
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
      });
      resetSessionXp();
      setRun((prev) => (prev ? { ...prev, active: false, pendingLootItems: [] } : prev));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function executeCashout() {
    setCashoutConfirmOpen(false);
    setBusy("cashout");
    try {
      const r = await postJson<CashoutResult>("/api/dungeons/run/cashout", {});
      openSettlement({
        kind: "cashout",
        subtitle: "안전하게 보상을 수령했습니다.",
        xpGrants: buildXpGrantRows(),
        loot: r.cashedOut ?? [],
      });
      resetSessionXp();
      setRun((prev) => (prev ? { ...prev, active: false, pendingLootItems: [] } : prev));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    if (!user) return;
    try {
      const [list, state, minionR] = await Promise.all([
        getJson<{ ok: boolean; dungeons: DungeonDef[] }>("/api/dungeons/list"),
        getJson<RunState>("/api/dungeons/run/state"),
        getJson<{ ok: boolean; minions: DungeonMinionRow[] }>("/api/minions/list"),
      ]);
      const roster =
        minionR.ok ? (minionR.minions ?? []).filter((m) => isDungeonPool(m.pool)) : minions;
      if (minionR.ok) setMinions(roster);
      if (list.ok) {
        setDungeons(list.dungeons);
      }
      if (state.ok) {
        setRun(state);
        if (state.active && state.dungeon) {
          setDungeon(state.dungeon);
        } else if (list.ok) {
          const next = resolveDungeonFromList(list.dungeons, dungeon?.id);
          setDungeon(next);
        }
        if (state.active && state.party?.length) {
          setPartyIds(new Set(state.party.map((p) => p.minionId)));
        } else if (minionR.ok) {
          const cap = Math.max(1, (state.dungeon ?? dungeon)?.maxPartySize ?? 1);
          setPartyIds(resolveSavedPartyIds(readSavedPartyIds(PARTY_KEY), roster, cap));
        }
      } else if (list.ok) {
        const next = resolveDungeonFromList(list.dungeons, dungeon?.id);
        setDungeon(next);
      }
      try {
        const me = await getJson<{ ok: boolean; inventory: Array<{ itemId: string; name: string }> }>(
          "/api/me/state",
        );
        if (me.ok) setItemNames(new Map(me.inventory.map((x) => [x.itemId, x.name])));
      } catch {
        /* ignore */
      }
    } catch (e) {
      if (!isUnauthorizedError(e)) setError(e);
    }
  }

  function finishBattlePlayback() {
    setPlayingLog(false);
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
    const adv = pendingAdvanceResultRef.current;
    pendingAdvanceResultRef.current = null;
    if (adv && (adv.result === "LOSS" || adv.result === "WIN_AND_CASHOUT")) {
      showSettlementAfterAdvance(adv);
      return;
    }
    if (adv?.result === "WIN") {
      const mult = adv.lootMultiplier ?? 1;
      const gold = adv.goldGained ?? 0;
      if (mult > 1 || gold > 0) {
        setLastFloorBonus(`층 클리어 · 드랍 ×${mult}${gold > 0 ? ` · +${gold.toLocaleString()} G` : ""}`);
      }
    }
    void refresh();
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
    if (!lines.length || !replay) {
      finishBattlePlayback();
      return;
    }
    setCombatIsBoss(!!boss);
    setBattleReplay(replay);
    setBattleLines(lines);
    setPlayingLog(true);
  }

  useEffect(() => {
    if (sessionLoading) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionLoading]);

  useEffect(() => {
    if (!embedded) return;
    const onFrameRefresh = () => void refresh();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);

  useEffect(() => {
    if (sessionLoading || !user || playingLog) return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, playingLog]);

  useEffect(() => {
    if (run?.active) return;
    if (!minions.length) return;
    setPartyIds((prev) => {
      const trimmed = resolveSavedPartyIds([...prev], minions, maxParty);
      if (trimmed.size > 0) return trimmed;
      return resolveSavedPartyIds(readSavedPartyIds(PARTY_KEY), minions, maxParty);
    });
  }, [minions, maxParty, run?.active]);

  useEscapeClose(partyOpen, () => setPartyOpen(false));
  useEscapeClose(!!settlement, dismissSettlement);
  useEscapeClose(pendingLootSummaryOpen, () => setPendingLootSummaryOpen(false));
  useEscapeClose(potionModalOpen, () => setPotionModalOpen(false));

  async function openParty() {
    setPartyOpen(true);
    setPartyBusy(true);
    try {
      const r = await getJson<{ ok: boolean; minions: DungeonMinionRow[] }>("/api/minions/list");
      if (r.ok) setMinions(r.minions ?? []);
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

  async function advance() {
    setBusy("advance");
    setError(null);
    try {
      const r = await postJson<AdvanceResult>("/api/dungeons/run/advance", {});
      pendingPartyHpRef.current = r.partyHp ?? null;
      pendingAdvanceResultRef.current = r;
      setPlaybackClearChance(r.clearChance ?? null);
      mergeSessionXp(r.minionXpGrants);
      const replay = r.combatReplay ?? fallbackCombatReplay(r.combatLog ?? []);
      startBattlePlayback(r.combatLog ?? [], replay, r.isBoss);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`dungeon-shell ${embedded ? "dungeon-shell--fit panel-fit" : ""}`}>
      <div className={`dungeon-hero ${embedded ? "dungeon-hero--compact" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          {!embedded ? (
            <div>
              <p className="game-label">던전</p>
              <h2 className="game-title mt-1 text-lg">{dungeon?.name ?? "슬라임의 숲"}</h2>
              <p className="mt-1 text-xs text-[var(--game-muted)]">층마다 실시간 전투 · 패배 시 보상 소멸</p>
              {dungeon?.stage ? (
                <p className="mt-1 text-[11px] font-semibold text-[var(--game-gold-bright)]">
                  권장 {dungeon.stage.recommendedLevelLabel}
                  <span className="ml-2 font-normal text-[var(--game-muted)]">
                    · 올클 {dungeon.stage.fullClearXp.toLocaleString()} EXP
                  </span>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0">
              <h2 className="game-title text-sm">{dungeon?.name ?? "슬라임의 숲"}</h2>
              {dungeon?.stage ? (
                <p className="mt-0.5 text-[10px] text-[var(--game-muted)]">
                  스테이지 {dungeon.stage.stageOrder} · 권장 {dungeon.stage.recommendedLevelLabel}
                </p>
              ) : null}
            </div>
          )}
          <span className={`dungeon-status-pill ${run?.active ? "dungeon-status-pill--live" : ""}`.trim()}>
            {run?.active ? "● 탐험 중" : "○ 대기"}
          </span>
        </div>
        <div className="dungeon-floor-track">
          <div className="dungeon-floor-fill" style={{ width: `${run?.active ? floorPct : 0}%` }} />
        </div>
        <p className={`text-right text-[11px] font-semibold tabular-nums text-[var(--game-muted)] ${embedded ? "mt-1" : "mt-2"}`}>
          {run?.active ? `${floor} / ${maxFloors}층` : `최대 ${maxFloors}층`}
        </p>
        {run?.active ? (
          <p className="text-right text-[10px] text-[var(--game-muted)]">
            이번 층 드랍 ×{pushLuckLootMultiplier(floor)}
            {selectedStageOrder > 0
              ? ` · 클리어 +${pushLuckFloorGoldReward(floor, selectedStageOrder).toLocaleString()} G`
              : null}
          </p>
        ) : null}
        {lastFloorBonus ? (
          <p className="text-right text-[11px] font-semibold text-[var(--game-gold-bright)]">{lastFloorBonus}</p>
        ) : null}
        {run?.active && run.combat?.clearChance != null && !playingLog ? (
          <PushLuckRiskBar
            className="mt-2"
            clearChance={run.combat.clearChance}
            floorLabel={`${floor} / ${maxFloors}층`}
          />
        ) : null}
        {!run?.active && stagePickerRows.length > 0 ? (
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
                        <span className="dungeon-stage-tab-btn__name">{row.name}</span>
                      </GameBtn>
                    </span>
                  );
                })}
              </div>
            </div>
            {selectedStageRow && selectedStageDungeon ? (
              <div className="dungeon-stage-picker__detail">
                <div className="dungeon-stage-picker__detail-name">{selectedStageRow.name}</div>
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
        ) : run?.active ? (
          <p className={`${embedded ? "mt-1.5 text-[10px]" : "mt-2 text-xs"} text-[var(--game-muted-dim)]`}>
            탐험 중에는 스테이지를 변경할 수 없습니다.
          </p>
        ) : null}
      </div>

      {error ? <GamePanelError error={error} /> : null}

      {!embedded && sessionLoading ? (
        <GamePanelLoading label="세션 확인 중…" />
      ) : !embedded && !user ? (
        <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
      ) : (embedded || user) ? (
      <div className={embedded ? "dungeon-body-fit" : "grid gap-4 lg:grid-cols-[16rem_1fr]"}>
        <div className={embedded ? "dungeon-sidebar-fit" : "flex flex-col gap-3"}>
          <GamePanel className={embedded ? "!p-2" : "!p-3"}>
            <GamePanelTitle>{embedded ? "전투·파티" : "전투"}</GamePanelTitle>
            {!embedded ? (
              <p className="mt-1 text-[10px] leading-snug text-[var(--game-muted)]">
                클리어 확률은 현재 층 전투를 여러 번 시뮬한 추정치입니다.
              </p>
            ) : null}
            <div className={`${embedded ? "mt-1.5" : "mt-2"} grid grid-cols-2 gap-1.5`}>
              <GameStat label="전투력" value={run?.combat?.partyPower ?? "—"} highlight />
              <GameStat
                label="클리어 확률"
                value={run?.combat ? `${Math.round(run.combat.clearChance * 100)}%` : "—"}
              />
              <GameStat label="승" value={run?.run?.wins ?? 0} />
              <GameStat label="패" value={run?.run?.losses ?? 0} />
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
                    {run?.active && partyRoster
                      ? `생존 ${partyAlive}/${partyRoster.length}`
                      : `파티 ${partyIds.size}/${maxParty}`}
                  </span>
                  {!run?.active || !partyRoster?.length
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
                {run?.active && partyRoster && partyRoster.length > 0 ? (
                  <DungeonPartyHpList
                    roster={partyRoster}
                    potions={recoveryPotions}
                    onUsePotion={(itemId, minionId) => void usePotion(itemId, minionId)}
                    busy={!!busy || playingLog}
                    compact
                  />
                ) : null}
                <GameBtn
                  variant="ghost"
                  className="mt-1.5 h-8 w-full text-[10px]"
                  disabled={!!busy}
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
            {run?.active && partyRoster && partyRoster.length > 0 ? (
              <DungeonPartyHpList
                roster={partyRoster}
                potions={recoveryPotions}
                onUsePotion={(itemId, minionId) => void usePotion(itemId, minionId)}
                busy={!!busy || playingLog}
              />
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
            <GameBtn variant="ghost" className="mt-2 h-9 w-full text-xs" disabled={!!busy} onClick={() => void openParty()}>
              파티 편성
            </GameBtn>
          </GamePanel>
          ) : null}

          <GamePanel className={embedded ? "!p-2" : "!p-3"}>
            <GamePanelTitle>{embedded ? "명령" : "명령"}</GamePanelTitle>
            <div className={`dungeon-action-grid ${embedded ? "mt-1.5" : "mt-2"}`}>
              <GameBtn
                variant="primary"
                className={embedded ? "h-8 text-xs" : "h-10 text-sm"}
                disabled={!!busy || !dungeon || partyIds.size === 0 || run?.active}
                onClick={async () => {
                  if (!dungeon) return;
                  setBusy("start");
                  setLogLines([]);
                  setLastFloorBonus(null);
                  try {
                    await postJson("/api/dungeons/run/start", {
                      dungeonId: dungeon.id,
                      minionIds: [...partyIds],
                    });
                    resetSessionXp();
                    await refresh();
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                탐험 시작
              </GameBtn>
              <GameBtn variant="gold" className={embedded ? "h-8 text-xs" : "h-10 text-sm"} disabled={!!busy || !run?.active || playingLog} onClick={() => void advance()}>
                {playingLog ? "전투 중…" : "다음 층"}
              </GameBtn>
              <GameBtn
                variant="ghost"
                className={embedded ? "h-8 text-xs" : "h-10 text-sm"}
                disabled={!!busy || !run?.active || playingLog}
                onClick={() => setCashoutConfirmOpen(true)}
              >
                정산
              </GameBtn>
              {run?.active && recoveryPotions.length > 0 ? (
                <>
                  <GameBtn
                    variant="ghost"
                    className={embedded ? "h-8 text-xs" : "h-10 text-sm"}
                    disabled={!!busy || playingLog || !canHealParty}
                    onClick={() => void healLowestHp()}
                  >
                    최저 HP 회복
                  </GameBtn>
                  <GameBtn
                    variant="ghost"
                    className={embedded ? "h-8 text-xs" : "h-10 text-sm"}
                    disabled={!!busy || playingLog}
                    onClick={() => setPotionModalOpen(true)}
                  >
                    물약
                  </GameBtn>
                </>
              ) : null}
              {run?.active ? (
                <GameBtn
                  variant="ghost"
                  className={`dungeon-action-span ${embedded ? "h-8 text-xs" : "h-9 text-xs"}`}
                  disabled={!!busy}
                  onClick={() => setPendingLootSummaryOpen(true)}
                >
                  정산 시 수령
                  {cashoutLoot.length > 0 ? ` · ${cashoutLoot.length}종` : ""}
                </GameBtn>
              ) : null}
            </div>
          </GamePanel>
        </div>

        <CombatEncounterBlock
          embedded={embedded}
          playing={playingLog}
          replay={battleReplay}
          lines={battleLines}
          isBoss={combatIsBoss}
          encounterLabel={combatIsBoss ? "보스전" : undefined}
          clearChance={playbackClearChance ?? run?.combat?.clearChance ?? null}
          floorLabel={`${battleReplay?.floor ?? floor}층`}
          onFrame={setBattleFrame}
          onComplete={finishBattlePlayback}
        />
        {logLines.length > 0 && !playingLog ? (
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
        busy={!!busy || playingLog}
        onClose={() => setPotionModalOpen(false)}
        onUsePotion={(itemId, minionId) => void usePotion(itemId, minionId)}
      />

      <PendingLootSummaryModal
        open={pendingLootSummaryOpen}
        loot={cashoutLoot}
        onClose={() => setPendingLootSummaryOpen(false)}
      />

      <DungeonCashoutConfirmModal
        open={cashoutConfirmOpen}
        loot={cashoutLoot}
        onCancel={() => setCashoutConfirmOpen(false)}
        onConfirm={() => void executeCashout()}
        onForfeit={cashoutLoot.length > 0 ? () => void executeForfeit() : undefined}
      />

      <DungeonRunSettlementModal
        open={settlement != null}
        settlement={settlement}
        onConfirm={dismissSettlement}
      />
    </div>
  );
}
