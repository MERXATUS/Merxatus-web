"use client";

import { useEffect, useMemo, useState } from "react";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { GAME_RULES } from "@/server/gameRules";
import { weaponUpgradeCostForNextLevel } from "@/server/weaponUpgradeRules";

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
  }>;
  weaponInstances?: Array<{
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    createdAt: string;
    grade?: number;
    gradeLabel?: string;
    options?: Array<{ kind: string; label: string; tier: number; tierLabel: string; displayValue: number }>;
  }>;
  toolInstances?: Array<{
    id: string;
    baseItemId: string;
    name: string;
    createdAt: string;
    grade?: number;
    gradeLabel?: string;
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
  options?: Array<{ kind: string; label: string; tier: number; tierLabel: string; displayValue: number }>;
};

type ToolInstanceRow = {
  id: string;
  baseItemId: string;
  name: string;
  createdAt: string;
  grade?: number;
  gradeLabel?: string;
  options?: Array<{ kind: string; label: string; tier: number; tierLabel: string; displayValue: number }>;
};

type MarketStats = {
  ok: true;
  summary: {
    lastUnitPrice: number | null;
    avgUnitPrice: number | null;
    referenceGoldPerUnit?: number;
  };
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
  if (err === "NO_MINION_EGG") return "미니언 알이 부족해. 던전에서 드랍되거나 시장에서 구해 와.";
  if (err === "MAX_MINION_OWNED") return `미니언은 최대 보유 수까지 만들 수 있어. (현재 규칙 상한 적용)`;
  if (err.startsWith("INSUFFICIENT_MATERIAL:")) {
    const id = err.slice("INSUFFICIENT_MATERIAL:".length);
    const label = itemNameById.get(id) ?? MATERIAL_FALLBACK_KO[id] ?? id;
    return `재료가 부족해: ${label} (${id}). 광산 수령·제작·시장에서 구한 뒤 다시 시도해.`;
  }
  return "";
}

const INV_SORT_STORAGE_KEY = "inv_sort_prefs_v1";

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

function nextWeaponUpgradeLine(
  enhanceLevel: number,
  itemNameById: Map<string, string>,
): { text: string; atMax: boolean } {
  const cur = Math.max(0, Math.floor(enhanceLevel));
  const max = GAME_RULES.weaponUpgrade.maxLevel;
  if (cur >= max) return { text: `최대 +${max} 강화까지 도달`, atMax: true };
  try {
    const cost = weaponUpgradeCostForNextLevel(cur);
    const parts: string[] = [`${fmtInt(cost.gold)}G`];
    for (const m of cost.materials) {
      const nm = itemNameById.get(m.itemId) ?? MATERIAL_FALLBACK_KO[m.itemId] ?? m.itemId;
      parts.push(`${nm}×${m.quantity}`);
    }
    return { text: `+${cur + 1} 강화 비용: ${parts.join(" · ")}`, atMax: false };
  } catch {
    return { text: "", atMax: false };
  }
}

