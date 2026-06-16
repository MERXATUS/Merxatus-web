"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { StackItemTooltipHover } from "@/app/_components/StackItemTooltip";
import { WeaponTooltipHover } from "@/app/_components/WeaponTooltip";
import { shouldShowStackItemTooltip } from "@/shared/stackItemTooltip";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { itemGradeFrameClassName, itemGradeNameClassName } from "@/server/itemGrade";
import { MinionRecruitReveal } from "@/app/_components/MinionRecruitReveal";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { API_CACHE_TTL } from "@/shared/apiCache";
import { apiGetJsonCached, isUnauthorizedError } from "@/shared/sessionClient";
import { GAME_FRAME_REFRESH_EVENT, routeForGameTab } from "@/shared/gameNav";
import { notifyOpenForge } from "@/shared/forgeNav";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";
import {
  isMinionRecruitCategory,
  isMinionRecruitItemId,
  type MinionHatchResult,
} from "@/shared/minionRecruit";
import { isLootBoxItemId } from "@/shared/boxOpen";
import {
  renderEquipOptionChips,
} from "@/app/_components/EquipmentConsumableBar";
import {
  armorSlotLabelKo,
  getArmorStats,
  isArmorInventoryItem,
} from "@/shared/armorStatsData";
import { weaponBaseStatLine } from "@/shared/weaponStatsData";
import { armorDisplayName } from "@/shared/armorTooltip";
import { weaponDisplayName } from "@/shared/weaponTooltip";
import { equipmentCapacityLabel } from "@/shared/equipmentCapacity";
import { inventoryAvailableQty } from "@/shared/inventoryLock";

type MeState = {
  ok: true;
  wallet: { goldAvailable: number; goldLocked: number };
  equipment?: { ownedCount: number; maxOwned: number };
  inventory: Array<{
    itemId: string;
    name: string;
    category: string;
    quantity: number;
    lockedQuantity?: number;
    availableQuantity?: number;
    grade?: number;
    gradeLabel?: string;
    icon?: string | null;
    iconSrc?: string;
  }>;
  weaponInstances?: Array<{
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    userLocked?: boolean;
    createdAt: string;
    grade?: number;
    gradeLabel?: string;
    icon?: string | null;
    iconSrc?: string;
    identified?: boolean;
    options?: Array<{
      kind: string;
      label: string;
      tier: number;
      tierLabel: string;
      displayValue: number;
      hidden?: boolean;
      locked?: boolean;
    }>;
  }>;
  armorInstances?: Array<{
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    userLocked?: boolean;
    createdAt: string;
    grade?: number;
    gradeLabel?: string;
    icon?: string | null;
    iconSrc?: string;
    identified?: boolean;
    options?: Array<{
      kind: string;
      label: string;
      tier: number;
      tierLabel: string;
      displayValue: number;
      hidden?: boolean;
      locked?: boolean;
    }>;
  }>;
  myListings: Array<{
    id: string;
    saleType: "FIXED" | "AUCTION";
    status: "ACTIVE";
    itemId: string;
    itemName: string;
    quantity: number;
    fixedPricePerUnit: number | null;
      fixedPriceTotal?: number | null;
    startPrice: number | null;
    endsAt: string | null;
    highestBid: number | null;
    createdAt: string;
  }>;
};

type WeaponInstanceRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  createdAt: string;
  userLocked?: boolean;
  grade?: number;
  gradeLabel?: string;
  icon?: string | null;
  iconSrc?: string;
  identified?: boolean;
  options?: Array<{
    kind: string;
    label: string;
    tier: number;
    tierLabel: string;
    displayValue: number;
    hidden?: boolean;
    locked?: boolean;
  }>;
};

type ArmorInstanceRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  createdAt: string;
  userLocked?: boolean;
  grade?: number;
  gradeLabel?: string;
  icon?: string | null;
  iconSrc?: string;
  identified?: boolean;
  options?: Array<{
    kind: string;
    label: string;
    tier: number;
    tierLabel: string;
    displayValue: number;
    hidden?: boolean;
    locked?: boolean;
  }>;
};

async function readFetchBody(res: Response, requestUrl: string): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      parseError: true,
      status: res.status,
      path: requestUrl,
      preview: text.slice(0, 600),
    };
  }
}

/** 실패 시 빈 `{}` 대신 status·본문을 담아 던짐 (Next/HTML 500 등 대응) */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  const data = await readFetchBody(res, url);
  if (!res.ok) {
    const base =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : { detail: data };
    throw {
      ok: false,
      status: res.status,
      statusText: res.statusText,
      path: url,
      ...base,
    };
  }
  return data as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readFetchBody(res, url);
  if (!res.ok) {
    const base =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : { detail: data };
    throw {
      ok: false,
      status: res.status,
      statusText: res.statusText,
      path: url,
      ...base,
    };
  }
  return data as T;
}

function fmtInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return Math.round(x).toLocaleString();
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function formatLeft(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}h ${String(mm).padStart(2, "0")}m`;
  return `${mm}m ${String(ss).padStart(2, "0")}s`;
}

function friendlyInventoryApiError(e: unknown, itemNameById: Map<string, string>): string {
  const o = e as { error?: string; message?: string };
  const err = o?.error;
  if (typeof err !== "string") return "";
  if (err === "INSUFFICIENT_GOLD") return "골드가 부족해.";
  if (err === "MAX_WEAPON_LEVEL") return "이 등급 무기의 최대 제련 단계에 도달했어.";
  if (err === "WEAPON_INSTANCE_NOT_FOUND") return "무기를 찾을 수 없어.";
  if (err === "NOT_A_WEAPON") return "무기만 제련할 수 있어.";
  if (err === "WEAPON_LOCKED") return "이 무기는 등록 중이라 제련할 수 없어.";
  if (err === "WALLET_NOT_FOUND") return "지갑 정보를 찾을 수 없어.";
  if (err === "NO_RECRUIT_TICKET") return "미니언 고용권이 부족해. 던전·거래소에서 구해 와.";
  if (err === "NO_BOX") return "상자가 부족해.";
  if (err === "ITEM_LOCKED") return "잠긴 아이템은 사용·판매할 수 없어. 잠금을 해제한 뒤 다시 시도해.";
  if (err === "ITEM_USER_LOCKED") return "잠긴 장비야. 인벤에서 잠금을 해제한 뒤 다시 시도해.";
  if (err === "INSUFFICIENT_AVAILABLE") return "잠글 수 있는 가용 수량이 부족해.";
  if (err === "NOTHING_LOCKED") return "잠긴 수량이 없어.";
  if (err === "NOT_A_LOOT_BOX") return "개봉할 수 없는 아이템이야.";
  if (err === "BOX_TABLE_EMPTY") return "상자 보상 테이블을 찾을 수 없어. data:sync 후 다시 시도해.";
  if (err === "NOT_OPTION_CONSUMABLE") return "장비 옵션 소모품만 사용할 수 있어.";
  if (err === "NO_CONSUMABLE") return "소모품이 부족해.";
  if (err === "NOT_FOUND") return "대상 장비를 찾을 수 없어.";
  if (err === "EQUIPMENT_LOCKED") return "거래소 등록 중인 장비에는 사용할 수 없어.";
  if (err === "ALREADY_IDENTIFIED") return "이미 감정된 장비예요.";
  if (err === "NEEDS_APPRAISAL") return "감정 주문서로 먼저 감정해야 해요.";
  if (err === "NO_OPTIONS") return "적용할 옵션이 없어요.";
  if (err === "NO_REMOVABLE_OPTION") return "제거할 수 있는 옵션이 없어요. (봉인 슬롯만 있거나 옵션이 없음)";
  if (err === "SEAL_LIMIT_OR_NO_SLOT") return "봉인할 옵션 슬롯이 없거나 이미 봉인이 있어요.";
  if (err === "MAX_MINION_OWNED" || err === "MAX_GATHER_MINION_OWNED")
    return "수집 미니언은 최대 10마리까지 보유할 수 있어.";
  if (err === "MAX_DUNGEON_MINION_OWNED") return "던전 미니언은 최대 10마리까지 보유할 수 있어.";
  if (err === "MAX_EQUIPMENT_OWNED") {
    return "무기·방어구 보유 한도(100개)에 도달했어요. 분해하거나 거래소에 올린 뒤 다시 시도해 주세요.";
  }
  if (err.startsWith("INSUFFICIENT_MATERIAL:")) {
    const id = err.slice("INSUFFICIENT_MATERIAL:".length);
    const label = itemNameById.get(id) ?? id;
    return `재료가 부족해: ${label} (${id}). 상자 개봉·거래소에서 구한 뒤 다시 시도해.`;
  }
  if (err === "DB_MIGRATION_REQUIRED") {
    return "DB 마이그레이션이 필요합니다. web 폴더에서 npm run db:migrate 실행 후 dev 서버를 재시작해 주세요.";
  }
  if (err === "INTERNAL" || err === "INTERNAL_SERVER_ERROR") {
    const msg = typeof o.message === "string" ? o.message : "";
    if (/ArmorInstance|ToolInstance|does not exist/i.test(msg)) {
      return "DB 마이그레이션이 필요합니다. web 폴더에서 npm run db:migrate 실행 후 dev 서버를 재시작해 주세요.";
    }
    if (msg.length > 0) return msg;
  }
  return "";
}

const INV_SORT_STORAGE_KEY = "inv_sort_prefs_v1";
const INV_VIEW_MODE_KEY = "inv_view_mode_v1";

type InventoryViewMode = "icons" | "list";

const DEFAULT_VIEW_MODE: InventoryViewMode = "list";

function readViewMode(): InventoryViewMode {
  if (typeof window === "undefined") return DEFAULT_VIEW_MODE;
  try {
    const raw = localStorage.getItem(INV_VIEW_MODE_KEY);
    if (raw === "grid2") return "list";
    if (raw === "icons" || raw === "list") return raw;
    return DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

function writeViewMode(mode: InventoryViewMode) {
  try {
    localStorage.setItem(INV_VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function inventoryListClassName(mode: InventoryViewMode, extra?: string) {
  return ["inventory-item-list", `inventory-item-list--${mode}`, extra].filter(Boolean).join(" ");
}

type WeaponSortId =
  | "newest"
  | "oldest"
  | "name_az"
  | "name_za"
  | "enh_high"
  | "enh_low"
  | "grade_high"
  | "grade_low";

type MaterialSortId = "qty_high" | "qty_low" | "name_az" | "name_za" | "grade_high" | "grade_low" | "id_az";

type SortPrefs = { weapons: WeaponSortId; armor: MaterialSortId; materials: MaterialSortId };

const DEFAULT_SORT_PREFS: SortPrefs = {
  weapons: "newest",
  armor: "name_az",
  materials: "qty_high",
};

function readSortPrefs(): SortPrefs {
  if (typeof window === "undefined") return DEFAULT_SORT_PREFS;
  try {
    const raw = localStorage.getItem(INV_SORT_STORAGE_KEY);
    if (!raw) return DEFAULT_SORT_PREFS;
    const p = JSON.parse(raw) as Partial<SortPrefs>;
    return { ...DEFAULT_SORT_PREFS, ...p };
  } catch {
    return DEFAULT_SORT_PREFS;
  }
}

function writeSortPrefs(p: SortPrefs) {
  try {
    localStorage.setItem(INV_SORT_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function compareLocaleKo(a: string, b: string) {
  return a.localeCompare(b, "ko", { sensitivity: "base" });
}

function sortWeaponRows(rows: WeaponInstanceRow[], by: WeaponSortId): WeaponInstanceRow[] {
  const out = rows.slice();
  const tie = (a: WeaponInstanceRow, b: WeaponInstanceRow) => compareLocaleKo(a.id, b.id);
  const byTime = (a: WeaponInstanceRow, b: WeaponInstanceRow) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  switch (by) {
    case "newest":
      out.sort((a, b) => (byTime(b, a) !== 0 ? byTime(b, a) : tie(a, b)));
      break;
    case "oldest":
      out.sort((a, b) => (byTime(a, b) !== 0 ? byTime(a, b) : tie(a, b)));
      break;
    case "name_az":
      out.sort((a, b) => (compareLocaleKo(a.name, b.name) !== 0 ? compareLocaleKo(a.name, b.name) : tie(a, b)));
      break;
    case "name_za":
      out.sort((a, b) => (compareLocaleKo(b.name, a.name) !== 0 ? compareLocaleKo(b.name, a.name) : tie(a, b)));
      break;
    case "enh_high":
      out.sort(
        (a, b) =>
          (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0) || byTime(b, a) || tie(a, b),
      );
      break;
    case "enh_low":
      out.sort(
        (a, b) =>
          (a.enhanceLevel ?? 0) - (b.enhanceLevel ?? 0) || byTime(b, a) || tie(a, b),
      );
      break;
    case "grade_high":
      out.sort(
        (a, b) => (b.grade ?? 0) - (a.grade ?? 0) || compareLocaleKo(a.name, b.name) || tie(a, b),
      );
      break;
    case "grade_low":
      out.sort(
        (a, b) => (a.grade ?? 0) - (b.grade ?? 0) || compareLocaleKo(a.name, b.name) || tie(a, b),
      );
      break;
    default:
      break;
  }
  return out;
}

function sortArmorRows(rows: ArmorInstanceRow[], by: MaterialSortId): ArmorInstanceRow[] {
  const out = rows.slice();
  const tie = (a: ArmorInstanceRow, b: ArmorInstanceRow) => compareLocaleKo(a.id, b.id);
  const byTime = (a: ArmorInstanceRow, b: ArmorInstanceRow) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  switch (by) {
    case "qty_high":
    case "grade_high":
      out.sort(
        (a, b) => (b.grade ?? 0) - (a.grade ?? 0) || compareLocaleKo(a.name, b.name) || tie(a, b),
      );
      break;
    case "qty_low":
    case "grade_low":
      out.sort(
        (a, b) => (a.grade ?? 0) - (b.grade ?? 0) || compareLocaleKo(a.name, b.name) || tie(a, b),
      );
      break;
    case "name_az":
      out.sort((a, b) => (compareLocaleKo(a.name, b.name) !== 0 ? compareLocaleKo(a.name, b.name) : tie(a, b)));
      break;
    case "name_za":
      out.sort((a, b) => (compareLocaleKo(b.name, a.name) !== 0 ? compareLocaleKo(b.name, a.name) : tie(a, b)));
      break;
    case "id_az":
      out.sort((a, b) => tie(a, b));
      break;
    default:
      out.sort((a, b) => (byTime(b, a) !== 0 ? byTime(b, a) : tie(a, b)));
      break;
  }
  return out;
}

function sortMaterialRows(
  rows: MeState["inventory"],
  by: MaterialSortId,
): MeState["inventory"] {
  type Row = MeState["inventory"][number];
  const out = rows.slice();
  const tie = (a: Row, b: Row) => compareLocaleKo(a.itemId, b.itemId);
  switch (by) {
    case "qty_high":
      out.sort((a, b) => b.quantity - a.quantity || tie(a, b));
      break;
    case "qty_low":
      out.sort((a, b) => a.quantity - b.quantity || tie(a, b));
      break;
    case "name_az":
      out.sort((a, b) => (compareLocaleKo(a.name, b.name) !== 0 ? compareLocaleKo(a.name, b.name) : tie(a, b)));
      break;
    case "name_za":
      out.sort((a, b) => (compareLocaleKo(b.name, a.name) !== 0 ? compareLocaleKo(b.name, a.name) : tie(a, b)));
      break;
    case "grade_high":
      out.sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0) || tie(a, b));
      break;
    case "grade_low":
      out.sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0) || tie(a, b));
      break;
    case "id_az":
      out.sort((a, b) => tie(a, b));
      break;
    default:
      break;
  }
  return out;
}

type HatchApiOk = {
  ok: true;
  minion: MinionHatchResult["minion"];
  recruit: MinionHatchResult["recruit"];
  consumedItemId?: string;
  icon?: string | null;
  iconSrc?: string;
};

type RecruitCandidatesOk = {
  ok: true;
  minionKind: "GATHER" | "DUNGEON";
  ticketNameKo?: string;
  candidates: Array<{ candidateIndex: number; labelKo: string; baseStats: MinionHatchResult["minion"]["baseStats"] }>;
  pickToken: string;
};

type RecruitFlow = {
  step: "pick";
  itemId: string;
  name: string;
  candidates: Array<{ candidateIndex: number; labelKo: string; baseStats: MinionHatchResult["minion"]["baseStats"] }>;
  pickToken: string;
};

type BoxOpenReveal = {
  boxName: string;
  openedCount: number;
  produced: Array<{ itemId: string; itemName: string; qty: number }>;
};

export function InventoryPanel(props?: { onOpenMinions?: () => void } & EmbeddedPanelProps) {
  const embedded = props?.embedded ?? false;
  const router = useRouter();
  const { user, loading: sessionLoading } = useSessionUser();
  const [me, setMe] = useState<MeState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);

  const [tab, setTab] = useState<"WEAPONS" | "ARMOR" | "MATERIALS">("WEAPONS");
  const [q, setQ] = useState("");
  const [sortPrefs, setSortPrefs] = useState<SortPrefs>(DEFAULT_SORT_PREFS);
  const [viewMode, setViewMode] = useState<InventoryViewMode>(DEFAULT_VIEW_MODE);

  const [recruitReveal, setRecruitReveal] = useState<MinionHatchResult | null>(null);
  const [recruitFlow, setRecruitFlow] = useState<RecruitFlow | null>(null);
  const [boxOpenReveal, setBoxOpenReveal] = useState<BoxOpenReveal | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());

  const openForgeForEquip = useCallback(
    (kind: "weapon" | "armor", instanceId: string, mode: "enhance" | "craft" = "enhance") => {
      notifyOpenForge({ kind, instanceId, mode });
      router.push(routeForGameTab("enhance"));
    },
    [router],
  );

  async function refresh(force?: boolean) {
    setBusy("refresh");
    setError(null);
    try {
      if (!user) {
        setMe(null);
        return;
      }
      const [inv, weapons, armor] = await Promise.all([
        apiGetJsonCached<MeState>("/api/me/state?scope=inventory", {
          ttlMs: API_CACHE_TTL.meStateInventory,
          force,
        }),
        apiGetJsonCached<{ ok: true; weaponInstances?: MeState["weaponInstances"] }>(
          "/api/me/state?scope=weapons",
          { ttlMs: API_CACHE_TTL.meStateWeapons, force },
        ),
        apiGetJsonCached<{ ok: true; armorInstances?: MeState["armorInstances"] }>(
          "/api/me/state?scope=armor",
          { ttlMs: API_CACHE_TTL.meStateArmor, force },
        ),
      ]);
      const r: MeState = {
        ...inv,
        weaponInstances: weapons.weaponInstances,
        armorInstances: armor.armorInstances,
      };
      if (r?.ok) setMe(r);
      else setMe(null);
    } catch (e) {
      setMe(null);
      if (!isUnauthorizedError(e)) setError(e);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (sessionLoading) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionLoading]);

  useEffect(() => {
    if (!embedded) return;
    const onFrameRefresh = () => void refresh(true);
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);

  useEffect(() => {
    setSortPrefs(readSortPrefs());
    setViewMode(readViewMode());
  }, []);

  useEffect(() => {
    writeSortPrefs(sortPrefs);
  }, [sortPrefs]);

  useEffect(() => {
    writeViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nameById = useMemo(() => new Map((me?.inventory ?? []).map((x) => [x.itemId, x.name])), [me]);

  const inventoryErrorHint = useMemo(
    () => (error ? friendlyInventoryApiError(error, nameById) : ""),
    [error, nameById],
  );

  function renderCost(cost: { gold: number; materials: Array<{ itemId: string; quantity: number }> }) {
    const mats = cost.materials.map((m) => `${nameById.get(m.itemId) ?? m.itemId}x${m.quantity}`).join(", ");
    return `${fmtInt(cost.gold)}G${mats ? ` + ${mats}` : ""}`;
  }

  async function hatchMaterialItem(
    it: MeState["inventory"][number],
    category?: "GATHER" | "DUNGEON",
    candidateIndex?: number,
    pickToken?: string,
  ) {
    if (isMinionRecruitItemId(it.itemId) && !category && candidateIndex == null) {
      void startRecruitJobPick(it.itemId, it.name);
      return;
    }
    setBusy("hatch");
    setError(null);
    try {
      const r = await postJson<HatchApiOk>("/api/minions/hatch", {
        itemId: it.itemId,
        ...(category ? { category } : {}),
        ...(candidateIndex != null ? { candidateIndex } : {}),
        ...(pickToken ? { pickToken } : {}),
      });
      if (!r?.ok) throw r;
      setRecruitReveal({
        minion: r.minion,
        recruit: r.recruit,
        consumedItemId: it.itemId,
        icon: it.icon ?? r.icon,
        iconSrc: it.iconSrc ?? r.iconSrc,
      });
      setRecruitFlow(null);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function startRecruitJobPick(itemId: string, name: string) {
    setBusy("hatch");
    setError(null);
    try {
      const r = await postJson<RecruitCandidatesOk>("/api/minions/recruit/candidates", {
        itemId,
      });
      if (!r?.ok) throw r;
      setRecruitFlow({
        step: "pick",
        itemId,
        name,
        candidates: r.candidates,
        pickToken: r.pickToken,
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function toggleStackLock(it: MeState["inventory"][number], lock: boolean) {
    const locked = Math.max(0, it.lockedQuantity ?? 0);
    const available = it.availableQuantity ?? inventoryAvailableQty(it);
    const qty = lock ? available : locked;
    if (qty <= 0) return;

    setBusy(lock ? "lock" : "unlock");
    setError(null);
    try {
      const r = await postJson<{ ok: true }>(lock ? "/api/inventory/stack/lock" : "/api/inventory/stack/unlock", {
        itemId: it.itemId,
        quantity: qty,
      });
      if (!r?.ok) throw r;
      await refresh(true);
      window.dispatchEvent(new Event(GAME_FRAME_REFRESH_EVENT));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function toggleEquipLock(kind: "weapon" | "armor", instanceId: string, locked: boolean) {
    setBusy("equip-lock");
    setError(null);
    try {
      const r = await postJson<{ ok: true }>("/api/inventory/equipment-lock", {
        kind,
        instanceId,
        locked,
      });
      if (!r?.ok) throw r;
      await refresh(true);
      window.dispatchEvent(new Event(GAME_FRAME_REFRESH_EVENT));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function openLootBox(it: MeState["inventory"][number], quantity = 1) {
    setBusy("open-box");
    setError(null);
    try {
      const r = await postJson<{
        ok: true;
        openedCount: number;
        produced: Array<{ itemId: string; qty: number; itemName: string }>;
      }>("/api/inventory/open-box", {
        itemId: it.itemId,
        quantity,
      });
      if (!r?.ok) throw r;
      setBoxOpenReveal({
        boxName: it.name,
        openedCount: r.openedCount,
        produced: r.produced.map((p) => ({
          itemId: p.itemId,
          itemName: p.itemName,
          qty: p.qty,
        })),
      });
      await refresh();
      window.dispatchEvent(new Event(GAME_FRAME_REFRESH_EVENT));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const filteredArmorInstances = useMemo(() => {
    const rows = (me?.armorInstances ?? []) as ArmorInstanceRow[];
    const qq = q.trim().toLowerCase();
    const filtered = rows.filter((a) => {
      if (!qq) return true;
      return (
        a.name.toLowerCase().includes(qq) ||
        a.id.toLowerCase().includes(qq) ||
        a.baseItemId.toLowerCase().includes(qq)
      );
    });
    return sortArmorRows(
      filtered.map((a) => ({
        id: a.id,
        baseItemId: a.baseItemId,
        name: a.name,
        enhanceLevel: a.enhanceLevel ?? 0,
        createdAt: a.createdAt,
        grade: a.grade,
        gradeLabel: a.gradeLabel,
        icon: a.icon,
        iconSrc: a.iconSrc,
        options: a.options,
      })),
      sortPrefs.armor,
    );
  }, [me, q, sortPrefs.armor]);

  const filteredMaterials = useMemo(() => {
    const inv = me?.inventory ?? [];
    const qq = q.trim().toLowerCase();
    const filtered = inv
      .filter(
        (it) =>
          !isArmorInventoryItem(it) &&
          (it.category === "재료" ||
            it.category === "소비" ||
            it.category === "물약" ||
            isMinionRecruitCategory(it.category)),
      )
      .filter((it) => it.quantity > 0)
      .filter((it) => {
        if (!qq) return true;
        return it.name.toLowerCase().includes(qq) || it.itemId.toLowerCase().includes(qq);
      });
    return sortMaterialRows(filtered, sortPrefs.materials);
  }, [me, q, sortPrefs.materials]);

  const filteredWeapons = useMemo(() => {
    const rows = (me?.weaponInstances ?? []) as WeaponInstanceRow[];
    const qq = q.trim().toLowerCase();
    const filtered = rows.filter((w) => {
      if (!qq) return true;
      return (
        w.name.toLowerCase().includes(qq) ||
        w.id.toLowerCase().includes(qq) ||
        w.baseItemId.toLowerCase().includes(qq)
      );
    });
    return sortWeaponRows(filtered, sortPrefs.weapons);
  }, [me, q, sortPrefs.weapons]);

  const equipmentCapLabel = useMemo(() => {
    const owned = me?.equipment?.ownedCount;
    const max = me?.equipment?.maxOwned;
    if (owned == null || max == null) return null;
    return equipmentCapacityLabel(owned, max);
  }, [me?.equipment?.ownedCount, me?.equipment?.maxOwned]);

  const sessionReady = embedded || !sessionLoading;
  const loggedIn = !!user;

  return (
    <>
    <GamePanel className={`inventory-shell ${embedded ? "inventory-shell--fit" : ""}`}>

      {!sessionReady ? (
        <GamePanelLoading className="mt-4" label={busy ? "인벤토리를 불러오는 중…" : "세션을 확인하는 중…"} />
      ) : !embedded && !loggedIn ? (
        <GamePanelInfo className="mt-4">
          로그인하면 내 인벤토리가 표시됩니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.
        </GamePanelInfo>
      ) : !loggedIn ? null : !me ? (
        <div className="mt-4 space-y-3">
          {error ? (
            <GamePanelError error={error} />
          ) : (
            <GamePanelLoading label="인벤 데이터를 불러오는 중…" />
          )}
        </div>
      ) : (
        <>
          <div className="inventory-toolbar">
            <div className="inventory-toolbar-top">
              <div className="inventory-tabs">
              <button
                type="button"
                className={`inventory-tab ${tab === "WEAPONS" ? "inventory-tab--active" : ""}`}
                onClick={() => setTab("WEAPONS")}
              >
                무기
              </button>
              <button
                type="button"
                className={`inventory-tab ${tab === "ARMOR" ? "inventory-tab--active" : ""}`}
                onClick={() => setTab("ARMOR")}
              >
                방어구
              </button>
              <button
                type="button"
                className={`inventory-tab ${tab === "MATERIALS" ? "inventory-tab--active" : ""}`}
                onClick={() => setTab("MATERIALS")}
              >
                재료·고용권
              </button>
              {equipmentCapLabel ? (
                <span className="inventory-equipment-cap" title="무기·방어구 인스턴스 합산">
                  {equipmentCapLabel}
                </span>
              ) : null}
              </div>
              {!embedded ? (
                <GameBtn variant="ghost" disabled={!!busy} onClick={() => void refresh()}>
                  새로고침
                </GameBtn>
              ) : null}
            </div>
            <div className="inventory-filters flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1 md:max-w-[420px]">
                <label className="inventory-label">검색</label>
                <input
                  className="inventory-input mt-2"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={
                    tab === "WEAPONS"
                      ? "무기 이름 / 인스턴스ID / baseItemId"
                      : tab === "ARMOR"
                        ? "방어구 이름 / itemId"
                        : "재료 이름 / itemId"
                  }
                />
              </div>
              <div className="w-full min-w-[200px] md:w-[260px] md:max-w-[320px]">
                <label className="inventory-label">정렬</label>
                <select
                  className="inventory-input mt-2"
                  value={
                    tab === "WEAPONS"
                      ? sortPrefs.weapons
                      : tab === "ARMOR"
                        ? sortPrefs.armor
                        : sortPrefs.materials
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (tab === "WEAPONS") setSortPrefs((p) => ({ ...p, weapons: v as WeaponSortId }));
                    else if (tab === "ARMOR") setSortPrefs((p) => ({ ...p, armor: v as MaterialSortId }));
                    else setSortPrefs((p) => ({ ...p, materials: v as MaterialSortId }));
                  }}
                >
                  {tab === "WEAPONS" ? (
                    <>
                      <option value="newest">획득 순 · 최신</option>
                      <option value="oldest">획득 순 · 오래됨</option>
                      <option value="name_az">이름 가나다</option>
                      <option value="name_za">이름 역순</option>
                      <option value="enh_high">제련 높은 순</option>
                      <option value="enh_low">제련 낮은 순</option>
                      <option value="grade_high">등급 높은 순</option>
                      <option value="grade_low">등급 낮은 순</option>
                    </>
                  ) : tab === "ARMOR" || tab === "MATERIALS" ? (
                    <>
                      <option value="qty_high">수량 많은 순</option>
                      <option value="qty_low">수량 적은 순</option>
                      <option value="name_az">이름 가나다</option>
                      <option value="name_za">이름 역순</option>
                      <option value="grade_high">등급 높은 순</option>
                      <option value="grade_low">등급 낮은 순</option>
                      <option value="id_az">itemId 가나다</option>
                    </>
                  ) : null}
                </select>
              </div>
              <div className="w-full min-w-[200px] md:w-auto">
                <label className="inventory-label">보기</label>
                <div className="inventory-view-toggle mt-2">
                  <button
                    type="button"
                    className={`inventory-view-btn ${viewMode === "icons" ? "inventory-view-btn--active" : ""}`}
                    onClick={() => setViewMode("icons")}
                    title="아이콘만"
                  >
                    아이콘
                  </button>
                  <button
                    type="button"
                    className={`inventory-view-btn ${viewMode === "list" ? "inventory-view-btn--active" : ""}`}
                    onClick={() => setViewMode("list")}
                    title="상세 목록"
                  >
                    목록
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 space-y-2">
              {inventoryErrorHint ? (
                <div className="inventory-alert-warn rounded-xl px-3 py-2 text-sm">
                  {inventoryErrorHint}
                </div>
              ) : null}
              <GamePanelError error={error} />
            </div>
          ) : null}

          {tab === "WEAPONS" ? (
          <div className="inventory-section">
            <div>
              <div className="inventory-section-title">보유 무기</div>
              <div className="inventory-section-hint">
                무기·방어구 제련·감정·보석 가공은 <strong>대장간</strong>에서 할 수 있어요.
              </div>
            </div>

            <div className="forge-link-banner">
              감정 주문서·소멸/혼돈/봉인 보석 → 상단 메뉴 <strong>대장간</strong> → 「장비 가공」
            </div>

            {filteredWeapons.length === 0 ? (
              <div className="mt-3 text-sm text-[var(--game-muted)]">보유 무기가 없어.</div>
            ) : (
              <div className={inventoryListClassName(viewMode, "mt-3")}>
                {filteredWeapons.map((w) => {
                  const baseStatLine = weaponBaseStatLine(w.baseItemId);
                  const iconEl = (
                    <WeaponTooltipHover weapon={{ ...w, identified: w.identified }}>
                      <ItemIcon
                        itemId={w.baseItemId}
                        icon={w.icon}
                        iconSrc={w.iconSrc}
                        size={viewMode === "icons" ? 40 : 48}
                        className="shrink-0"
                      />
                    </WeaponTooltipHover>
                  );

                  if (viewMode === "icons") {
                    return (
                      <div key={w.id} className="inventory-item-cell">
                        {iconEl}
                        {w.enhanceLevel > 0 ? (
                          <span className="inventory-item-cell__badge">+{w.enhanceLevel}</span>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <div key={w.id} className={`inventory-item-card ${itemGradeFrameClassName(w.grade ?? 1)}`}>
                      {iconEl}
                      <div className="inventory-item-card__body min-w-0">
                        <div className="inventory-item-card__title">
                          <div className="flex flex-wrap items-baseline gap-0">
                            <span className={`inventory-item-card__name ${itemGradeNameClassName(w.grade ?? 1)}`}>
                              {weaponDisplayName({ ...w, identified: w.identified })}
                            </span>
                          </div>
                          {w.gradeLabel ? <span className="inventory-badge-grade">{w.gradeLabel}</span> : null}
                          {w.identified === false ? (
                            <span className="inventory-badge-cat">미감정</span>
                          ) : null}
                          {w.userLocked ? <span className="inventory-badge-lock">잠금</span> : null}
                        </div>
                        {viewMode === "list" ? (
                          <>
                            <div className="inventory-item-card__id">{w.id}</div>
                            <div className="inventory-item-card__meta">베이스: {w.baseItemId}</div>
                          </>
                        ) : null}
                        {baseStatLine ? (
                          <div className="inventory-item-card__meta">{baseStatLine}</div>
                        ) : null}
                        {viewMode === "list" ? renderEquipOptionChips(w.options ?? [], "weapon") : null}
                        {viewMode === "list" ? (
                          <div className="inventory-item-card__actions">
                            <GameBtn
                              variant="ghost"
                              className="inventory-btn-enhance"
                              disabled={!!w.userLocked}
                              onClick={() => openForgeForEquip("weapon", w.id, "enhance")}
                            >
                              대장간
                            </GameBtn>
                            <GameBtn
                              variant="ghost"
                              disabled={!!w.userLocked}
                              onClick={() => openForgeForEquip("weapon", w.id, "craft")}
                            >
                              가공
                            </GameBtn>
                            <GameBtn
                              variant="ghost"
                              disabled={!!busy}
                              onClick={() => void toggleEquipLock("weapon", w.id, !w.userLocked)}
                            >
                              {w.userLocked ? "잠금 해제" : "잠금"}
                            </GameBtn>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}

          {tab === "ARMOR" ? (
          <div className="inventory-section">
            <div>
              <div className="inventory-section-title">보유 방어구</div>
              <div className="inventory-section-hint">
                방어구 옵션 가공은 <strong>대장간</strong> → 「장비 가공」. 착용은 미니언 관리 → 「장비 착용」.
              </div>
            </div>

            <div className="forge-link-banner">
              감정·보석 작업 → <strong>대장간</strong> → 「장비 가공」에서 무기·방어구를 선택하세요.
            </div>

            {filteredArmorInstances.length === 0 ? (
              <div className="mt-3 text-sm text-[var(--game-muted)]">보유 방어구가 없어. 대장간에서 제작해 보세요.</div>
            ) : (
              <div className={inventoryListClassName(viewMode, "mt-3")}>
                {filteredArmorInstances.map((a) => {
                  const stats = getArmorStats(a.baseItemId);
                  const slotLabel = stats ? armorSlotLabelKo(stats.slot) : null;
                  const iconEl = (
                    <ItemIcon
                      itemId={a.baseItemId}
                      icon={a.icon}
                      iconSrc={a.iconSrc}
                      size={viewMode === "icons" ? 40 : 48}
                      className="shrink-0"
                    />
                  );

                  if (viewMode === "icons") {
                    return (
                      <div key={a.id} className="inventory-item-cell">
                        {iconEl}
                        {a.enhanceLevel > 0 ? (
                          <span className="inventory-item-cell__badge">+{a.enhanceLevel}</span>
                        ) : (a.options?.length ?? 0) > 0 ? (
                          <span className="inventory-item-cell__badge inventory-item-cell__badge--dot" />
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <div key={a.id} className={`inventory-item-card ${itemGradeFrameClassName(a.grade ?? 1)}`}>
                      {iconEl}
                      <div className="inventory-item-card__body min-w-0">
                        <div className="inventory-item-card__title">
                          <div className="flex flex-wrap items-baseline gap-0">
                            <span className={`inventory-item-card__name ${itemGradeNameClassName(a.grade ?? 1)}`}>
                              {armorDisplayName({ ...a, identified: a.identified })}
                            </span>
                          </div>
                          {a.gradeLabel ? <span className="inventory-badge-grade">{a.gradeLabel}</span> : null}
                          {slotLabel ? <span className="inventory-badge-cat">{slotLabel}</span> : null}
                          {a.identified === false ? (
                            <span className="inventory-badge-cat">미감정</span>
                          ) : null}
                          {a.userLocked ? <span className="inventory-badge-lock">잠금</span> : null}
                        </div>
                        {viewMode === "list" ? (
                          <>
                            <div className="inventory-item-card__id">{a.id}</div>
                            <div className="inventory-item-card__meta">베이스: {a.baseItemId}</div>
                          </>
                        ) : null}
                        {stats ? (
                          <div className="inventory-item-card__meta">
                            HP +{stats.hp} · DEF +{stats.def}
                          </div>
                        ) : null}
                        {viewMode === "list" ? renderEquipOptionChips(a.options ?? [], "armor") : null}
                        {viewMode === "list" ? (
                          <div className="inventory-item-card__actions">
                            <GameBtn
                              variant="ghost"
                              className="inventory-btn-enhance"
                              disabled={!!a.userLocked}
                              onClick={() => openForgeForEquip("armor", a.id, "enhance")}
                            >
                              대장간
                            </GameBtn>
                            <GameBtn
                              variant="ghost"
                              disabled={!!a.userLocked}
                              onClick={() => openForgeForEquip("armor", a.id, "craft")}
                            >
                              가공
                            </GameBtn>
                            <GameBtn
                              variant="ghost"
                              disabled={!!busy}
                              onClick={() => void toggleEquipLock("armor", a.id, !a.userLocked)}
                            >
                              {a.userLocked ? "잠금 해제" : "잠금"}
                            </GameBtn>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}

          {tab === "MATERIALS" ? (
          <div className={inventoryListClassName(viewMode)}>
            {filteredMaterials.length === 0 ? (
              <div className="text-sm text-[var(--game-muted)] inventory-item-list__empty">
                재료가 없어. (마을 수령/구매/시드 후)
              </div>
            ) : (
              filteredMaterials.map((it) => {
                const canRecruit = false;
                const canOpenBox = isLootBoxItemId(it.itemId);
                const lockedQty = Math.max(0, it.lockedQuantity ?? 0);
                const availableQty = it.availableQuantity ?? inventoryAvailableQty(it);
                const icon = (
                  <ItemIcon
                    itemId={it.itemId}
                    icon={it.icon}
                    iconSrc={it.iconSrc}
                    size={viewMode === "icons" ? 40 : 48}
                    className="shrink-0"
                  />
                );
                const iconWithTooltip = shouldShowStackItemTooltip(it) ? (
                  <StackItemTooltipHover item={it}>{icon}</StackItemTooltipHover>
                ) : (
                  icon
                );

                if (viewMode === "icons") {
                  return (
                    <div
                      key={it.itemId}
                      className={`inventory-item-cell inventory-item-cell--stack ${lockedQty > 0 ? "inventory-item-cell--locked" : ""}`}
                    >
                      {iconWithTooltip}
                      {lockedQty > 0 ? (
                        <span className="inventory-item-cell__lock" title={`잠금 ${lockedQty}개`} aria-hidden>
                          🔒
                        </span>
                      ) : null}
                      {it.quantity > 1 ? (
                        <span className="inventory-item-cell__badge">{fmtInt(it.quantity)}</span>
                      ) : null}
                      {canRecruit ? (
                        <button
                          type="button"
                          className="inventory-item-cell__action"
                          disabled={!!busy}
                          onClick={() => void hatchMaterialItem(it)}
                        >
                          고용
                        </button>
                      ) : canOpenBox && availableQty > 0 ? (
                        <button
                          type="button"
                          className="inventory-item-cell__action"
                          disabled={!!busy}
                          onClick={() => void openLootBox(it, 1)}
                        >
                          개봉
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inventory-item-cell__action inventory-item-cell__action--lock"
                        disabled={!!busy || (lockedQty <= 0 && availableQty <= 0)}
                        title={lockedQty > 0 ? "잠금 해제" : "전체 잠금"}
                        onClick={() => void toggleStackLock(it, lockedQty <= 0)}
                      >
                        {lockedQty > 0 ? "해제" : "잠금"}
                      </button>
                    </div>
                  );
                }

                return (
                <div
                  key={it.itemId}
                  className={`inventory-item-card ${lockedQty > 0 ? "inventory-item-card--locked" : ""}`}
                >
                  {iconWithTooltip}
                  <div className="inventory-item-card__body min-w-0">
                    <div className="inventory-item-card__title">
                      <div className={`inventory-item-card__name ${itemGradeNameClassName(it.grade ?? 1)}`}>{it.name}</div>
                      {it.gradeLabel ? <span className="inventory-badge-grade">{it.gradeLabel}</span> : null}
                      {viewMode === "list" ? <span className="inventory-badge-cat">{it.category}</span> : null}
                    </div>
                    <div className="inventory-item-card__meta">
                      수량 <span className="font-semibold text-[var(--game-text)]">{fmtInt(it.quantity)}</span>
                      {lockedQty > 0 ? (
                        <span className="inventory-lock-meta">
                          · 사용 가능 {fmtInt(availableQty)} · 잠금 {fmtInt(lockedQty)}
                        </span>
                      ) : null}
                    </div>
                    {viewMode === "list" ? <div className="inventory-item-card__id">{it.itemId}</div> : null}
                  </div>
                  <div className="inventory-item-card__actions">
                    {canRecruit ? (
                      <button
                        type="button"
                        className="inventory-btn inventory-btn-violet h-10 px-4 text-sm disabled:opacity-50"
                        disabled={!!busy}
                        onClick={() => void hatchMaterialItem(it)}
                      >
                        미니언 고용
                      </button>
                    ) : null}
                    {canOpenBox && availableQty > 0 ? (
                      <>
                        <button
                          type="button"
                          className="inventory-btn inventory-btn-violet h-10 px-4 text-sm disabled:opacity-50"
                          disabled={!!busy}
                          onClick={() => void openLootBox(it, 1)}
                        >
                          개봉
                        </button>
                        {availableQty > 1 ? (
                          <button
                            type="button"
                            className="inventory-btn h-10 px-3 text-sm disabled:opacity-50"
                            disabled={!!busy}
                            onClick={() => void openLootBox(it, Math.min(availableQty, 10))}
                          >
                            {Math.min(availableQty, 10)}개
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="inventory-btn h-10 px-3 text-sm disabled:opacity-50"
                      disabled={!!busy || (lockedQty <= 0 && availableQty <= 0)}
                      onClick={() => void toggleStackLock(it, lockedQty <= 0)}
                    >
                      {lockedQty > 0 ? "잠금 해제" : "잠금"}
                    </button>
                  </div>
                </div>
              );
              })
            )}
          </div>
          ) : null}


          {!embedded ? (
          <div className="inventory-notice text-sm">
            판매 등록·관리는 거래소의 <span className="font-semibold">판매</span> / <span className="font-semibold">내 판매</span> 탭에서 할 수 있어.
          </div>
          ) : null}
        </>
      )}

      

      {/* 내 판매중 매물의 수정/정산/취소는 거래소(내 판매 물품 탭)에서 진행 */}
    </GamePanel>

      {recruitReveal ? (
        <MinionRecruitReveal
          result={recruitReveal}
          onClose={() => setRecruitReveal(null)}
          onViewMinions={props?.onOpenMinions}
        />
      ) : null}

      {recruitFlow?.step === "pick" ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4">
          <div className="game-panel w-full max-w-md p-5">
            <div className="text-lg font-semibold text-[var(--game-text)]">미니언 선택</div>
            <p className="mt-2 text-sm text-[var(--game-muted)]">
              {recruitFlow.name} — 스탯에 따라 검술 클래스가 정해집니다. (나무 검 지급) Lv30·70 전직은 미니언 관리에서
              진행합니다.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {recruitFlow.candidates.map((c) => (
                <GameBtn
                  key={c.candidateIndex}
                  variant="primary"
                  disabled={!!busy}
                  onClick={() => {
                    const it = (me?.inventory ?? []).find((x) => x.itemId === recruitFlow.itemId);
                    if (it) {
                      void hatchMaterialItem(it, "DUNGEON", c.candidateIndex, recruitFlow.pickToken);
                    }
                  }}
                >
                  {c.labelKo}
                </GameBtn>
              ))}
              <GameBtn variant="ghost" disabled={!!busy} onClick={() => setRecruitFlow(null)}>
                취소
              </GameBtn>
            </div>
          </div>
        </div>
      ) : null}

      {boxOpenReveal ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4">
          <div className="game-panel w-full max-w-md p-5">
            <div className="text-lg font-semibold text-[var(--game-text)]">상자 개봉</div>
            <p className="mt-2 text-sm text-[var(--game-muted)]">
              {boxOpenReveal.boxName} × {fmtInt(boxOpenReveal.openedCount)}
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {boxOpenReveal.produced.map((p) => (
                <li
                  key={p.itemId}
                  className="flex items-center justify-between rounded-lg border border-[var(--game-border)] px-3 py-2 text-sm"
                >
                  <span className="font-medium text-[var(--game-text)]">{p.itemName}</span>
                  <span className="tabular-nums font-semibold text-[var(--game-accent)]">×{fmtInt(p.qty)}</span>
                </li>
              ))}
            </ul>
            <GameBtn variant="primary" className="mt-5 w-full" onClick={() => setBoxOpenReveal(null)}>
              확인
            </GameBtn>
          </div>
        </div>
      ) : null}
    </>
  );
}

