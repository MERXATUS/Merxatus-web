"use client";

import { useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { StackItemTooltipHover } from "@/app/_components/StackItemTooltip";
import { ToolTooltipHover } from "@/app/_components/ToolTooltip";
import { WeaponTooltipHover } from "@/app/_components/WeaponTooltip";
import { shouldShowStackItemTooltip } from "@/shared/stackItemTooltip";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { MinionRecruitReveal } from "@/app/_components/MinionRecruitReveal";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { isUnauthorizedError } from "@/shared/sessionClient";
import {
  isMinionRecruitCategory,
  isMinionRecruitItemId,
  type MinionHatchResult,
} from "@/shared/minionRecruit";

type MeState = {
  ok: true;
  wallet: { goldAvailable: number; goldLocked: number };
  inventory: Array<{
    itemId: string;
    name: string;
    category: string;
    quantity: number;
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
    createdAt: string;
    grade?: number;
    gradeLabel?: string;
    icon?: string | null;
    iconSrc?: string;
    options?: Array<{ kind: string; label: string; tier: number; tierLabel: string; displayValue: number }>;
  }>;
  toolInstances?: Array<{
    id: string;
    baseItemId: string;
    name: string;
    createdAt: string;
    grade?: number;
    gradeLabel?: string;
    icon?: string | null;
    iconSrc?: string;
    options?: Array<{ kind: string; label: string; tier: number; tierLabel: string; displayValue: number }>;
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
  grade?: number;
  gradeLabel?: string;
  icon?: string | null;
  iconSrc?: string;
  options?: Array<{ kind: string; label: string; tier: number; tierLabel: string; displayValue: number }>;
};

type ToolInstanceRow = {
  id: string;
  baseItemId: string;
  name: string;
  createdAt: string;
  grade?: number;
  gradeLabel?: string;
  icon?: string | null;
  iconSrc?: string;
  options?: Array<{ kind: string; label: string; tier: number; tierLabel: string; displayValue: number }>;
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

const MATERIAL_FALLBACK_KO: Record<string, string> = {
  item_stone: "돌",
  item_ore: "광석",
};

function friendlyInventoryApiError(e: unknown, itemNameById: Map<string, string>): string {
  const o = e as { error?: string };
  const err = o?.error;
  if (typeof err !== "string") return "";
  if (err === "INSUFFICIENT_GOLD") return "골드가 부족해.";
  if (err === "MAX_WEAPON_LEVEL") return "이미 최대 강화 단계야.";
  if (err === "WEAPON_INSTANCE_NOT_FOUND") return "무기를 찾을 수 없어.";
  if (err === "NOT_A_WEAPON") return "무기만 강화할 수 있어.";
  if (err === "WEAPON_LOCKED") return "이 무기는 등록 중이라 강화할 수 없어.";
  if (err === "WALLET_NOT_FOUND") return "지갑 정보를 찾을 수 없어.";
  if (err === "NO_RECRUIT_TICKET") return "미니언 고용권이 부족해. 던전·거래소에서 구해 와.";
  if (err === "MAX_MINION_OWNED" || err === "MAX_GATHER_MINION_OWNED")
    return "수집 미니언은 최대 10마리까지 보유할 수 있어.";
  if (err === "MAX_DUNGEON_MINION_OWNED") return "던전 미니언은 최대 10마리까지 보유할 수 있어.";
  if (err.startsWith("INSUFFICIENT_MATERIAL:")) {
    const id = err.slice("INSUFFICIENT_MATERIAL:".length);
    const label = itemNameById.get(id) ?? MATERIAL_FALLBACK_KO[id] ?? id;
    return `재료가 부족해: ${label} (${id}). 광산 수령·제작·거래소에서 구한 뒤 다시 시도해.`;
  }
  return "";
}

const INV_SORT_STORAGE_KEY = "inv_sort_prefs_v1";
const INV_VIEW_MODE_KEY = "inv_view_mode_v1";

type InventoryViewMode = "icons" | "grid2" | "list";

const DEFAULT_VIEW_MODE: InventoryViewMode = "list";

function readViewMode(): InventoryViewMode {
  if (typeof window === "undefined") return DEFAULT_VIEW_MODE;
  try {
    const raw = localStorage.getItem(INV_VIEW_MODE_KEY);
    if (raw === "icons" || raw === "grid2" || raw === "list") return raw;
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

type ToolSortId = "newest" | "oldest" | "name_az" | "name_za" | "grade_high" | "grade_low";

type MaterialSortId = "qty_high" | "qty_low" | "name_az" | "name_za" | "grade_high" | "grade_low" | "id_az";

type SortPrefs = { weapons: WeaponSortId; tools: ToolSortId; materials: MaterialSortId };

const DEFAULT_SORT_PREFS: SortPrefs = {
  weapons: "newest",
  tools: "newest",
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

function sortToolRows(rows: ToolInstanceRow[], by: ToolSortId): ToolInstanceRow[] {
  const out = rows.slice();
  const tie = (a: ToolInstanceRow, b: ToolInstanceRow) => compareLocaleKo(a.id, b.id);
  const byTime = (a: ToolInstanceRow, b: ToolInstanceRow) =>
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
  candidates: Array<{ jobType: string; labelKo: string }>;
  pickToken: string;
};

type RecruitFlow =
  | { step: "category"; itemId: string; name: string }
  | {
      step: "job";
      itemId: string;
      name: string;
      category: "GATHER" | "DUNGEON";
      candidates: Array<{ jobType: string; labelKo: string }>;
      pickToken: string;
    };

export function InventoryPanel(props?: { onOpenMinions?: () => void }) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [me, setMe] = useState<MeState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);

  const [tab, setTab] = useState<"WEAPONS" | "TOOLS" | "MATERIALS">("WEAPONS");
  const [q, setQ] = useState("");
  const [sortPrefs, setSortPrefs] = useState<SortPrefs>(DEFAULT_SORT_PREFS);
  const [viewMode, setViewMode] = useState<InventoryViewMode>(DEFAULT_VIEW_MODE);

  const [recruitReveal, setRecruitReveal] = useState<MinionHatchResult | null>(null);
  const [recruitFlow, setRecruitFlow] = useState<RecruitFlow | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());

  async function refresh() {
    setBusy("refresh");
    setError(null);
    try {
      if (!user) {
        setMe(null);
        return;
      }
      const r = await getJson<MeState>("/api/me/state");
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
    jobType?: string,
    pickToken?: string,
  ) {
    if (isMinionRecruitItemId(it.itemId) && !category) {
      setRecruitFlow({ step: "category", itemId: it.itemId, name: it.name });
      return;
    }
    setBusy("hatch");
    setError(null);
    try {
      const r = await postJson<HatchApiOk>("/api/minions/hatch", {
        itemId: it.itemId,
        ...(category ? { category } : {}),
        ...(jobType ? { jobType } : {}),
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

  async function startRecruitJobPick(itemId: string, name: string, category: "GATHER" | "DUNGEON") {
    setBusy("hatch");
    setError(null);
    try {
      const r = await postJson<RecruitCandidatesOk>("/api/minions/recruit/candidates", {
        itemId,
        category,
      });
      if (!r?.ok) throw r;
      setRecruitFlow({
        step: "job",
        itemId,
        name,
        category,
        candidates: r.candidates,
        pickToken: r.pickToken,
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const filteredMaterials = useMemo(() => {
    const inv = me?.inventory ?? [];
    const qq = q.trim().toLowerCase();
    const filtered = inv
      .filter(
        (it) =>
          it.category === "재료" ||
          it.category === "소비" ||
          it.category === "물약" ||
          isMinionRecruitCategory(it.category),
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

  const filteredTools = useMemo(() => {
    const rows = (me?.toolInstances ?? []) as ToolInstanceRow[];
    const qq = q.trim().toLowerCase();
    const filtered = rows.filter((t) => {
      if (!qq) return true;
      return (
        t.name.toLowerCase().includes(qq) ||
        t.id.toLowerCase().includes(qq) ||
        t.baseItemId.toLowerCase().includes(qq)
      );
    });
    return sortToolRows(filtered, sortPrefs.tools);
  }, [me, q, sortPrefs.tools]);

  const sessionReady = !sessionLoading;
  const loggedIn = !!user;

  return (
    <>
    <GamePanel className="inventory-shell">

      {!sessionReady ? (
        <GamePanelLoading className="mt-4" label={busy ? "인벤토리를 불러오는 중…" : "세션을 확인하는 중…"} />
      ) : !loggedIn ? (
        <GamePanelInfo className="mt-4">
          로그인하면 내 인벤토리가 표시됩니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.
        </GamePanelInfo>
      ) : !me ? (
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
                className={`inventory-tab ${tab === "TOOLS" ? "inventory-tab--active" : ""}`}
                onClick={() => setTab("TOOLS")}
              >
                도구
              </button>
              <button
                type="button"
                className={`inventory-tab ${tab === "MATERIALS" ? "inventory-tab--active" : ""}`}
                onClick={() => setTab("MATERIALS")}
              >
                재료·고용권
              </button>
              </div>
              <GameBtn variant="ghost" disabled={!!busy} onClick={() => void refresh()}>
                새로고침
              </GameBtn>
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
                      : tab === "TOOLS"
                        ? "도구 이름 / 인스턴스ID / baseItemId"
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
                      : tab === "TOOLS"
                        ? sortPrefs.tools
                        : sortPrefs.materials
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (tab === "WEAPONS") setSortPrefs((p) => ({ ...p, weapons: v as WeaponSortId }));
                    else if (tab === "TOOLS") setSortPrefs((p) => ({ ...p, tools: v as ToolSortId }));
                    else setSortPrefs((p) => ({ ...p, materials: v as MaterialSortId }));
                  }}
                >
                  {tab === "WEAPONS" ? (
                    <>
                      <option value="newest">획득 순 · 최신</option>
                      <option value="oldest">획득 순 · 오래됨</option>
                      <option value="name_az">이름 가나다</option>
                      <option value="name_za">이름 역순</option>
                      <option value="enh_high">강화 높은 순</option>
                      <option value="enh_low">강화 낮은 순</option>
                      <option value="grade_high">등급 높은 순</option>
                      <option value="grade_low">등급 낮은 순</option>
                    </>
                  ) : tab === "TOOLS" ? (
                    <>
                      <option value="newest">획득 순 · 최신</option>
                      <option value="oldest">획득 순 · 오래됨</option>
                      <option value="name_az">이름 가나다</option>
                      <option value="name_za">이름 역순</option>
                      <option value="grade_high">등급 높은 순</option>
                      <option value="grade_low">등급 낮은 순</option>
                    </>
                  ) : (
                    <>
                      <option value="qty_high">수량 많은 순</option>
                      <option value="qty_low">수량 적은 순</option>
                      <option value="name_az">이름 가나다</option>
                      <option value="name_za">이름 역순</option>
                      <option value="grade_high">등급 높은 순</option>
                      <option value="grade_low">등급 낮은 순</option>
                      <option value="id_az">itemId 가나다</option>
                    </>
                  )}
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
                    className={`inventory-view-btn ${viewMode === "grid2" ? "inventory-view-btn--active" : ""}`}
                    onClick={() => setViewMode("grid2")}
                    title="한 줄에 2개"
                  >
                    2열
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
                무기 목록 확인용이에요. 강화는 「강화소」, 판매는 거래소 「판매」 탭에서.
              </div>
            </div>

            {filteredWeapons.length === 0 ? (
              <div className="mt-3 text-sm text-[var(--game-muted)]">보유 무기가 없어.</div>
            ) : (
              <div className={inventoryListClassName(viewMode, "mt-3")}>
                {filteredWeapons.map((w) => {
                  const iconEl = (
                    <WeaponTooltipHover weapon={w}>
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
                    <div
                      key={w.id}
                      className={`inventory-item-card${viewMode === "grid2" ? " inventory-item-card--compact" : ""}`}
                    >
                      {iconEl}
                      <div className="inventory-item-card__body min-w-0">
                        <div className="inventory-item-card__title">
                          <div className="flex flex-wrap items-baseline gap-0">
                            <span className={`inventory-item-card__name ${itemGradeNameClassName(w.grade ?? 1)}`}>
                              {w.name}
                            </span>
                            {w.enhanceLevel > 0 ? (
                              <span className="text-[var(--game-muted)]">{` +${w.enhanceLevel}`}</span>
                            ) : null}
                          </div>
                          {w.gradeLabel ? <span className="inventory-badge-grade">{w.gradeLabel}</span> : null}
                        </div>
                        {viewMode === "list" ? (
                          <>
                            <div className="inventory-item-card__id">{w.id}</div>
                            <div className="inventory-item-card__meta">베이스: {w.baseItemId}</div>
                          </>
                        ) : null}
                        {(w.options?.length ?? 0) > 0 && viewMode === "list" ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(w.options ?? []).map((op, i) => (
                              <span
                                key={`${op.kind}-${i}`}
                                className="inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[11px] inventory-option-emerald"
                                title={`${op.label} · ${op.tierLabel}`}
                              >
                                <span className="font-semibold">{op.tierLabel}</span>
                                <span className="truncate">{op.label}</span>
                                <span className="tabular-nums font-semibold">
                                  {op.displayValue >= 0 ? "+" : ""}
                                  {op.displayValue}
                                </span>
                              </span>
                            ))}
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

          {tab === "TOOLS" ? (
            <div className="inventory-section">
              <div>
                <div className="inventory-section-title">보유 도구</div>
                <div className="inventory-section-hint">
                  낚싯대·곡괭이·낫 등은 개별 인스턴스로 보관되며 제작 시 옵션이 붙어.
                </div>
              </div>

              {filteredTools.length === 0 ? (
                <div className="mt-3 text-sm text-[var(--game-muted)]">보유 도구가 없어.</div>
              ) : (
                <div className={inventoryListClassName(viewMode, "mt-3")}>
                  {filteredTools.map((t) => {
                    const iconEl = (
                      <ToolTooltipHover tool={t}>
                        <ItemIcon
                          itemId={t.baseItemId}
                          icon={t.icon}
                          iconSrc={t.iconSrc}
                          size={viewMode === "icons" ? 40 : 48}
                          className="shrink-0"
                        />
                      </ToolTooltipHover>
                    );

                    if (viewMode === "icons") {
                      return (
                        <div key={t.id} className="inventory-item-cell">
                          {iconEl}
                          {(t.options?.length ?? 0) > 0 ? (
                            <span className="inventory-item-cell__badge inventory-item-cell__badge--dot" />
                          ) : null}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={t.id}
                        className={`inventory-item-card${viewMode === "grid2" ? " inventory-item-card--compact" : ""}`}
                      >
                        {iconEl}
                        <div className="inventory-item-card__body min-w-0">
                          <div className="inventory-item-card__title">
                            <div className={`inventory-item-card__name ${itemGradeNameClassName(t.grade ?? 1)}`}>
                              {t.name}
                            </div>
                            {t.gradeLabel ? <span className="inventory-badge-grade">{t.gradeLabel}</span> : null}
                          </div>
                          {viewMode === "list" ? (
                            <>
                              <div className="inventory-item-card__id">{t.id}</div>
                              <div className="inventory-item-card__meta">베이스: {t.baseItemId}</div>
                            </>
                          ) : null}
                          {(t.options?.length ?? 0) > 0 && viewMode === "list" ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {(t.options ?? []).map((op, i) => (
                                <span
                                  key={`${op.kind}-${i}`}
                                  className="inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[11px] inventory-option-sky"
                                  title={`${op.label} · ${op.tierLabel}`}
                                >
                                  <span className="font-semibold">{op.tierLabel}</span>
                                  <span className="truncate">{op.label}</span>
                                  <span className="tabular-nums font-semibold">
                                    {op.displayValue >= 0 ? "+" : ""}
                                    {op.displayValue}
                                  </span>
                                </span>
                              ))}
                            </div>
                          ) : viewMode === "list" ? (
                            <div className="inventory-item-card__meta">옵션 없음</div>
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
                const canRecruit = isMinionRecruitItemId(it.itemId) || isMinionRecruitCategory(it.category);
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
                    <div key={it.itemId} className="inventory-item-cell inventory-item-cell--stack">
                      {iconWithTooltip}
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
                      ) : null}
                    </div>
                  );
                }

                return (
                <div
                  key={it.itemId}
                  className={`inventory-item-card${viewMode === "grid2" ? " inventory-item-card--compact" : ""}`}
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
                  </div>
                </div>
              );
              })
            )}
          </div>
          ) : null}


          <div className="inventory-notice text-sm">
            판매 등록·관리는 거래소의 <span className="font-semibold">판매</span> / <span className="font-semibold">내 판매</span> 탭에서 할 수 있어.
          </div>
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

      {recruitFlow?.step === "category" ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4">
          <div className="game-panel w-full max-w-sm p-5">
            <div className="text-lg font-semibold text-[var(--game-text)]">미니언 고용</div>
            <p className="mt-2 text-sm text-[var(--game-muted)]">
              {recruitFlow.name} — 수집용 또는 전투용 중 선택하세요.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <GameBtn
                variant="primary"
                disabled={!!busy}
                onClick={() => void startRecruitJobPick(recruitFlow.itemId, recruitFlow.name, "GATHER")}
              >
                수집 미니언
              </GameBtn>
              <GameBtn
                variant="primary"
                disabled={!!busy}
                onClick={() => void startRecruitJobPick(recruitFlow.itemId, recruitFlow.name, "DUNGEON")}
              >
                전투 미니언
              </GameBtn>
              <GameBtn variant="ghost" disabled={!!busy} onClick={() => setRecruitFlow(null)}>
                취소
              </GameBtn>
            </div>
          </div>
        </div>
      ) : null}

      {recruitFlow?.step === "job" ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4">
          <div className="game-panel w-full max-w-md p-5">
            <div className="text-lg font-semibold text-[var(--game-text)]">미니언 선택</div>
            <p className="mt-2 text-sm text-[var(--game-muted)]">
              {recruitFlow.name} — 아래 후보 중 한 명을 고르세요.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {recruitFlow.candidates.map((c) => (
                <GameBtn
                  key={c.jobType}
                  variant="primary"
                  disabled={!!busy}
                  onClick={() => {
                    const it = (me?.inventory ?? []).find((x) => x.itemId === recruitFlow.itemId);
                    if (it) {
                      void hatchMaterialItem(it, recruitFlow.category, c.jobType, recruitFlow.pickToken);
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
    </>
  );
}

