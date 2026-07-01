"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { EnhanceItemBurst, type EnhanceBurstVariant } from "@/app/_components/EnhanceItemBurst";
import { ForgeBenchTopbar } from "@/app/_components/ForgeBenchTopbar";
import { ForgeManaStonePicker } from "@/app/_components/ForgeManaStonePicker";
import { ForgeEquipGrid } from "@/app/_components/ForgeEquipGrid";
import { ForgeEquipPicker } from "@/app/_components/ForgeEquipPicker";
import { ForgeEquippedByTag } from "@/app/_components/ForgeEquippedByTag";
import { ForgeMaterialGrid, type ForgeMaterialCell } from "@/app/_components/ForgeMaterialGrid";
import { EquipmentBlessingOptionRows } from "@/app/_components/EquipmentBlessingOptionRows";
import { ForgeToolPicker, renderForgeOptionChips, type ForgeEquipTarget } from "@/app/_components/ForgeToolPicker";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { itemGradeFrameClassName, itemGradeNameClassName } from "@/server/itemGrade";
import { weaponEnhanceMaxLevelForGrade } from "@/shared/weaponEnhanceLimits";
import {
  eligibleManaStonesForRequirement,
  enhanceManaStoneLabel,
  type EnhanceManaStoneItemId,
  manaStoneRequirementFromCost,
  resolveWeaponUpgradeDeductions,
  weaponUpgradeCostForNextLevel,
} from "@/server/weaponUpgradeRules";
import { armorDisplayName } from "@/shared/armorTooltip";
import { weaponDisplayName, type WeaponTooltipOption } from "@/shared/weaponTooltip";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { notifyTutorialRefresh } from "@/app/_components/TutorialPanel";
import { loadMeEquipmentState } from "@/shared/meEquipmentState";
import { formatPanelError } from "@/shared/formatPanelError";
import { apiGetJsonCached, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
import { notifyGameFramePatch } from "@/shared/gameFramePatch";
import { selectGoldAvailable, useWalletStore } from "@/shared/stores/walletStore";
import { usePlayerEquipmentStore } from "@/shared/stores/playerEquipmentStore";
import { useGameDataPatch } from "@/shared/useGameDataPatch";
import type { EquippedByMinionView } from "@/shared/equipmentEquippedBy";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";
import {
  ITEM_ENHANCE_SCROLL_PROTECT,
  ITEM_GEM_BLESSING,
  forgeEnhanceMaterialLabel,
} from "@/shared/enhanceConsumables";
import { optionConsumableKind, ITEM_APPRAISAL_SCROLL } from "@/shared/optionConsumables";
import {
  equipmentCraftConsumableKind,
  itemLevelTierForCraftKind,
} from "@/shared/equipmentCraftConsumables";
import { itemLevelsForTier } from "@/shared/equipmentItemLevel";
import { MAX_QUALITY_CRAFT_USES } from "@/shared/equipmentQuality";
import { getArmorStats } from "@/shared/armorStatsData";
import {
  guaranteedSalvageLootBatch,
  MAX_SALVAGE_BATCH,
  salvageBonusHintLines,
} from "@/shared/equipmentSalvage";
import {
  FORGE_ENHANCE_MATERIAL_IDS,
  forgeToolsForMode,
  type ForgeWorkbenchMode,
} from "@/shared/forgeWorkbench";
import { equipmentBaseStatsView } from "@/shared/equipmentItemBaseStats";
import { MINION_STAT_KEYS, MINION_STAT_LABELS } from "@/shared/minionBaseStats";
import { consumeForgeOpenRequest, FORGE_OPEN_EVENT } from "@/shared/forgeNav";
import { useIsMobile } from "@/shared/useIsMobile";

type EquipOptionRow = WeaponTooltipOption;

function CraftEquipBaseStats(props: { baseItemId: string; equipKind: "weapon" | "armor" }) {
  const bases = equipmentBaseStatsView(props.baseItemId, props.equipKind);
  if (!bases) return null;

  const rows: Array<{ label: string; value: number }> = [];
  if ((bases.atk ?? 0) > 0) rows.push({ label: "물리 ATK", value: bases.atk! });
  if ((bases.magic ?? 0) > 0) rows.push({ label: "마법 ATK", value: bases.magic! });
  if ((bases.hp ?? 0) > 0) rows.push({ label: "HP", value: bases.hp! });
  if ((bases.def ?? 0) > 0) rows.push({ label: "DEF", value: bases.def! });
  for (const key of MINION_STAT_KEYS) {
    const v = bases[key];
    if (v != null && v > 0) rows.push({ label: MINION_STAT_LABELS[key], value: v });
  }
  if (rows.length === 0) return null;

  return (
    <div className="forge-hub__craft-base-stats">
      <p className="game-label">기본 스탯</p>
      {rows.map((row) => (
        <div key={row.label} className="item-tooltip__stat-row">
          <span>{row.label}</span>
          <span className="item-tooltip__stat-val">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

type MeState = {
  ok: true;
  wallet: { goldAvailable: number; goldLocked: number };
  inventory: Array<{
    itemId: string;
    name: string;
    quantity: number;
    lockedQuantity?: number;
    availableQuantity?: number;
    icon?: string | null;
    iconSrc?: string | null;
  }>;
  weaponInstances?: WeaponRow[];
  armorInstances?: ArmorRow[];
};

type WeaponRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  quality?: number;
  qualityCraftCount?: number;
  itemLevel?: number;
  createdAt: string;
  grade?: number;
  gradeLabel?: string;
  identified?: boolean;
  options?: EquipOptionRow[];
  equippedByMinion?: EquippedByMinionView | null;
};

type ArmorRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  quality?: number;
  qualityCraftCount?: number;
  itemLevel?: number;
  createdAt: string;
  grade?: number;
  gradeLabel?: string;
  identified?: boolean;
  options?: EquipOptionRow[];
  equippedByMinion?: EquippedByMinionView | null;
};

type WeaponSortId =
  | "newest"
  | "oldest"
  | "name_az"
  | "grade_high"
  | "grade_low"
  | "enh_high"
  | "enh_low";
type ArmorSortId = WeaponSortId;
type EquipKind = "weapon" | "armor";

async function loadEnhanceMeState(force?: boolean): Promise<MeState> {
  const bundle = await loadMeEquipmentState({ force, swr: !force });
  const weapons = bundle.weapons as { ok: true; weaponInstances?: WeaponRow[] };
  const armor = bundle.armor as { ok: true; armorInstances?: ArmorRow[] };
  return {
    ...(bundle.inventory as MeState),
    weaponInstances: weapons.weaponInstances,
    armorInstances: armor.armorInstances,
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiPostJson<T>(url, body);
}

function fmtInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return Math.round(x).toLocaleString();
}

function compareLocaleKo(a: string, b: string) {
  return a.localeCompare(b, "ko", { sensitivity: "base" });
}

function mergeLootIntoInventory(
  inventory: MeState["inventory"],
  loot: Array<{ itemId: string; qty: number }>,
  nameById: Map<string, string>,
): MeState["inventory"] {
  const map = new Map(inventory.map((row) => [row.itemId, { ...row }]));
  for (const drop of loot) {
    if (drop.qty <= 0) continue;
    const prev = map.get(drop.itemId);
    if (prev) {
      map.set(drop.itemId, { ...prev, quantity: prev.quantity + drop.qty });
    } else {
      map.set(drop.itemId, {
        itemId: drop.itemId,
        name: nameById.get(drop.itemId) ?? drop.itemId,
        quantity: drop.qty,
      });
    }
  }
  return [...map.values()];
}

function applySalvageToMeState(
  prev: MeState,
  input: {
    kind: EquipKind;
    salvagedIds: Set<string>;
    loot: Array<{ itemId: string; qty: number }>;
    nameById: Map<string, string>;
  },
): MeState {
  const next: MeState = {
    ...prev,
    inventory: mergeLootIntoInventory(prev.inventory, input.loot, input.nameById),
  };
  if (input.kind === "weapon") {
    next.weaponInstances = (prev.weaponInstances ?? []).filter((w) => !input.salvagedIds.has(w.id));
  } else {
    next.armorInstances = (prev.armorInstances ?? []).filter((a) => !input.salvagedIds.has(a.id));
  }
  return next;
}

function sortWeapons(rows: WeaponRow[], by: WeaponSortId): WeaponRow[] {
  const out = rows.slice();
  const tie = (a: WeaponRow, b: WeaponRow) => compareLocaleKo(a.id, b.id);
  const byTime = (a: WeaponRow, b: WeaponRow) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  switch (by) {
    case "oldest":
      out.sort((a, b) => byTime(a, b) || tie(a, b));
      break;
    case "name_az":
      out.sort((a, b) => compareLocaleKo(a.name, b.name) || tie(a, b));
      break;
    case "grade_high":
      out.sort(
        (a, b) =>
          (b.grade ?? 1) - (a.grade ?? 1) ||
          (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0) ||
          byTime(b, a) ||
          tie(a, b),
      );
      break;
    case "grade_low":
      out.sort(
        (a, b) =>
          (a.grade ?? 1) - (b.grade ?? 1) ||
          (a.enhanceLevel ?? 0) - (b.enhanceLevel ?? 0) ||
          byTime(a, b) ||
          tie(a, b),
      );
      break;
    case "enh_high":
      out.sort((a, b) => (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0) || byTime(b, a));
      break;
    case "enh_low":
      out.sort((a, b) => (a.enhanceLevel ?? 0) - (b.enhanceLevel ?? 0) || byTime(b, a));
      break;
    default:
      out.sort((a, b) => byTime(b, a) || tie(a, b));
  }
  return out;
}

function sortArmor(rows: ArmorRow[], by: ArmorSortId): ArmorRow[] {
  const out = rows.slice();
  const tie = (a: ArmorRow, b: ArmorRow) => compareLocaleKo(a.id, b.id);
  const byTime = (a: ArmorRow, b: ArmorRow) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  switch (by) {
    case "oldest":
      out.sort((a, b) => byTime(a, b) || tie(a, b));
      break;
    case "name_az":
      out.sort((a, b) => compareLocaleKo(a.name, b.name) || tie(a, b));
      break;
    case "grade_high":
      out.sort(
        (a, b) =>
          (b.grade ?? 1) - (a.grade ?? 1) ||
          (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0) ||
          byTime(b, a) ||
          tie(a, b),
      );
      break;
    case "grade_low":
      out.sort(
        (a, b) =>
          (a.grade ?? 1) - (b.grade ?? 1) ||
          (a.enhanceLevel ?? 0) - (b.enhanceLevel ?? 0) ||
          byTime(a, b) ||
          tie(a, b),
      );
      break;
    case "enh_high":
      out.sort((a, b) => (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0) || byTime(b, a));
      break;
    case "enh_low":
      out.sort((a, b) => (a.enhanceLevel ?? 0) - (b.enhanceLevel ?? 0) || byTime(b, a));
      break;
    default:
      out.sort((a, b) => byTime(b, a) || tie(a, b));
  }
  return out;
}

function friendlyForgeError(e: unknown, itemNameById: Map<string, string>): string {
  if (e instanceof Error && e.message && !("error" in e)) {
    const mapped = formatPanelError(e);
    if (mapped && mapped !== e.message) return mapped;
    if (mapped) return mapped;
  }
  const err = typeof e === "object" && e !== null && "error" in e ? String((e as { error: unknown }).error) : "";
  if (err === "INSUFFICIENT_GOLD") return "골드가 부족해.";
  if (err === "MAX_WEAPON_LEVEL") return "이 등급 장비의 최대 강화 단계에 도달했어.";
  if (err === "ARMOR_INSTANCE_NOT_FOUND" || err === "WEAPON_INSTANCE_NOT_FOUND")
    return "장비를 찾을 수 없어.";
  if (err === "WEAPON_LOCKED" || err === "EQUIPMENT_LOCKED") return "거래소 등록 중인 장비는 작업할 수 없어.";
  if (err === "ITEM_USER_LOCKED") return "잠긴 장비는 작업할 수 없어. 인벤에서 잠금을 해제해.";
  if (err === "ITEM_LOCKED") return "잠긴 재료는 사용할 수 없어. 인벤에서 잠금을 해제해.";
  if (err === "EQUIPMENT_EQUIPPED") return "미니언이 착용 중인 장비는 분해할 수 없어. 먼저 해제하세요.";
  if (err === "MAX_EQUIPMENT_OWNED") {
    return "무기·방어구 보유 한도(100개)에 도달했어요. 분해하거나 판매한 뒤 다시 시도해 주세요.";
  }
  if (err === "SALVAGE_BATCH_TOO_LARGE") {
    return `한 번에 분해할 수 있는 장비는 최대 ${MAX_SALVAGE_BATCH}개까지예요.`;
  }
  if (err === "NOT_OPTION_CONSUMABLE") return "장비 가공 도구만 사용할 수 있어.";
  if (err === "NO_CONSUMABLE") return "도구가 부족해.";
  if (err === "NOT_FOUND") return "대상 장비를 찾을 수 없어.";
  if (err === "ALREADY_IDENTIFIED") return "이미 감정된 장비예요.";
  if (err === "NEEDS_APPRAISAL") return "감정 주문서로 먼저 감정해야 해요.";
  if (err === "NO_OPTIONS") return "적용할 옵션이 없어요.";
  if (err === "NO_REALM_OPTION_POOL") return "이 등급 장비에는 적용할 수 있는 계열 옵션이 없어요.";
  if (err === "NO_REMOVABLE_OPTION") return "제거할 수 있는 옵션이 없어요. (봉인 슬롯만 있거나 옵션이 없음)";
  if (err === "SEAL_LIMIT_OR_NO_SLOT") return "봉인할 옵션 슬롯이 없거나 이미 봉인이 있어요.";
  if (err === "NOTHING_TO_APPRAISE") return "감정할 미감정 장비가 없어요.";
  if (err === "INSUFFICIENT_SCROLLS") return "감정 주문서가 부족해요. 미감정 장비 수만큼 필요합니다.";
  if (err === "MANA_STONE_NOT_SELECTED") return "사용할 마석을 선택해 주세요.";
  if (err === "INVALID_MANA_STONE_CHOICE") return "선택한 마석으로는 강화할 수 없어요.";
  if (err.startsWith("INSUFFICIENT_MATERIAL:")) {
    const id = err.slice("INSUFFICIENT_MATERIAL:".length);
    return `재료 부족: ${itemNameById.get(id) ?? id}`;
  }
  if (err === "UNAUTHORIZED") return "로그인이 필요해. 화면 오른쪽 위에서 로그인해 주세요.";
  if (err) return err;
  if (typeof e === "string") return e;
  return formatPanelError(e);
}

function nextUpgradeInfo(enhanceLevel: number, grade: number, itemNameById: Map<string, string>) {
  const cur = Math.max(0, Math.floor(enhanceLevel));
  const max = weaponEnhanceMaxLevelForGrade(grade);
  if (cur >= max) return { atMax: true as const, cost: null, label: `최대 +${max} 달성` };
  try {
    const cost = weaponUpgradeCostForNextLevel(cur);
    return { atMax: false as const, cost, label: `+${cur + 1} 강화` };
  } catch {
    return { atMax: false as const, cost: null, label: `+${cur + 1} 강화` };
  }
}

type UpgradeApiOk = {
  ok: true;
  weaponInstanceId?: string;
  armorInstanceId?: string;
  success: boolean;
  from: number;
  to: number;
  successRate: number;
  usedProtectionScroll?: boolean;
  protectedOnFail?: boolean;
  tutorialAdvanced?: boolean;
};

type EnhanceMotionState = {
  kind: EquipKind;
  instanceId: string;
  baseItemId: string;
  fromLevel: number;
  toLevel: number;
  variant: EnhanceBurstVariant;
};

function validateEnhanceAfford(input: {
  enhanceLevel: number;
  grade: number;
  goldAvailable: number;
  materialQty: (itemId: string) => number;
  itemNames: Map<string, string>;
  manaStoneItemId?: EnhanceManaStoneItemId | null;
}): string | null {
  const cur = Math.max(0, Math.floor(input.enhanceLevel));
  const max = weaponEnhanceMaxLevelForGrade(input.grade);
  if (cur >= max) return "이 등급 장비의 최대 강화 단계에 도달했어.";

  let cost;
  try {
    cost = weaponUpgradeCostForNextLevel(cur);
  } catch {
    return "이 등급 무기의 최대 강화 단계에 도달했어.";
  }

  if (input.goldAvailable < cost.gold) return "골드가 부족해.";

  const manaReq = manaStoneRequirementFromCost(cost.materials);
  if (manaReq) {
    if (!input.manaStoneItemId) return "사용할 마석을 선택해 주세요.";
    const eligible = eligibleManaStonesForRequirement(
      manaReq.itemId,
      manaReq.quantity,
      input.materialQty,
    );
    if (!eligible.includes(input.manaStoneItemId)) {
      return `재료 부족: ${input.itemNames.get(input.manaStoneItemId) ?? input.manaStoneItemId}`;
    }
  }

  const deductions = resolveWeaponUpgradeDeductions(cost.materials, input.materialQty, {
    manaStoneItemId: input.manaStoneItemId,
  });
  if (!deductions) {
    const missing = cost.materials.find((m) => input.materialQty(m.itemId) < m.quantity);
    if (missing) return `재료 부족: ${input.itemNames.get(missing.itemId) ?? missing.itemId}`;
  }
  return null;
}

export function WeaponEnhancePanel({ embedded = false }: EmbeddedPanelProps = {}) {
  const { user, loading: sessionLoading } = useSessionUser();
  const isMobile = useIsMobile();
  const goldAvailable = useWalletStore(selectGoldAvailable);
  const [me, setMe] = useState<MeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgeMode, setForgeMode] = useState<ForgeWorkbenchMode>("enhance");
  const [benchOpen, setBenchOpen] = useState(false);
  const [enhanceKind, setEnhanceKind] = useState<EquipKind>("weapon");
  const [enhanceTargetId, setEnhanceTargetId] = useState<string | null>(null);
  const [craftKind, setCraftKind] = useState<EquipKind>("weapon");
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [enhanceMotion, setEnhanceMotion] = useState<EnhanceMotionState | null>(null);
  const [enhanceOutcome, setEnhanceOutcome] = useState<{
    variant: EnhanceBurstVariant;
    from: number;
    to: number;
    protectedOnFail?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [craftQ, setCraftQ] = useState("");
  const [sort, setSort] = useState<WeaponSortId>("enh_high");
  const [armorSort, setArmorSort] = useState<ArmorSortId>("newest");
  const [armorSortEnhance, setArmorSortEnhance] = useState<ArmorSortId>("enh_high");
  const [craftTarget, setCraftTarget] = useState<ForgeEquipTarget | null>(null);
  const [craftTransferTarget, setCraftTransferTarget] = useState<ForgeEquipTarget | null>(null);
  const [chosenItemLevel, setChosenItemLevel] = useState<number>(10);
  const [useProtectionScroll, setUseProtectionScroll] = useState(false);
  const [useBlessingGem, setUseBlessingGem] = useState(false);
  const [selectedManaStoneId, setSelectedManaStoneId] = useState<EnhanceManaStoneItemId | null>(null);
  const [salvageKind, setSalvageKind] = useState<EquipKind>("weapon");
  const [salvageSelectedIds, setSalvageSelectedIds] = useState<Set<string>>(() => new Set());
  const pendingEnhanceRef = useRef<EnhanceMotionState | null>(null);
  const enhanceRunInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!user) {
      setMe(null);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await loadEnhanceMeState();
      setMe(r);
      if (r.wallet) {
        useWalletStore.getState().setWallet({
          goldAvailable: r.wallet.goldAvailable,
          goldLocked: r.wallet.goldLocked,
        });
      }
      usePlayerEquipmentStore.getState().setEquipment({
        inventory: r.inventory,
        weaponInstances: r.weaponInstances,
        armorInstances: r.armorInstances,
      });
    } catch (e) {
      setMe(null);
      if (!isUnauthorizedError(e)) setError(formatPanelError(e));
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    if (sessionLoading) return;
    void load();
  }, [load, sessionLoading]);

  useGameDataPatch(["enhance", "weapons", "armor", "inventory", "wallet"], useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    setSelectedToolId(null);
    setCraftTransferTarget(null);
  }, [forgeMode, craftKind, enhanceKind, salvageKind]);

  useEffect(() => {
    setCraftTransferTarget(null);
    const craftKind = selectedToolId ? equipmentCraftConsumableKind(selectedToolId) : null;
    if (craftKind && craftKind !== "quality_up") {
      const tier = itemLevelTierForCraftKind(craftKind);
      if (tier) {
        const levels = itemLevelsForTier(tier);
        setChosenItemLevel(levels[0] ?? 10);
      }
    }
  }, [selectedToolId, craftTarget?.id]);

  const resetBenchState = useCallback(() => {
    setBenchOpen(false);
    setEnhanceTargetId(null);
    setCraftTarget(null);
    setCraftTransferTarget(null);
    setEnhanceOutcome(null);
    setEnhanceMotion(null);
    setUseProtectionScroll(false);
    setUseBlessingGem(false);
    setSelectedManaStoneId(null);
  }, []);

  const equipInstanceExists = useCallback(
    (kind: EquipKind, id: string) => {
      const list = kind === "weapon" ? me?.weaponInstances : me?.armorInstances;
      return (list ?? []).some((x) => x.id === id);
    },
    [me],
  );

  const transferSelectionToMode = useCallback(
    (targetMode: "enhance" | "craft", selection: { kind: EquipKind; id: string }) => {
      if (!equipInstanceExists(selection.kind, selection.id)) {
        resetBenchState();
        setForgeMode(targetMode);
        return;
      }

      setEnhanceOutcome(null);
      setEnhanceMotion(null);
      setUseProtectionScroll(false);
      setSelectedManaStoneId(null);

      if (targetMode === "craft") {
        setCraftKind(selection.kind);
        setCraftTarget({ kind: selection.kind, id: selection.id });
        setSelectedToolId(null);
      } else {
        setEnhanceKind(selection.kind);
        setEnhanceTargetId(selection.id);
      }

      setForgeMode(targetMode);
      setBenchOpen(true);
    },
    [equipInstanceExists, resetBenchState],
  );

  const switchForgeMode = useCallback(
    (next: ForgeWorkbenchMode) => {
      if (next === forgeMode) return;

      if (next === "salvage" || forgeMode === "salvage") {
        resetBenchState();
        setForgeMode(next);
        return;
      }

      const selection =
        forgeMode === "enhance" && enhanceTargetId
          ? { kind: enhanceKind, id: enhanceTargetId }
          : forgeMode === "craft" && craftTarget
            ? { kind: craftTarget.kind, id: craftTarget.id }
            : null;

      if (selection) {
        transferSelectionToMode(next, selection);
      } else {
        resetBenchState();
        setForgeMode(next);
      }
    },
    [
      forgeMode,
      enhanceKind,
      enhanceTargetId,
      craftTarget,
      resetBenchState,
      transferSelectionToMode,
    ],
  );

  const closeBench = useCallback(() => {
    setBenchOpen(false);
    setEnhanceOutcome(null);
    setEnhanceMotion(null);
    setUseProtectionScroll(false);
    setSelectedManaStoneId(null);
  }, []);

  const openEnhanceBench = useCallback((id: string) => {
    setEnhanceTargetId(id);
    setEnhanceOutcome(null);
    setEnhanceMotion(null);
    setUseProtectionScroll(false);
    setSelectedManaStoneId(null);
    setBenchOpen(true);
  }, []);

  const openCraftBench = useCallback((id: string) => {
    setCraftTarget({ kind: craftKind, id });
    setSelectedToolId(null);
    setBenchOpen(true);
  }, [craftKind]);

  const applyForgeOpenRequest = useCallback(() => {
    const req = consumeForgeOpenRequest();
    if (!req) return;

    const mode = req.mode ?? "enhance";
    if (mode === "craft") {
      setForgeMode("craft");
      setCraftKind(req.kind);
      setCraftTarget({ kind: req.kind, id: req.instanceId });
      setSelectedToolId(null);
      setBenchOpen(true);
      return;
    }
    setForgeMode("enhance");
    setEnhanceKind(req.kind);
    setEnhanceTargetId(req.instanceId);
    setEnhanceOutcome(null);
    setEnhanceMotion(null);
    setUseProtectionScroll(false);
    setBenchOpen(true);
  }, []);

  useEffect(() => {
    if (!me) return;
    applyForgeOpenRequest();
    const onForgeOpen = () => applyForgeOpenRequest();
    window.addEventListener(FORGE_OPEN_EVENT, onForgeOpen);
    return () => window.removeEventListener(FORGE_OPEN_EVENT, onForgeOpen);
  }, [me, applyForgeOpenRequest]);

  const nameById = useMemo(() => new Map((me?.inventory ?? []).map((x) => [x.itemId, x.name])), [me]);

  const stackQty = useCallback(
    (itemId: string) => {
      const row = me?.inventory?.find((x) => x.itemId === itemId);
      if (!row) return 0;
      return row.availableQuantity ?? row.quantity - (row.lockedQuantity ?? 0);
    },
    [me],
  );

  useEffect(() => {
    if (!useProtectionScroll) return;
    if (stackQty(ITEM_ENHANCE_SCROLL_PROTECT) < 1) setUseProtectionScroll(false);
  }, [me, useProtectionScroll, stackQty]);

  const weapons = useMemo(() => {
    const rows = (me?.weaponInstances ?? []) as WeaponRow[];
    const qq = q.trim().toLowerCase();
    const filtered = rows.filter((w) => {
      if (!qq) return true;
      return w.name.toLowerCase().includes(qq) || w.id.toLowerCase().includes(qq) || w.baseItemId.toLowerCase().includes(qq);
    });
    return sortWeapons(filtered, sort);
  }, [me, q, sort]);

  const craftWeapons = useMemo(() => {
    const rows = (me?.weaponInstances ?? []) as WeaponRow[];
    const qq = craftQ.trim().toLowerCase();
    const filtered = rows.filter((w) => {
      if (!qq) return true;
      return w.name.toLowerCase().includes(qq) || w.id.toLowerCase().includes(qq) || w.baseItemId.toLowerCase().includes(qq);
    });
    return sortWeapons(filtered, "newest");
  }, [me, craftQ]);

  const armors = useMemo(() => {
    const rows = (me?.armorInstances ?? []) as ArmorRow[];
    const qq = craftQ.trim().toLowerCase();
    const filtered = rows.filter((a) => {
      if (!qq) return true;
      return a.name.toLowerCase().includes(qq) || a.id.toLowerCase().includes(qq) || a.baseItemId.toLowerCase().includes(qq);
    });
    return sortArmor(filtered, armorSort);
  }, [me, craftQ, armorSort]);

  const enhanceArmors = useMemo(() => {
    const rows = (me?.armorInstances ?? []) as ArmorRow[];
    const qq = q.trim().toLowerCase();
    const filtered = rows.filter((a) => {
      if (!qq) return true;
      return a.name.toLowerCase().includes(qq) || a.id.toLowerCase().includes(qq) || a.baseItemId.toLowerCase().includes(qq);
    });
    return sortArmor(filtered, armorSortEnhance);
  }, [me, q, armorSortEnhance]);

  const enhanceList = enhanceKind === "weapon" ? weapons : enhanceArmors;

  const salvageWeapons = useMemo(() => {
    const rows = (me?.weaponInstances ?? []) as WeaponRow[];
    const qq = q.trim().toLowerCase();
    return sortWeapons(
      rows.filter((w) => {
        if (!qq) return true;
        return w.name.toLowerCase().includes(qq) || w.id.toLowerCase().includes(qq) || w.baseItemId.toLowerCase().includes(qq);
      }),
      "newest",
    );
  }, [me, q]);

  const salvageArmors = useMemo(() => {
    const rows = (me?.armorInstances ?? []) as ArmorRow[];
    const qq = q.trim().toLowerCase();
    return sortArmor(
      rows.filter((a) => {
        if (!qq) return true;
        return a.name.toLowerCase().includes(qq) || a.id.toLowerCase().includes(qq) || a.baseItemId.toLowerCase().includes(qq);
      }),
      "newest",
    );
  }, [me, q]);

  const salvageList = salvageKind === "weapon" ? salvageWeapons : salvageArmors;

  useEffect(() => {
    if (forgeMode !== "enhance" || !benchOpen) return;
    if (!enhanceTargetId || !enhanceList.some((x) => x.id === enhanceTargetId)) {
      closeBench();
    }
  }, [enhanceList, enhanceTargetId, forgeMode, benchOpen, closeBench]);

  useEffect(() => {
    if (forgeMode !== "salvage") return;
    setSalvageSelectedIds((prev) => {
      const valid = new Set(salvageList.map((x) => x.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      return next;
    });
  }, [forgeMode, salvageList, salvageKind]);

  const toggleSalvageSelect = useCallback((id: string) => {
    setSalvageSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (forgeMode !== "craft" || !benchOpen) return;
    const list = craftKind === "weapon" ? craftWeapons : armors;
    if (
      !craftTarget ||
      craftTarget.kind !== craftKind ||
      !list.some((x) => x.id === craftTarget.id)
    ) {
      closeBench();
    }
  }, [forgeMode, craftKind, craftWeapons, armors, craftTarget, benchOpen, closeBench]);

  const selectedWeapon = useMemo(
    () => (enhanceKind === "weapon" ? weapons.find((w) => w.id === enhanceTargetId) ?? null : null),
    [weapons, enhanceTargetId, enhanceKind],
  );
  const selectedArmor = useMemo(
    () => (enhanceKind === "armor" ? enhanceArmors.find((a) => a.id === enhanceTargetId) ?? null : null),
    [enhanceArmors, enhanceTargetId, enhanceKind],
  );
  const selectedEnhance = selectedWeapon ?? selectedArmor;

  const salvageSelectedItems = useMemo(() => {
    const list = salvageKind === "weapon" ? salvageWeapons : salvageArmors;
    return list.filter((x) => salvageSelectedIds.has(x.id));
  }, [salvageKind, salvageWeapons, salvageArmors, salvageSelectedIds]);

  const salvagePreview = useMemo(() => {
    if (salvageSelectedItems.length === 0) return [];
    return guaranteedSalvageLootBatch(
      salvageSelectedItems.map((it) => ({
        grade: it.grade ?? 1,
        enhanceLevel: it.enhanceLevel ?? 0,
      })),
    );
  }, [salvageSelectedItems]);

  const salvageBonusHints = useMemo(() => {
    if (salvageSelectedItems.length === 0) return [];
    const maxGrade = Math.max(...salvageSelectedItems.map((it) => it.grade ?? 1));
    return salvageBonusHintLines(maxGrade);
  }, [salvageSelectedItems]);

  const craftSelectedWeapon = useMemo(
    () => (craftTarget?.kind === "weapon" ? craftWeapons.find((w) => w.id === craftTarget.id) ?? null : null),
    [craftWeapons, craftTarget],
  );

  const craftSelectedArmor = useMemo(
    () => (craftTarget?.kind === "armor" ? armors.find((a) => a.id === craftTarget.id) ?? null : null),
    [armors, craftTarget],
  );

  const craftTargetLabel = useMemo(() => {
    if (!craftTarget) return null;
    if (craftSelectedWeapon) {
      const lv = craftSelectedWeapon.enhanceLevel ?? 0;
      return `${craftSelectedWeapon.name}${lv > 0 ? ` +${lv}` : ""}`;
    }
    return craftSelectedArmor?.name ?? craftTarget.id;
  }, [craftTarget, craftSelectedWeapon, craftSelectedArmor]);

  const forgeTools = useMemo(() => forgeToolsForMode(forgeMode), [forgeMode]);
  const activeCraftTool = useMemo(
    () => forgeTools.find((t) => t.itemId === selectedToolId) ?? null,
    [forgeTools, selectedToolId],
  );
  const needsTransferTarget = !!activeCraftTool?.needsTransferTarget;
  const needsItemLevelPicker = !!activeCraftTool?.needsItemLevelPicker;
  const itemLevelOptions = useMemo(() => {
    if (!selectedToolId) return [] as number[];
    const ck = equipmentCraftConsumableKind(selectedToolId);
    if (!ck || ck === "quality_up") return [];
    const tier = itemLevelTierForCraftKind(ck);
    return tier ? itemLevelsForTier(tier) : [];
  }, [selectedToolId]);

  const craftTransferCandidates = useMemo(() => {
    if (!craftTarget) return [];
    const hero = craftKind === "weapon" ? craftSelectedWeapon : craftSelectedArmor;
    if (!hero) return [];
    const list = craftKind === "weapon" ? craftWeapons : armors;
    const grade = hero.grade ?? 1;
    return list.filter((it) => {
      if (it.id === craftTarget.id) return false;
      if ((it.grade ?? 1) !== grade) return false;
      if (craftKind === "armor") {
        const a = getArmorStats(hero.baseItemId);
        const b = getArmorStats(it.baseItemId);
        if (!a || !b || a.slot !== b.slot) return false;
      }
      return true;
    });
  }, [craftTarget, craftKind, craftSelectedWeapon, craftSelectedArmor, craftWeapons, armors]);

  const craftTransferTargetLabel = useMemo(() => {
    if (!craftTransferTarget) return null;
    if (craftTransferTarget.kind === "weapon") {
      const w = craftWeapons.find((x) => x.id === craftTransferTarget.id);
      return w?.name ?? craftTransferTarget.id;
    }
    const a = armors.find((x) => x.id === craftTransferTarget.id);
    return a?.name ?? craftTransferTarget.id;
  }, [craftTransferTarget, craftWeapons, armors]);

  const unidentifiedEquipCount = useMemo(() => {
    const w = (me?.weaponInstances ?? []).filter((x) => x.identified === false).length;
    const a = (me?.armorInstances ?? []).filter((x) => x.identified === false).length;
    return w + a;
  }, [me]);

  const appraisalScrollQty = stackQty(ITEM_APPRAISAL_SCROLL);

  const onEnhanceMotionComplete = useCallback(() => {
    setEnhanceMotion(null);
    pendingEnhanceRef.current = null;
    window.setTimeout(() => setEnhanceOutcome(null), 2200);
  }, []);

  const runEnhance = useCallback(
    async (equip: WeaponRow | ArmorRow, kind: EquipKind) => {
      if (enhanceRunInFlightRef.current || enhanceMotion) return;

      const affordErr = validateEnhanceAfford({
        enhanceLevel: equip.enhanceLevel ?? 0,
        grade: equip.grade ?? 1,
        goldAvailable: goldAvailable ?? me?.wallet?.goldAvailable ?? 0,
        materialQty: stackQty,
        itemNames: nameById,
        manaStoneItemId: selectedManaStoneId,
      });
      if (affordErr) {
        setError(affordErr);
        return;
      }

      enhanceRunInFlightRef.current = true;
      setBusy(true);
      setError(null);
      setEnhanceOutcome(null);
      setEnhanceMotion(null);

      let rollbackGold: (() => void) | null = null;
      try {
        const cur = Math.max(0, Math.floor(equip.enhanceLevel ?? 0));
        const cost = weaponUpgradeCostForNextLevel(cur);
        rollbackGold = useWalletStore.getState().optimisticGoldDelta(-cost.gold);
        setEnhanceMotion({
          kind,
          instanceId: equip.id,
          baseItemId: equip.baseItemId,
          fromLevel: cur,
          toLevel: cur,
          variant: "success",
        });

        const r = await postJson<UpgradeApiOk>(
          kind === "weapon"
            ? "/api/inventory/weapon-instance/upgrade"
            : "/api/inventory/armor-instance/upgrade",
          kind === "weapon"
            ? {
                weaponInstanceId: equip.id,
                useProtectionScroll: useProtectionScroll || undefined,
                useBlessingGem: useBlessingGem || undefined,
                manaStoneItemId: selectedManaStoneId ?? undefined,
              }
            : {
                armorInstanceId: equip.id,
                useProtectionScroll: useProtectionScroll || undefined,
                useBlessingGem: useBlessingGem || undefined,
                manaStoneItemId: selectedManaStoneId ?? undefined,
              },
        );
        if (!r?.ok) throw new Error(typeof r === "object" && r && "error" in r ? String((r as { error: unknown }).error) : "UPGRADE_FAILED");

        if (r.tutorialAdvanced) notifyTutorialRefresh();
        rollbackGold = null;
        await load();
        notifyGameFramePatch(["wallet", "enhance", kind === "weapon" ? "weapons" : "armor"]);

        const variant: EnhanceBurstVariant = r.success ? "success" : "fail";
        const payload: EnhanceMotionState = {
          kind,
          instanceId: equip.id,
          baseItemId: equip.baseItemId,
          fromLevel: r.from,
          toLevel: r.to,
          variant,
        };
        pendingEnhanceRef.current = payload;
        setEnhanceMotion(payload);
        setEnhanceOutcome({
          variant,
          from: r.from,
          to: r.to,
          protectedOnFail: r.protectedOnFail,
        });
      } catch (e) {
        rollbackGold?.();
        setEnhanceMotion(null);
        setError(friendlyForgeError(e, nameById));
      } finally {
        enhanceRunInFlightRef.current = false;
        setBusy(false);
      }
    },
    [enhanceMotion, load, goldAvailable, me?.wallet?.goldAvailable, nameById, selectedManaStoneId, stackQty, useProtectionScroll, useBlessingGem],
  );

  const runSalvage = useCallback(async () => {
    if (salvageSelectedItems.length === 0) return;
    const n = salvageSelectedItems.length;
    if (
      !window.confirm(
        `선택한 장비 ${n}개를 분해합니다. 되돌릴 수 없습니다. 계속할까요?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<{
        ok: boolean;
        salvagedCount?: number;
        loot?: Array<{ itemId: string; qty: number }>;
      }>("/api/inventory/equipment-instance/salvage", {
        targets: salvageSelectedItems.map((it) => ({
          targetKind: salvageKind,
          targetInstanceId: it.id,
        })),
      });
      if (!r?.ok) throw new Error(typeof r === "object" && r && "error" in r ? String((r as { error: unknown }).error) : "SALVAGE_FAILED");
      const salvagedIds = new Set(salvageSelectedItems.map((it) => it.id));
      setSalvageSelectedIds(new Set());
      setMe((prev) => {
        if (!prev) return prev;
        const patched = applySalvageToMeState(prev, {
          kind: salvageKind,
          salvagedIds,
          loot: r.loot ?? [],
          nameById,
        });
        usePlayerEquipmentStore.getState().setEquipment({
          inventory: patched.inventory,
          weaponInstances: patched.weaponInstances,
          armorInstances: patched.armorInstances,
        });
        return patched;
      });
      void loadEnhanceMeState(true)
        .then((next) => {
          setMe(next);
          usePlayerEquipmentStore.getState().setEquipment({
            inventory: next.inventory,
            weaponInstances: next.weaponInstances,
            armorInstances: next.armorInstances,
          });
        })
        .catch(() => {});
    } catch (e) {
      setError(friendlyForgeError(e, nameById));
    } finally {
      setBusy(false);
    }
  }, [salvageSelectedItems, salvageKind, load, nameById]);

  const applyCraftTool = useCallback(async () => {
    if (!craftTarget || !selectedToolId) return;
    const optKind = optionConsumableKind(selectedToolId);
    const craftConsumableKind = equipmentCraftConsumableKind(selectedToolId);
    if (optKind === "transfer" && !craftTransferTarget) return;
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<{ ok: boolean; error?: string }>(
        "/api/inventory/equipment-instance/apply-consumable",
        {
          consumableItemId: selectedToolId,
          targetKind: craftTarget.kind,
          targetInstanceId: craftTarget.id,
          transferTargetInstanceId: optKind === "transfer" ? craftTransferTarget?.id : undefined,
          chosenItemLevel:
            craftConsumableKind && craftConsumableKind !== "quality_up" ? chosenItemLevel : undefined,
        },
      );
      if (!r?.ok) throw new Error(typeof r === "object" && r && "error" in r ? String((r as { error: unknown }).error) : "CRAFT_FAILED");
      setCraftTransferTarget(null);
      await load();
    } catch (e) {
      setError(friendlyForgeError(e, nameById));
    } finally {
      setBusy(false);
    }
  }, [craftTarget, craftTransferTarget, selectedToolId, chosenItemLevel, load, nameById]);

  const runAppraiseAll = useCallback(async () => {
    if (unidentifiedEquipCount === 0) return;
    if (appraisalScrollQty < unidentifiedEquipCount) {
      setError(
        `감정 주문서가 부족해요. 미감정 ${unidentifiedEquipCount}개 · 보유 ${appraisalScrollQty}개`,
      );
      return;
    }
    if (
      !window.confirm(
        `미감정 장비 ${unidentifiedEquipCount}개에 감정 주문서 ${unidentifiedEquipCount}개를 사용합니다. 계속할까요?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<{ ok: boolean; appraisedCount?: number; error?: string }>(
        "/api/inventory/equipment-instance/appraise-all",
        {},
      );
      if (!r?.ok) throw new Error(typeof r === "object" && r && "error" in r ? String((r as { error: unknown }).error) : "APPRAISE_FAILED");
      await load();
    } catch (e) {
      setError(friendlyForgeError(e, nameById));
    } finally {
      setBusy(false);
    }
  }, [unidentifiedEquipCount, appraisalScrollQty, load, nameById]);

  const selectedMax = selectedEnhance ? weaponEnhanceMaxLevelForGrade(selectedEnhance.grade ?? 1) : 0;
  const upgrade = selectedEnhance
    ? nextUpgradeInfo(selectedEnhance.enhanceLevel ?? 0, selectedEnhance.grade ?? 1, nameById)
    : null;

  const manaStoneReq = useMemo(
    () => (upgrade?.cost ? manaStoneRequirementFromCost(upgrade.cost.materials) : null),
    [upgrade],
  );

  const eligibleManaStones = useMemo(() => {
    if (!manaStoneReq) return [] as EnhanceManaStoneItemId[];
    return eligibleManaStonesForRequirement(manaStoneReq.itemId, manaStoneReq.quantity, stackQty);
  }, [manaStoneReq, stackQty]);

  useEffect(() => {
    if (!manaStoneReq) {
      setSelectedManaStoneId(null);
      return;
    }
    setSelectedManaStoneId((prev) => {
      if (prev && eligibleManaStones.includes(prev)) return prev;
      const exact = manaStoneReq.itemId as EnhanceManaStoneItemId;
      if (eligibleManaStones.includes(exact)) return exact;
      return null;
    });
  }, [manaStoneReq, eligibleManaStones, selectedEnhance?.id, selectedEnhance?.enhanceLevel]);

  const forgeMaterialName = useCallback(
    (itemId: string) => {
      const known = forgeEnhanceMaterialLabel(itemId);
      if (known !== itemId) return known;
      const mana = enhanceManaStoneLabel(itemId);
      if (mana !== itemId) return mana;
      return nameById.get(itemId) ?? itemId;
    },
    [nameById],
  );

  const manaStoneName = forgeMaterialName;

  const enhanceMaterialCells = useMemo((): ForgeMaterialCell[] => {
    const cells: ForgeMaterialCell[] = [];
    for (const itemId of FORGE_ENHANCE_MATERIAL_IDS) {
      const need = upgrade?.cost?.materials.find((m) => m.itemId === itemId)?.quantity;
      cells.push({
        key: itemId,
        itemId,
        label: forgeMaterialName(itemId),
        quantity: stackQty(itemId),
        required: need,
        hint:
          need != null && itemId === selectedManaStoneId
            ? `이번 강화에 선택됨`
            : need != null
              ? `다음 강화 기준 재료`
              : undefined,
      });
    }
    return cells;
  }, [upgrade, forgeMaterialName, stackQty, selectedManaStoneId]);

  const motionBusy = !!enhanceMotion;
  const canAfford =
    selectedEnhance && me
      ? validateEnhanceAfford({
          enhanceLevel: selectedEnhance.enhanceLevel ?? 0,
          grade: selectedEnhance.grade ?? 1,
          goldAvailable: me.wallet.goldAvailable,
          materialQty: stackQty,
          itemNames: nameById,
          manaStoneItemId: selectedManaStoneId,
        }) == null
      : false;

  const displayFrom = enhanceOutcome?.from ?? selectedEnhance?.enhanceLevel ?? 0;
  const showLevelArrow = !upgrade?.atMax;
  const displayTarget = upgrade?.atMax
    ? displayFrom
    : enhanceOutcome?.variant === "success"
      ? enhanceOutcome.to
      : displayFrom + 1;

  const craftHero = craftKind === "weapon" ? craftSelectedWeapon : craftSelectedArmor;

  const selectedEnhanceDisplayName = selectedEnhance
    ? enhanceKind === "weapon"
      ? weaponDisplayName({
          ...selectedEnhance,
          identified: selectedEnhance.identified,
          enhanceLevel: 0,
        })
      : armorDisplayName({
          ...selectedEnhance,
          identified: selectedEnhance.identified,
          enhanceLevel: 0,
        })
    : "";

  return (
    <>
      <GamePanel className={`enhance-forge forge-hub ${embedded ? "enhance-forge--fit panel-fit" : ""}`}>
        <header className="forge-hub__header">
          <div className="forge-hub__header-row">
          <div className="forge-hub__modes" role="tablist" aria-label="대장간 작업">
            <button
              type="button"
              role="tab"
              aria-selected={forgeMode === "enhance"}
              className={`forge-hub__mode ${forgeMode === "enhance" ? "forge-hub__mode--active" : ""}`}
              onClick={() => switchForgeMode("enhance")}
            >
              강화
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={forgeMode === "craft"}
              className={`forge-hub__mode ${forgeMode === "craft" ? "forge-hub__mode--active" : ""}`}
              onClick={() => switchForgeMode("craft")}
            >
              {isMobile ? "가공" : "장비 가공"}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={forgeMode === "salvage"}
              className={`forge-hub__mode ${forgeMode === "salvage" ? "forge-hub__mode--active" : ""}`}
              onClick={() => switchForgeMode("salvage")}
            >
              {isMobile ? "분해" : "분해·추출"}
            </button>
          </div>
          {!embedded ? (
            <GameBtn variant="ghost" disabled={busy || motionBusy} onClick={() => void load()}>
              {busy ? "…" : "새로고침"}
            </GameBtn>
          ) : null}
          </div>
          {!embedded ? (
            <p className="forge-hub__subtitle">
              {forgeMode === "enhance"
                ? benchOpen
                  ? "강화 작업대 — 강화 보호 주문서를 켜면 실패 시 골드·마석이 반환됩니다."
                  : "강화할 무기·방어구를 고르면 작업대가 열립니다."
                : forgeMode === "salvage"
                  ? "착용·거래 중이 아닌 장비를 분해해 마석·재료를 추출합니다. 장비는 삭제됩니다."
                  : benchOpen
                    ? "가공 작업대 — 감정·보석으로 옵션을 다듬습니다."
                    : "가공할 장비를 고르면 작업대가 열립니다."}
            </p>
          ) : null}
        </header>

        {error ? <div className="market-alert market-alert--error">{error}</div> : null}

        {!embedded && sessionLoading ? (
          <GamePanelLoading label="세션 확인 중…" />
        ) : !embedded && !user ? (
          <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
        ) : embedded || user ? (
          <>
            {forgeMode === "enhance" ? !benchOpen ? (
              <ForgeEquipPicker
                mode="enhance"
                equipKind={enhanceKind}
                onEquipKindChange={(kind) => {
                  setEnhanceKind(kind);
                  closeBench();
                }}
                items={enhanceList}
                onPick={openEnhanceBench}
                toolbar={
                  <>
                    <input
                      className="market-input market-input--search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="검색…"
                    />
                    <select
                      className="market-input market-input--select"
                      value={enhanceKind === "weapon" ? sort : armorSortEnhance}
                      onChange={(e) => {
                        const v = e.target.value as WeaponSortId;
                        if (enhanceKind === "weapon") setSort(v);
                        else setArmorSortEnhance(v);
                      }}
                    >
                      <option value="grade_high">등급↑</option>
                      <option value="grade_low">등급↓</option>
                      <option value="enh_high">강화↑</option>
                      <option value="enh_low">강화↓</option>
                      <option value="newest">최신</option>
                      <option value="oldest">오래된</option>
                      <option value="name_az">이름</option>
                    </select>
                  </>
                }
              />
            ) : (
              <div
                className={`enhance-forge__layout enhance-forge__layout--bench ${embedded ? "enhance-forge__layout--fit" : ""}`}
              >
                <main className="enhance-forge__detail enhance-forge__stage enhance-forge__detail--enhance-bench">
                  {!selectedEnhance ? (
                    <p className="market-empty">장비를 찾을 수 없어요.</p>
                  ) : (
                    <>
                      <ForgeBenchTopbar onBack={closeBench} />

                      <div
                        className={`enhance-bench__focus ${itemGradeFrameClassName(selectedEnhance.grade ?? 1)}${enhanceOutcome?.variant === "success" ? " enhance-bench__focus--success" : ""}${enhanceOutcome?.variant === "fail" ? " enhance-bench__focus--fail" : ""}${enhanceMotion?.instanceId === selectedEnhance.id ? " enhance-bench__focus--enhancing" : ""}`.trim()}
                      >
                        <EnhanceItemBurst
                          active={enhanceMotion?.instanceId === selectedEnhance.id}
                          variant={enhanceMotion?.variant ?? "success"}
                          className="enhance-bench__burst"
                          onComplete={onEnhanceMotionComplete}
                        >
                          <ItemIcon
                            itemId={selectedEnhance.baseItemId}
                            size={56}
                            className="item-icon enhance-bench__icon"
                          />
                        </EnhanceItemBurst>
                        <div className="enhance-bench__body">
                          <div className="enhance-bench__head">
                            {selectedEnhance.gradeLabel ? (
                              <span className="enhance-bench__grade">{selectedEnhance.gradeLabel}</span>
                            ) : null}
                            <div className="enhance-bench__title-row">
                              <h3
                                className={`enhance-bench__name ${itemGradeNameClassName(selectedEnhance.grade ?? 1)}`}
                              >
                                {selectedEnhanceDisplayName}
                              </h3>
                              <p className="enhance-bench__level">
                                <span className="enhance-bench__level-now">+{displayFrom}</span>
                                <span
                                  className={`enhance-bench__level-arrow${showLevelArrow ? "" : " enhance-bench__level-arrow--reserved"}`}
                                  aria-hidden={!showLevelArrow}
                                >
                                  {showLevelArrow ? "→" : ""}
                                </span>
                                <span
                                  className={`enhance-bench__level-next${showLevelArrow ? "" : " enhance-bench__level-next--reserved"} ${
                                    enhanceOutcome?.variant === "fail"
                                      ? "enhance-bench__level-next--fail"
                                      : ""
                                  }`.trim()}
                                  aria-hidden={!showLevelArrow}
                                >
                                  {showLevelArrow ? `+${displayTarget}` : ""}
                                </span>
                              </p>
                            </div>
                            <ForgeEquippedByTag equippedByMinion={selectedEnhance.equippedByMinion} />
                          </div>
                          <div className="enhance-bench__status" aria-live="polite">
                            <p
                              className={`enhance-bench__status-msg${
                                enhanceOutcome?.variant === "success"
                                  ? " enhance-bench__status-msg--success enhance-bench__status-msg--visible"
                                  : enhanceOutcome?.variant === "fail"
                                    ? " enhance-bench__status-msg--fail enhance-bench__status-msg--visible"
                                    : ""
                              }`}
                              role={enhanceOutcome ? "status" : undefined}
                            >
                              {enhanceOutcome?.variant === "success"
                                ? "강화 성공!"
                                : enhanceOutcome?.variant === "fail"
                                  ? enhanceOutcome.protectedOnFail
                                    ? "강화 실패… 강화 보호 주문서로 골드·마석은 돌려받았어요."
                                    : "강화 실패… 재료는 소모됐어요."
                                  : ""}
                            </p>
                          </div>
                          <div className="enhance-bench__progress">
                            <div className="enhance-bench__track">
                              <div
                                className="enhance-bench__track-fill"
                                style={{
                                  width: `${Math.min(100, selectedMax > 0 ? ((selectedEnhance.enhanceLevel ?? 0) / selectedMax) * 100 : 0)}%`,
                                }}
                              />
                            </div>
                            <p className="enhance-bench__meta">최대 +{selectedMax}</p>
                          </div>
                        </div>
                      </div>

                      {(selectedEnhance.options?.length ?? 0) > 0 ? (
                        <div className="enhance-bench__options">
                          {renderForgeOptionChips(selectedEnhance.options ?? [], enhanceKind)}
                        </div>
                      ) : null}

                      {upgrade?.atMax ? (
                        <p className="enhance-bench__max-hint">이 장비는 더 이상 강화할 수 없어요.</p>
                      ) : upgrade?.cost ? (
                        <div className="enhance-bench__sheet enhance-bench__sheet--compact">
                          <div className="enhance-bench__rate-inline">
                            <span className="enhance-bench__rate-label">성공률</span>
                            <span
                              className={`enhance-bench__rate-val ${
                                upgrade.cost.successRate >= 70
                                  ? "enhance-forge__rate-ok"
                                  : upgrade.cost.successRate >= 40
                                    ? "enhance-forge__rate-mid"
                                    : "enhance-forge__rate-low"
                              }`}
                            >
                              {upgrade.cost.successRate}%
                            </span>
                          </div>
                          {manaStoneReq ? (
                            <ForgeManaStonePicker
                              requiredItemId={manaStoneReq.itemId}
                              requiredQty={manaStoneReq.quantity}
                              selectedId={selectedManaStoneId}
                              onSelect={setSelectedManaStoneId}
                              stackQty={stackQty}
                              itemName={manaStoneName}
                              disabled={busy || motionBusy}
                              compact
                            />
                          ) : null}
                          {stackQty(ITEM_ENHANCE_SCROLL_PROTECT) > 0 ? (
                            <label className="forge-protect-toggle forge-protect-toggle--inline">
                              <input
                                type="checkbox"
                                checked={useProtectionScroll}
                                onChange={(e) => setUseProtectionScroll(e.target.checked)}
                                disabled={busy || motionBusy}
                              />
                              <span>
                                {forgeMaterialName(ITEM_ENHANCE_SCROLL_PROTECT)} (×
                                {stackQty(ITEM_ENHANCE_SCROLL_PROTECT)})
                              </span>
                            </label>
                          ) : null}
                          {stackQty(ITEM_GEM_BLESSING) > 0 ? (
                            <label className="forge-protect-toggle forge-protect-toggle--inline">
                              <input
                                type="checkbox"
                                checked={useBlessingGem}
                                onChange={(e) => setUseBlessingGem(e.target.checked)}
                                disabled={busy || motionBusy}
                              />
                              <span>
                                {forgeMaterialName(ITEM_GEM_BLESSING)} (×
                                {stackQty(ITEM_GEM_BLESSING)}) · 성공 +2 · 확률↓
                              </span>
                            </label>
                          ) : null}
                        </div>
                      ) : null}

                      <ForgeMaterialGrid
                        title="보유 재료"
                        cells={enhanceMaterialCells}
                        className="forge-material-rail--bench-inline"
                        clickToToggle
                      />

                      <button
                        type="button"
                        className="enhance-forge__action"
                        disabled={
                          !!busy ||
                          motionBusy ||
                          upgrade?.atMax ||
                          !canAfford ||
                          (useProtectionScroll && stackQty(ITEM_ENHANCE_SCROLL_PROTECT) < 1) ||
                          (useBlessingGem && stackQty(ITEM_GEM_BLESSING) < 1)
                        }
                        onClick={() =>
                          selectedEnhance && void runEnhance(selectedEnhance, enhanceKind)
                        }
                      >
                        {busy || motionBusy ? "강화 중…" : upgrade?.atMax ? "최대 강화" : "강화하기"}
                      </button>
                    </>
                  )}
                </main>
              </div>
            ) : forgeMode === "salvage" ? (
              <div
                className={`enhance-forge__layout enhance-forge__layout--salvage ${embedded ? "enhance-forge__layout--fit" : ""}`}
              >
                <ForgeEquipGrid
                  layout="salvage"
                  title={salvageKind === "weapon" ? "분해할 무기" : "분해할 방어구"}
                  equipKind={salvageKind}
                  items={salvageList}
                  multiSelect
                  selectedIds={salvageSelectedIds}
                  onToggleSelect={toggleSalvageSelect}
                  emptyMessage="분해할 장비가 없어요."
                  toolbar={
                    <>
                      <div className="forge-hub__kind-toggle">
                        <button
                          type="button"
                          className={`forge-hub__kind ${salvageKind === "weapon" ? "forge-hub__kind--active" : ""}`}
                          onClick={() => {
                            setSalvageKind("weapon");
                            setSalvageSelectedIds(new Set());
                          }}
                        >
                          무기
                        </button>
                        <button
                          type="button"
                          className={`forge-hub__kind ${salvageKind === "armor" ? "forge-hub__kind--active" : ""}`}
                          onClick={() => {
                            setSalvageKind("armor");
                            setSalvageSelectedIds(new Set());
                          }}
                        >
                          방어구
                        </button>
                      </div>
                      <input
                        className="market-input market-input--search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="검색…"
                      />
                      <div className="forge-salvage-toolbar">
                        <button
                          type="button"
                          className="forge-salvage-toolbar__btn"
                          disabled={salvageList.length === 0 || !!busy}
                          onClick={() =>
                            setSalvageSelectedIds(
                              new Set(salvageList.slice(0, MAX_SALVAGE_BATCH).map((x) => x.id)),
                            )
                          }
                        >
                          전체 선택
                        </button>
                        <button
                          type="button"
                          className="forge-salvage-toolbar__btn"
                          disabled={salvageSelectedIds.size === 0 || !!busy}
                          onClick={() => setSalvageSelectedIds(new Set())}
                        >
                          선택 해제
                        </button>
                        <span className="forge-salvage-toolbar__count tabular-nums">
                          {salvageSelectedIds.size}개 선택
                        </span>
                      </div>
                    </>
                  }
                />

                <div className="enhance-forge__salvage-body">
                <main className="enhance-forge__detail enhance-forge__stage">
                  {salvageSelectedItems.length === 0 ? (
                    <p className="market-empty">위에서 분해할 장비를 선택하세요. (여러 개 가능)</p>
                  ) : (
                    <>
                      <div className="forge-salvage-selection">
                        <p className="game-label">분해 대상 · {salvageSelectedItems.length}개</p>
                        <ul className="forge-salvage-selection__list">
                          {salvageSelectedItems.map((it) => (
                            <li
                              key={it.id}
                              className={`forge-salvage-selection__row ${itemGradeNameClassName(it.grade ?? 1)}`}
                            >
                              <ItemIcon
                                itemId={it.baseItemId}
                                size={28}
                                className="item-icon forge-salvage-selection__icon"
                              />
                              <span className="forge-salvage-selection__name">
                                {it.name}
                                {(it.enhanceLevel ?? 0) > 0 ? ` +${it.enhanceLevel}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="enhance-forge__hero-meta">
                          미니언 착용·거래소 등록 장비는 분해할 수 없어요.
                        </p>
                      </div>

                      <div className="forge-salvage-preview">
                        <p className="forge-salvage-preview__title">
                          예상 추출 합계 (확정 + 장비당 확률 보너스)
                        </p>
                        <ul className="forge-salvage-preview__list">
                          {salvagePreview.map((row) => (
                            <li key={row.itemId}>
                              <span>{nameById.get(row.itemId) ?? row.itemId}</span>
                              <span className="tabular-nums">×{fmtInt(row.qty)}</span>
                            </li>
                          ))}
                        </ul>
                        {salvageBonusHints.length > 0 ? (
                          <p className="forge-salvage-preview__hint">
                            추가 확률(개당): {salvageBonusHints.join(" · ")}
                          </p>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        className="enhance-forge__action enhance-forge__action--salvage"
                        disabled={!!busy || salvageSelectedItems.length === 0}
                        onClick={() => void runSalvage()}
                      >
                        {busy
                          ? "분해 중…"
                          : salvageSelectedItems.length > 1
                            ? `${salvageSelectedItems.length}개 분해하기`
                            : "분해하기"}
                      </button>
                    </>
                  )}
                </main>

                <aside className="forge-material-rail forge-salvage-rail">
                  <div className="forge-rail__head">
                    <p className="forge-rail__title">안내</p>
                  </div>
                  <p className="forge-salvage-rail__text">
                    아이콘을 눌러 여러 장비를 선택한 뒤 한 번에 분해할 수 있어요. 최대 {MAX_SALVAGE_BATCH}
                    개까지. 착용 해제 후 이용하세요.
                  </p>
                </aside>
                </div>
              </div>
            ) : !benchOpen ? (
              <ForgeEquipPicker
                mode="craft"
                equipKind={craftKind}
                onEquipKindChange={(kind) => {
                  setCraftKind(kind);
                  closeBench();
                }}
                items={craftKind === "weapon" ? craftWeapons : armors}
                onPick={openCraftBench}
                toolbar={
                  <>
                    <input
                      className="market-input market-input--search"
                      value={craftQ}
                      onChange={(e) => setCraftQ(e.target.value)}
                      placeholder="검색…"
                    />
                    {craftKind === "armor" ? (
                      <select
                        className="market-input market-input--select"
                        value={armorSort}
                        onChange={(e) => setArmorSort(e.target.value as ArmorSortId)}
                      >
                        <option value="newest">최신</option>
                        <option value="oldest">오래된</option>
                        <option value="name_az">이름</option>
                      </select>
                    ) : null}
                    <GameBtn
                      variant="ghost"
                      disabled={
                        busy ||
                        unidentifiedEquipCount === 0 ||
                        appraisalScrollQty < unidentifiedEquipCount
                      }
                      onClick={() => void runAppraiseAll()}
                    >
                      전체 감정 ({unidentifiedEquipCount})
                    </GameBtn>
                  </>
                }
              />
            ) : (
              <div
                className={`enhance-forge__layout enhance-forge__layout--bench forge-hub__craft-layout ${embedded ? "enhance-forge__layout--fit" : ""}`}
              >
                <main className="enhance-forge__detail enhance-forge__stage forge-hub__craft-detail">
                  {!craftHero ? (
                    <p className="market-empty">장비를 찾을 수 없어요.</p>
                  ) : (
                    <>
                      <ForgeBenchTopbar onBack={closeBench} />
                      <div className="enhance-forge__hero">
                        <ItemIcon
                          itemId={craftHero.baseItemId}
                          size={88}
                          className="item-icon enhance-forge__hero-icon"
                        />
                        <div className="enhance-forge__hero-info">
                          <p className="game-label">가공 대상</p>
                          <h3
                            className={`enhance-forge__hero-name ${itemGradeNameClassName(craftHero.grade ?? 1)}`}
                          >
                            {craftSelectedWeapon && (craftSelectedWeapon.enhanceLevel ?? 0) > 0
                              ? `${craftSelectedWeapon.name} +${craftSelectedWeapon.enhanceLevel}`
                              : craftHero.name}
                          </h3>
                          <p className="enhance-forge__hero-meta">
                            {craftHero.gradeLabel ?? ""}
                            {craftHero.identified === false ? " · 미감정" : ""}
                            {(craftSelectedWeapon?.quality ?? craftSelectedArmor?.quality ?? 0) > 0
                              ? ` · 품질 ${craftSelectedWeapon?.quality ?? craftSelectedArmor?.quality}`
                              : ""}
                            {(craftSelectedWeapon?.qualityCraftCount ?? craftSelectedArmor?.qualityCraftCount ?? 0) > 0
                              ? ` · 연마 ${craftSelectedWeapon?.qualityCraftCount ?? craftSelectedArmor?.qualityCraftCount}/${MAX_QUALITY_CRAFT_USES}`
                              : ""}
                            {(craftSelectedWeapon?.itemLevel ?? craftSelectedArmor?.itemLevel ?? 10) > 10
                              ? ` · 아이템 Lv${craftSelectedWeapon?.itemLevel ?? craftSelectedArmor?.itemLevel}`
                              : ""}
                          </p>
                        </div>
                      </div>

                      <section className="forge-hub__craft-equip-panel">
                        <CraftEquipBaseStats baseItemId={craftHero.baseItemId} equipKind={craftKind} />
                        <div className="forge-hub__craft-options">
                          {(craftHero.options?.length ?? 0) > 0 ? (
                            <EquipmentBlessingOptionRows
                              options={craftHero.options ?? []}
                              identified={craftHero.identified !== false}
                            />
                          ) : (
                            <p className="forge-equip-options__empty text-xs text-[var(--game-muted)]">옵션 없음</p>
                          )}
                        </div>
                      </section>

                      {needsItemLevelPicker && itemLevelOptions.length > 0 ? (
                        <div className="forge-level-pick">
                          <p className="game-label">설정할 아이템 레벨</p>
                          <select
                            className="inventory-input w-full max-w-xs"
                            value={chosenItemLevel}
                            disabled={busy}
                            onChange={(e) => setChosenItemLevel(Number(e.target.value))}
                          >
                            {itemLevelOptions.map((lv) => (
                              <option key={lv} value={lv}>
                                Lv {lv}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      {needsTransferTarget ? (
                        <div className="forge-transfer-pick">
                          <p className="game-label">전이 받을 장비 (같은 등급·부위)</p>
                          {craftTransferCandidates.length === 0 ? (
                            <p className="forge-tool-picker__hint">조건에 맞는 다른 장비가 없어요.</p>
                          ) : (
                            <ForgeEquipGrid
                              title=""
                              equipKind={craftKind}
                              items={craftTransferCandidates}
                              selectedId={craftTransferTarget?.id ?? null}
                              onSelect={(id) =>
                                setCraftTransferTarget({ kind: craftKind, id })
                              }
                              emptyMessage="없음"
                            />
                          )}
                        </div>
                      ) : null}

                      <ForgeToolPicker
                        layout="inline"
                        hideTargetCard
                        tools={forgeTools}
                        inventory={me?.inventory ?? []}
                        selectedToolId={selectedToolId}
                        onSelectTool={setSelectedToolId}
                        selectedEquip={craftTarget}
                        targetLabel={craftTargetLabel}
                        transferTargetLabel={craftTransferTargetLabel}
                        needsTransferTarget={needsTransferTarget}
                        onApply={() => void applyCraftTool()}
                        onAppraiseAll={
                          unidentifiedEquipCount > 0 && appraisalScrollQty >= unidentifiedEquipCount
                            ? () => void runAppraiseAll()
                            : undefined
                        }
                        unidentifiedCount={unidentifiedEquipCount}
                        appraisalScrollQty={appraisalScrollQty}
                        busy={busy}
                      />
                    </>
                  )}
                </main>
              </div>
            )}
          </>
        ) : null}
      </GamePanel>
    </>
  );
}

/** @deprecated 이름 호환 — GameFrame·라우트는 WeaponEnhancePanel 사용 */
export const EnhanceForgePanel = WeaponEnhancePanel;