export function InventoryPanel() {
  const [me, setMe] = useState<MeState | null>(null);
  /** 세션 확인 전·후: undefined = 아직 확인 안 함, null = 비로그인, 객체 = 로그인됨 */
  const [sessionUser, setSessionUser] = useState<{ id: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);

  const [tab, setTab] = useState<"WEAPONS" | "TOOLS" | "MATERIALS">("WEAPONS");
  const [q, setQ] = useState("");
  const [sortPrefs, setSortPrefs] = useState<SortPrefs>(DEFAULT_SORT_PREFS);

  const [sellOpen, setSellOpen] = useState(false);
  const [sellItem, setSellItem] = useState<MeState["inventory"][number] | null>(null);
  const [sellWeapon, setSellWeapon] = useState<WeaponInstanceRow | null>(null);
  const [sellQty, setSellQty] = useState(1);
  const [sellType, setSellType] = useState<"FIXED" | "AUCTION">("FIXED");
  const [sellPriceMode, setSellPriceMode] = useState<"UNIT" | "TOTAL">("UNIT");
  const [sellUnitPrice, setSellUnitPrice] = useState(10);
  const [sellTotalPrice, setSellTotalPrice] = useState(10);
  const [sellStartPrice, setSellStartPrice] = useState(100);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestedUnit, setSuggestedUnit] = useState<number | null>(null);
  const [enhBusyId, setEnhBusyId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editListing, setEditListing] = useState<MeState["myListings"][number] | null>(null);
  const [editFixedUnit, setEditFixedUnit] = useState(10);
  const [editFixedTotal, setEditFixedTotal] = useState(100);
  const [editFixedMode, setEditFixedMode] = useState<"UNIT" | "TOTAL">("UNIT");
  const [editStartPrice, setEditStartPrice] = useState(100);

  const [nowMs, setNowMs] = useState(() => Date.now());

  async function refresh() {
    setBusy("refresh");
    setError(null);
    try {
      const auth = await getJson<{ ok: true; user: { id: string } | null }>("/api/auth/me");
      if (!auth?.user?.id) {
        setSessionUser(null);
        setMe(null);
        return;
      }
      setSessionUser({ id: auth.user.id });
      try {
        const r = await getJson<MeState>("/api/me/state");
        if (r?.ok) setMe(r);
        else setMe(null);
      } catch (e2) {
        setMe(null);
        setError(e2);
      }
    } catch (e) {
      setMe(null);
      setError(e);
      const err = e as { error?: string; status?: number };
      const unauthorized = err?.error === "UNAUTHORIZED" || err?.status === 401;
      setSessionUser(unauthorized ? null : undefined);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setSortPrefs(readSortPrefs());
  }, []);

  useEffect(() => {
    writeSortPrefs(sortPrefs);
  }, [sortPrefs]);

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

  const filteredMaterials = useMemo(() => {
    const inv = me?.inventory ?? [];
    const qq = q.trim().toLowerCase();
    const filtered = inv
      .filter((it) => it.category === "재료" || it.category === "소비")
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

  async function fetchSuggested(itemId: string) {
    setSuggestBusy(true);
    try {
      const r = await getJson<MarketStats>(`/api/market/stats?itemId=${encodeURIComponent(itemId)}&take=30`);
      const avg = typeof r?.summary?.avgUnitPrice === "number" ? r.summary.avgUnitPrice : null;
      const last = typeof r?.summary?.lastUnitPrice === "number" ? r.summary.lastUnitPrice : null;
      const ref =
        typeof r?.summary?.referenceGoldPerUnit === "number" ? r.summary.referenceGoldPerUnit : null;
      const s = avg ?? last ?? ref;
      const v = typeof s === "number" ? Math.max(1, Math.round(s)) : null;
      setSuggestedUnit(v);
      return v;
    } catch {
      setSuggestedUnit(null);
      return null;
    } finally {
      setSuggestBusy(false);
    }
  }

  async function openSell(item: MeState["inventory"][number]) {
    setSellItem(item);
    setSellWeapon(null);
    setSellQty(1);
    setSellType("FIXED");
    setSellPriceMode("UNIT");
    setSuggestedUnit(null);

    const sug = await fetchSuggested(item.itemId);
    const unit = Math.max(1, sug ?? 10);
    setSellUnitPrice(unit);
    setSellTotalPrice(unit * 1);
    setSellStartPrice(unit * 1);
    setSellOpen(true);
  }

  async function openSellWeapon(w: WeaponInstanceRow) {
    setSellWeapon(w);
    setSellItem(null);
    setSellQty(1);
    setSellType("FIXED");
    setSellPriceMode("UNIT");
    setSuggestedUnit(null);
    setSellUnitPrice(100);
    setSellTotalPrice(100);
    setSellStartPrice(100);
    setSellOpen(true);
  }

  async function submitSell() {
    const isWeapon = !!sellWeapon;
    if (!sellItem && !sellWeapon) return;
    const qty = isWeapon ? 1 : Math.max(1, Math.floor(sellQty));
    if (!isWeapon && sellItem && qty > sellItem.quantity) throw { ok: false, error: "수량이 부족해." };

    if (sellType === "FIXED") {
      await postJson("/api/market/list", {
        ...(isWeapon ? { weaponInstanceId: sellWeapon!.id } : { itemId: sellItem!.itemId, quantity: qty }),
        quantity: qty,
        saleType: "FIXED",
        ...(sellPriceMode === "UNIT"
          ? { fixedPricePerUnit: Math.max(1, Math.floor(sellUnitPrice)) }
          : { fixedPriceTotal: Math.max(1, Math.floor(sellTotalPrice)) }),
      });
    } else {
      const start = Math.max(1, Math.floor(sellStartPrice));
      await postJson("/api/market/list", {
        ...(isWeapon ? { weaponInstanceId: sellWeapon!.id } : { itemId: sellItem!.itemId, quantity: qty }),
        saleType: "AUCTION",
        startPrice: start,
      });
    }

    setSellOpen(false);
    setSellItem(null);
    setSellWeapon(null);
    await refresh();
  }

  async function cancelMyListing(listingId: string) {
    await postJson("/api/market/cancel", { listingId });
    await refresh();
  }

  async function settleMyAuction(listingId: string) {
    await postJson("/api/market/settle", { listingId });
    await refresh();
  }

  function openEditListing(l: MeState["myListings"][number]) {
    setEditListing(l);
    if (l.saleType === "FIXED") {
      const isTotal = l.fixedPriceTotal != null && l.fixedPriceTotal > 0;
      setEditFixedMode(isTotal ? "TOTAL" : "UNIT");
      setEditFixedTotal(Math.max(1, Math.floor((l.fixedPriceTotal as any) ?? 1)));
      setEditFixedUnit(Math.max(1, Math.floor(l.fixedPricePerUnit ?? 1)));
    } else {
      setEditStartPrice(Math.max(1, Math.floor(l.startPrice ?? 1)));
    }
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!editListing) return;
    if (editListing.saleType === "FIXED") {
      await postJson("/api/market/update", {
        listingId: editListing.id,
        saleType: "FIXED",
        ...(editFixedMode === "TOTAL"
          ? { fixedPriceTotal: Math.max(1, Math.floor(editFixedTotal)) }
          : { fixedPricePerUnit: Math.max(1, Math.floor(editFixedUnit)) }),
      });
    } else {
      await postJson("/api/market/update", {
        listingId: editListing.id,
        saleType: "AUCTION",
        startPrice: Math.max(1, Math.floor(editStartPrice)),
      });
    }
    setEditOpen(false);
    setEditListing(null);
    await refresh();
  }

  const sessionReady = sessionUser !== undefined;
  const loggedIn = sessionUser != null;
  const sessionError = sessionUser === undefined && error;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">인벤토리</div>
          <div className="mt-1 text-sm text-zinc-600">검색·필터·빠른 판매까지 한 번에.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
            disabled={!!busy}
            onClick={() => void refresh()}
          >
            새로고침
          </button>
        </div>
      </div>

      {sessionError ? (
        <div className="mt-4 space-y-2">
          <div className="text-sm text-zinc-700">세션/인벤을 확인하지 못했어. (쿠키·네트워크·서버 오류일 수 있어)</div>
          <pre className="overflow-auto rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
            {JSON.stringify(error, null, 2)}
          </pre>
        </div>
      ) : !sessionReady ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          {busy ? "인벤토리를 불러오는 중…" : "세션을 확인하는 중…"}
        </div>
      ) : !loggedIn ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          로그인하면 내 인벤토리가 보여. 메인 화면에서 로그인한 뒤 이 페이지를 새로고침해.
        </div>
      ) : !me ? (
        <div className="mt-4 space-y-3">
          {error ? (
            <pre className="overflow-auto rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              {JSON.stringify(error, null, 2)}
            </pre>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
              인벤 데이터를 불러오지 못했어. 위 오류를 확인하거나 새로고침을 눌러.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] font-semibold text-zinc-600">보유 골드</div>
              <div className="mt-1 text-lg font-semibold">{fmtInt(me.wallet.goldAvailable)}G</div>
              <div className="text-[11px] text-zinc-600">잠금 {fmtInt(me.wallet.goldLocked)}G</div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] font-semibold text-zinc-600">보유 아이템 종류</div>
              <div className="mt-1 text-lg font-semibold">{fmtInt(filteredMaterials.length)}종</div>
              <div className="text-[11px] text-zinc-600">총 슬롯 {fmtInt((me.inventory ?? []).length)}개</div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] font-semibold text-zinc-600">내 활성 매물</div>
              <div className="mt-1 text-lg font-semibold">{fmtInt(me.myListings.length)}건</div>
              <div className="text-[11px] text-zinc-600">판매중 목록은 아래에서 확인</div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                className={`h-10 rounded-xl px-4 text-sm font-semibold ${tab === "WEAPONS" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-900"}`}
                onClick={() => setTab("WEAPONS")}
              >
                무기
              </button>
              <button
                className={`h-10 rounded-xl px-4 text-sm font-semibold ${tab === "TOOLS" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-900"}`}
                onClick={() => setTab("TOOLS")}
              >
                도구
              </button>
              <button
                className={`h-10 rounded-xl px-4 text-sm font-semibold ${tab === "MATERIALS" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-900"}`}
                onClick={() => setTab("MATERIALS")}
              >
                재료·소비
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1 md:max-w-[420px]">
                <label className="text-xs font-semibold text-zinc-600">검색</label>
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
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
                <label className="text-xs font-semibold text-zinc-600">정렬</label>
                <select
                  className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
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
            </div>
          </div>

          {error ? (
            <div className="mt-4 space-y-2">
              {inventoryErrorHint ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {inventoryErrorHint}
                </div>
              ) : null}
              <pre className="overflow-auto rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                {JSON.stringify(error, null, 2)}
              </pre>
            </div>
          ) : null}

          {tab === "WEAPONS" ? (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">보유 무기</div>
                <div className="mt-1 text-xs text-zinc-600">
                  무기는 개별 인스턴스 단위로 강화/판매할 수 있어. 강화에는 골드와 돌(item_stone)이 들어가고, 일정 단계마다 광석(item_ore)이 추가로 필요해.
                </div>
              </div>
              <button
                className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                disabled={!!busy}
                onClick={() => void refresh()}
              >
                갱신
              </button>
            </div>

            {filteredWeapons.length === 0 ? (
              <div className="mt-3 text-sm text-zinc-500">보유 무기가 없어.</div>
            ) : (
              <div className="mt-3 grid gap-2">
                {filteredWeapons.map((w) => {
                  const upgradeInfo = nextWeaponUpgradeLine(w.enhanceLevel ?? 0, nameById);
                  return (
                  <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap items-baseline gap-0 text-sm font-semibold">
                          <span className={itemGradeNameClassName(w.grade ?? 1)}>{w.name}</span>
                          {w.enhanceLevel > 0 ? (
                            <span className="text-zinc-700">{` +${w.enhanceLevel}`}</span>
                          ) : null}
                        </div>
                        {w.gradeLabel ? (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                            {w.gradeLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 font-mono text-xs text-zinc-500">{w.id}</div>
                      <div className="mt-1 text-xs text-zinc-600">베이스: {w.baseItemId}</div>
                      {(w.options?.length ?? 0) > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(w.options ?? []).map((op, i) => (
                            <span
                              key={`${op.kind}-${i}`}
                              className="inline-flex max-w-full items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-950"
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
                      {upgradeInfo.text ? (
                        <div className="mt-2 text-[11px] leading-snug text-zinc-600">{upgradeInfo.text}</div>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                        disabled={!!busy}
                        onClick={() => void openSellWeapon(w)}
                      >
                        판매하기
                      </button>
                      <button
                        className="h-9 rounded-xl bg-indigo-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={!!busy || enhBusyId === w.id || upgradeInfo.atMax}
                        onClick={async () => {
                          setEnhBusyId(w.id);
                          setError(null);
                          try {
                            const r = await postJson("/api/inventory/weapon-instance/upgrade", { weaponInstanceId: w.id });
                            console.log("[weapon-enhance]", r);
                            await refresh();
                          } catch (e) {
                            setError(e);
                          } finally {
                            setEnhBusyId(null);
                          }
                        }}
                      >
                        강화
                      </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}

          {tab === "TOOLS" ? (
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">보유 도구</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    낚싯대·곡괭이·낫 등은 개별 인스턴스로 보관되며 제작 시 옵션이 붙어. (경매장 판매는 무기만 지원)
                  </div>
                </div>
                <button
                  className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() => void refresh()}
                >
                  갱신
                </button>
              </div>

              {filteredTools.length === 0 ? (
                <div className="mt-3 text-sm text-zinc-500">보유 도구가 없어.</div>
              ) : (
                <div className="mt-3 grid gap-2">
                  {filteredTools.map((t) => (
                    <div key={t.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={`text-sm font-semibold ${itemGradeNameClassName(t.grade ?? 1)}`}>{t.name}</div>
                        {t.gradeLabel ? (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                            {t.gradeLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 font-mono text-xs text-zinc-500">{t.id}</div>
                      <div className="mt-1 text-xs text-zinc-600">베이스: {t.baseItemId}</div>
                      {(t.options?.length ?? 0) > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(t.options ?? []).map((op, i) => (
                            <span
                              key={`${op.kind}-${i}`}
                              className="inline-flex max-w-full items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-950"
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
                      ) : (
                        <div className="mt-2 text-xs text-zinc-500">옵션 없음</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === "MATERIALS" ? (
          <div className="mt-6 grid gap-2">
            {filteredMaterials.length === 0 ? (
              <div className="text-sm text-zinc-500">재료가 없어. (마을 수령/구매/시드 후)</div>
            ) : (
              filteredMaterials.map((it) => (
                <div
                  key={it.itemId}
                  className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={`truncate text-sm font-semibold ${itemGradeNameClassName(it.grade ?? 1)}`}>{it.name}</div>
                      {it.gradeLabel ? (
                        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                          {it.gradeLabel}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                        {it.category}
                      </span>
                      <span className="font-mono text-xs text-zinc-500">{it.itemId}</span>
                    </div>
                    <div className="mt-1 text-sm text-zinc-700">
                      수량: <span className="font-semibold">{fmtInt(it.quantity)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {it.itemId === "item_minion_egg" ? (
                      <button
                        className="h-10 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={!!busy}
                        onClick={async () => {
                          setBusy("hatch-egg");
                          setError(null);
                          try {
                            await postJson("/api/minions/hatch", {});
                            await refresh();
                          } catch (e) {
                            setError(e);
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        부화 (알 1개 소모)
                      </button>
                    ) : null}
                    <button
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900"
                      onClick={() => void openSell(it)}
                    >
                      판매하기
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            판매중 매물 관리는 경매장 화면의 <span className="font-semibold">“내 판매 물품”</span> 탭에서 할 수 있어.
          </div>
        </>
      )}

      {sellOpen && (sellItem || sellWeapon) ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">판매 등록</div>
                <div className="mt-1 text-xs text-zinc-600">
                  {sellWeapon ? (
                    <>
                      <span className={itemGradeNameClassName(sellWeapon.grade ?? 1)}>{sellWeapon.name}</span>
                      {sellWeapon.enhanceLevel > 0 ? (
                        <span className="text-zinc-700">{` +${sellWeapon.enhanceLevel}`}</span>
                      ) : null}{" "}
                      <span className="font-mono text-zinc-500">({sellWeapon.id})</span>
                    </>
                  ) : (
                    <>
                      <span className={itemGradeNameClassName(sellItem!.grade ?? 1)}>{sellItem!.name}</span>{" "}
                      <span className="text-zinc-600">
                        ({sellItem!.itemId}) · 보유 {fmtInt(sellItem!.quantity)}
                      </span>
                    </>
                  )}
                </div>
                {suggestedUnit ? (
                  <div className="mt-1 text-xs text-zinc-600">
                    최근 시세(대략) 단가: <span className="font-semibold">{fmtInt(suggestedUnit)}</span>G
                  </div>
                ) : null}
              </div>
              <button
                className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                onClick={() => {
                  setSellOpen(false);
                  setSellItem(null);
                  setSellWeapon(null);
                }}
              >
                닫기
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-600">수량</label>
                <div className="flex gap-2">
                  <input
                    className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                    type="number"
                    min={1}
                    max={sellWeapon ? 1 : sellItem!.quantity}
                    value={sellQty}
                    onChange={(e) => {
                      const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                      const next = Math.min(v, sellWeapon ? 1 : sellItem!.quantity);
                      setSellQty(next);
                      if (sellPriceMode === "TOTAL") setSellUnitPrice(Math.max(1, Math.floor(sellTotalPrice / next)));
                      else setSellTotalPrice(Math.max(1, Math.floor(sellUnitPrice * next)));
                    }}
                    disabled={!!sellWeapon}
                  />
                  <button
                    className="h-10 shrink-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                    disabled={!!sellWeapon || sellItem!.quantity <= 1}
                    onClick={() => {
                      const next = Math.max(1, Math.floor(sellItem!.quantity));
                      setSellQty(next);
                      if (sellPriceMode === "TOTAL") setSellUnitPrice(Math.max(1, Math.floor(sellTotalPrice / next)));
                      else setSellTotalPrice(Math.max(1, Math.floor(sellUnitPrice * next)));
                    }}
                    title="보유 수량 전체로 설정"
                  >
                    최대
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-600">판매 방식</label>
                <select
                  className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  value={sellType}
                  onChange={(e) => setSellType(e.target.value as any)}
                >
                  <option value="FIXED">고정가</option>
                  <option value="AUCTION">경매</option>
                </select>
              </div>

              {sellType === "FIXED" ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-zinc-600">가격 모드</label>
                    <select
                      className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      value={sellPriceMode}
                      onChange={(e) => setSellPriceMode(e.target.value as any)}
                    >
                      <option value="UNIT">단가</option>
                      <option value="TOTAL">총액</option>
                    </select>
                  </div>

                  {sellPriceMode === "UNIT" ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-zinc-600">단가</label>
                      <input
                        className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                        type="number"
                        min={1}
                        value={sellUnitPrice}
                        onChange={(e) => {
                          const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setSellUnitPrice(v);
                          setSellTotalPrice(Math.max(1, v * Math.max(1, Math.floor(sellQty))));
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-zinc-600">총액</label>
                      <input
                        className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                        type="number"
                        min={1}
                        value={sellTotalPrice}
                        onChange={(e) => {
                          const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setSellTotalPrice(v);
                          setSellUnitPrice(Math.max(1, Math.floor(v / Math.max(1, Math.floor(sellQty)))));
                        }}
                      />
                    </div>
                  )}

                  <div className="sm:col-span-2 flex items-center justify-between text-xs text-zinc-600">
                    <div>
                      계산 단가: <span className="font-semibold">{fmtInt(sellUnitPrice)}</span>G · 총액{" "}
                      <span className="font-semibold">{fmtInt(sellUnitPrice * Math.max(1, Math.floor(sellQty)))}</span>G
                    </div>
                    <button
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                      disabled={suggestBusy}
                      onClick={() =>
                        void fetchSuggested((sellWeapon?.baseItemId ?? sellItem!.itemId) as string).then((v) => v && setSellUnitPrice(v))
                      }
                      title="최근 거래 기반 단가 제안"
                    >
                      {suggestBusy ? "불러오는 중…" : "시세로 단가 맞추기"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-600">시작가</label>
                  <input
                    className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                    type="number"
                    min={1}
                    value={sellStartPrice}
                    onChange={(e) => setSellStartPrice(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  />
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="h-10 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900"
                onClick={() => {
                  setSellOpen(false);
                  setSellItem(null);
                }}
              >
                취소
              </button>
              <button
                className="h-10 flex-1 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!!busy}
                onClick={() => {
                  setBusy("sell");
                  setError(null);
                  void submitSell().then(
                    () => setBusy(null),
                    (e) => {
                      setError(e);
                      setBusy(null);
                    },
                  );
                }}
              >
                등록
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 내 판매중 매물의 수정/정산/취소는 경매장(내 판매 물품 탭)에서 진행 */}
    </section>
  );
}

