"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GAME_RULES } from "@/server/gameRules";
import { itemGradeNameClassName, minionLetterGradeBadgeClassName } from "@/server/itemGrade";

type Workshop = {
  id: string;
  /** 부지 슬롯 0~2 */
  plotSlot?: number | null;
  name: string;
  kind?: "GATHER" | "PROCESS" | "CONSUME";
  workshopTypeId?: string;
  tier?: number;
  minionCount: number;
  mastery?: { xp: number; level: number; tickSeconds: number; baseTickSeconds: number };
  lastCollectedAt: string;
  createdAt: string;
  processCraftRecipeId?: string | null;
  processCraftStartedAt?: string | null;
  processCraftEndsAt?: string | null;
  processCraftOutputMult?: number | null;
  processCraftQuantity?: number;
};

type WorkshopTypeOption = { id: string; name: string; kind: string };

type DropRow = {
  itemId: string;
  itemName: string;
  category: string;
  grade?: number;
  gradeLabel?: string;
  weight: number;
  weightAdjusted?: number;
  chance: number; // 0..1
  minQty: number;
  maxQty: number;
  minTier?: number;
};

type Recipe = {
  id: string;
  name: string;
  rewardGold?: number;
  /** 시설 티어(1~5) 이상일 때만 제작·제출 가능 */
  minTier?: number;
  /** 가공: 1회당 제작 시간(초) */
  craftTimeSeconds?: number;
  inputs: Array<{ itemId: string; quantity: number }>;
  outputs: Array<{ itemId: string; weight: number | null; minQty: number; maxQty: number }>;
};

type MinionRow = {
  id: string;
  jobType: string;
  level: number;
  /** D C B A S */
  grade?: string;
  equippedWeapon?: { id: string; baseItemId: string; name: string; enhanceLevel: number } | null;
  assignedWorkshop?: { workshopId: string; workshopName: string; workshopKind: string } | null;
};

function formatPanelError(e: unknown): string {
  if (e == null) return "알 수 없는 오류";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.error === "string" && o.error.length > 0) {
      const code = o.error;
      if (code === "PLOT_LOCKED") return "이 칸은 아직 열리지 않았어요. 먼저 골드로 부지를 해제하세요.";
      if (code === "BAD_REQUEST") return "요청 형식이 잘못됐어요. 새로고침 후 다시 시도해 주세요.";
      if (code === "USER_NOT_FOUND") return "유저를 찾을 수 없어요. 로그인을 확인해 주세요.";
      if (code === "WORKSHOP_TYPE_NOT_FOUND") return "시설 종류를 찾을 수 없어요.";
      if (code === "SLOT_OCCUPIED") return "이 칸에 이미 시설이 있어요.";
      if (code === "PLOT_FULL") return "부지에 더 이상 시설을 둘 수 없어요.";
      if (code === "TRANSACTION_FAILED") return "처리 중 오류가 났어요. DB 반영(npx prisma db push) 후 다시 시도해 보세요.";
      if (code === "TIER_UPGRADE_NOT_ALLOWED") return "이 시설 종류는 티어 업그레이드를 할 수 없어요.";
      if (code === "INSUFFICIENT_GOLD") return "골드가 부족해요.";
      if (code === "ALREADY_MAX_TIER") return "이미 최대 티어예요.";
      if (code === "WORKSHOP_NOT_FOUND") return "시설을 찾을 수 없어요.";
      if (code === "FORBIDDEN") return "이 시설을 수정할 권한이 없어요.";
      if (code === "UPGRADE_COST_MISSING") return "티어 업그레이드 비용 설정이 없어요.";
      if (code === "RECIPE_TIER_TOO_LOW") return "시설 티어가 부족해요. 티어 업그레이드 후 다시 시도해 주세요.";
      return code;
    }
    if (typeof o.message === "string" && o.message.length > 0) return o.message;
    if (typeof o.status === "number") {
      const st = o.status;
      if (st === 401) return "로그인이 필요해요.";
      if (st === 403) return "이 작업은 할 수 없어요.";
      if (st === 404) return "데이터를 찾을 수 없어요.";
      if (st >= 500) return `서버 오류(${st}). 잠시 후 다시 시도하거나 DB 마이그레이션을 확인해 주세요.`;
      return `요청 실패(HTTP ${st})`;
    }
    try {
      const s = JSON.stringify(e);
      if (s !== "{}") return s;
    } catch {
      /* ignore */
    }
  }
  return "요청 실패(응답을 읽을 수 없음). 서버 오류이거나 DB 스키마 반영(npx prisma db push)이 필요할 수 있어요.";
}

async function parseJsonResponse<T>(res: Response): Promise<{ data: T; text: string }> {
  const text = await res.text();
  if (!text.trim()) return { data: {} as T, text: "" };
  try {
    return { data: JSON.parse(text) as T, text };
  } catch {
    return { data: {} as T, text };
  }
}

function apiFailureMessage(data: unknown, text: string, res: Response): string {
  if (data && typeof data === "object" && data !== null) {
    const o = data as { message?: string; error?: string };
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
  }
  const emptyPayload = !data || (typeof data === "object" && Object.keys(data as object).length === 0);
  if (text.trim() && emptyPayload) {
    return `서버 응답(${res.status}): ${text.replace(/\s+/g, " ").slice(0, 200)}`;
  }
  return `HTTP ${res.status} ${res.statusText || ""}`.trim();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const { data, text } = await parseJsonResponse<T>(res);
  if (!res.ok) {
    throw { ok: false, error: apiFailureMessage(data, text, res), status: res.status };
  }
  return data;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const { data, text } = await parseJsonResponse<T>(res);
  if (!res.ok) {
    throw { ok: false, error: apiFailureMessage(data, text, res), status: res.status };
  }
  return data;
}

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function getUserIdFromStorage() {
  try {
    return localStorage.getItem("dev_userId") ?? "";
  } catch {
    return "";
  }
}

export function WorkshopsPanel() {
  const [userId, setUserId] = useState("");
  const [tickSeconds, setTickSeconds] = useState(60);
  const [plotMaxSlots, setPlotMaxSlots] = useState<number>(GAME_RULES.plot.maxSlots);
  const [plotSlotsUnlocked, setPlotSlotsUnlocked] = useState(1);
  const [nextUnlockGold, setNextUnlockGold] = useState<number | null>(GAME_RULES.plot.unlockGoldAfterSlotCount[0] ?? null);
  const [workshopTypes, setWorkshopTypes] = useState<WorkshopTypeOption[]>([]);
  const [plotInstallSlot, setPlotInstallSlot] = useState<number | null>(null);
  const [plotInstallTypeId, setPlotInstallTypeId] = useState("");
  const [plotBusy, setPlotBusy] = useState(false);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [wallet, setWallet] = useState<{ goldAvailable: number; goldLocked: number } | null>(null);
  const [inventory, setInventory] = useState<Array<{ itemId: string; name: string; quantity: number }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);
  const [tab, setTab] = useState<"GATHER" | "CRAFT">("GATHER");
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string>("");
  const [lastCollectById, setLastCollectById] = useState<Record<string, any>>({});
  const [dropsByKey, setDropsByKey] = useState<Record<string, DropRow[]>>({});
  const [recipesByTypeId, setRecipesByTypeId] = useState<Record<string, Recipe[]>>({});
  const [minions, setMinions] = useState<{ owned: number; assigned: number; free: number; nextPrice: number } | null>(
    null,
  );

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [allMinions, setAllMinions] = useState<MinionRow[]>([]);
  const [assignedMinionIds, setAssignedMinionIds] = useState<Set<string>>(new Set());
  const [checkedMinionIds, setCheckedMinionIds] = useState<Set<string>>(new Set());
  const [assignPreferredJobs, setAssignPreferredJobs] = useState<string[]>([]);

  const nowMsRef = useRef(Date.now());
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    setUserId(getUserIdFromStorage());
    function onChanged() {
      setUserId(getUserIdFromStorage());
    }
    window.addEventListener("dev_user_changed", onChanged);
    window.addEventListener("storage", onChanged);
    void getJson<{ ok: true; user: { id: string } | null }>("/api/auth/me")
      .then((r) => {
        if (r?.user?.id) {
          try {
            localStorage.setItem("dev_userId", r.user.id);
          } catch {
            /* ignore */
          }
          setUserId(r.user.id);
          window.dispatchEvent(new Event("dev_user_changed"));
        }
      })
      .catch(() => {
        /* 미로그인 */
      });
    return () => {
      window.removeEventListener("dev_user_changed", onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setWorkshopTypes([]);
      return;
    }
    const qs = new URLSearchParams({ userId });
    void getJson<{ ok: boolean; types: WorkshopTypeOption[] }>(`/api/workshops/types?${qs.toString()}`)
      .then((r) => {
        if (r?.ok && Array.isArray(r.types)) setWorkshopTypes(r.types);
      })
      .catch(() => setWorkshopTypes([]));
  }, [userId]);

  useEffect(() => {
    const t = setInterval(() => {
      nowMsRef.current = Date.now();
      setClockTick((x) => (x + 1) % 10_000);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  async function refresh(options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    if (!silent) setBusy("refresh");
    if (!silent) setError(null);
    try {
      const [r, m, me] = await Promise.all([
        getJson<{
          ok: boolean;
          tickSeconds: number;
          plotMaxSlots?: number;
          plotSlotsUnlocked?: number;
          nextUnlockGold?: number | null;
          workshops: Workshop[];
        }>(userId ? `/api/workshops/list?userId=${encodeURIComponent(userId)}` : `/api/workshops/list`),
        getJson<{ ok: boolean; owned: number; assigned: number; free: number; nextPrice: number }>(
          `/api/minions/state`,
        ),
        getJson<{
          ok: boolean;
          wallet: { goldAvailable: number; goldLocked: number };
          inventory?: Array<{ itemId: string; name: string; quantity: number }>;
        }>(`/api/me/state`),
      ]);
      setTickSeconds(r.tickSeconds ?? 60);
      setPlotMaxSlots(
        typeof r.plotMaxSlots === "number" && Number.isFinite(r.plotMaxSlots)
          ? Math.max(1, Math.floor(r.plotMaxSlots))
          : GAME_RULES.plot.maxSlots,
      );
      if (typeof r.plotSlotsUnlocked === "number" && Number.isFinite(r.plotSlotsUnlocked)) {
        setPlotSlotsUnlocked(
          Math.max(1, Math.min(GAME_RULES.plot.maxSlots, Math.floor(r.plotSlotsUnlocked))),
        );
      }
      if ("nextUnlockGold" in r) {
        setNextUnlockGold(
          r.nextUnlockGold == null || typeof r.nextUnlockGold === "number"
            ? (r.nextUnlockGold ?? null)
            : null,
        );
      }
      setWorkshops(r.workshops ?? []);
      if (m?.ok) setMinions({ owned: m.owned, assigned: m.assigned, free: m.free, nextPrice: m.nextPrice });
      if ((me as any)?.ok) setWallet({ goldAvailable: me.wallet?.goldAvailable ?? 0, goldLocked: me.wallet?.goldLocked ?? 0 });
      if ((me as any)?.ok) setInventory((me as any).inventory ?? []);
      {
        const list = (r.workshops ?? []) as Workshop[];
        const first =
          list.find((w) => w.kind === "GATHER")?.id ??
          list.find((w) => w.kind === "PROCESS")?.id ??
          list.find((w) => w.kind === "CONSUME")?.id ??
          list[0]?.id ??
          "";

        // auto-refresh 중 선택이 "첫 마을(대개 광산)"으로 되돌아가는 레이스를 방지.
        // - 기존 선택이 있으면 유지
        // - 기존 선택이 목록에서 사라졌으면 첫 항목으로 보정
        if (first) {
          setSelectedWorkshopId((prev) => {
            if (!prev) return first;
            const exists = list.some((w) => w.id === prev);
            return exists ? prev : first;
          });
        }
      }
    } catch (e) {
      if (!silent) setError(e);
    } finally {
      if (!silent) setBusy(null);
    }
  }

  async function openAssignModal() {
    if (!selected) return;
    setAssignOpen(true);
    setAssignBusy(true);
    setError(null);
    try {
      const [m, a] = await Promise.all([
        getJson<{ ok: boolean; minions: MinionRow[] }>(`/api/minions/list`),
        getJson<{
          ok: boolean;
          allowedJobs: string[];
          preferredJobs?: string[];
          assigned: Array<{ minionId: string }>;
        }>(`/api/workshops/assignments?workshopId=${encodeURIComponent(selected.id)}`),
      ]);
      setAllMinions((m as any)?.minions ?? []);
      const ids = new Set<string>(((a as any)?.assigned ?? []).map((x: any) => String(x.minionId)));
      setAssignedMinionIds(ids);
      setCheckedMinionIds(new Set(ids));
      setAssignPreferredJobs(
        (((a as any)?.preferredJobs ?? (a as any)?.allowedJobs) ?? []) as string[],
      );
    } catch (e) {
      setError(e);
    } finally {
      setAssignBusy(false);
    }
  }

  async function submitAssignModal() {
    if (!selected) return;
    const next = checkedMinionIds;
    const prev = assignedMinionIds;
    const assignIds = Array.from(next).filter((id) => !prev.has(id));
    const unassignIds = Array.from(prev).filter((id) => !next.has(id));
    if (assignIds.length === 0 && unassignIds.length === 0) {
      setAssignOpen(false);
      return;
    }
    setAssignBusy(true);
    setError(null);
    try {
      await postJson("/api/workshops/minions", {
        workshopId: selected.id,
        assignMinionIds: assignIds,
        unassignMinionIds: unassignIds,
      });
      setAssignOpen(false);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setAssignBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // 자동 새로고침: 골드/인벤 변동이 실시간처럼 보이게
  useEffect(() => {
    if (!userId) return;
    const t = setInterval(() => {
      void refresh({ silent: true });
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const selected = useMemo(
    () => workshops.find((w) => w.id === selectedWorkshopId) ?? null,
    [workshops, selectedWorkshopId],
  );

  const invByItemId = useMemo(() => {
    const m = new Map<string, { itemId: string; name: string; quantity: number }>();
    for (const row of inventory) m.set(row.itemId, row);
    return m;
  }, [inventory]);

  const selectedTier = useMemo(() => {
    if (!selected) return 1;
    return Math.max(1, Math.min(5, Math.floor(selected.tier ?? 1)));
  }, [selected]);

  const selectedDropsKey = useMemo(() => {
    if (!selectedWorkshopId) return "";
    return `${selectedWorkshopId}:${selectedTier}`;
  }, [selectedWorkshopId, selectedTier]);

  const nextTierUpgradeGold = useMemo(() => {
    const kind = selected?.kind ?? "GATHER";
    if (!selected || (kind !== "GATHER" && kind !== "PROCESS")) return null;
    if (selectedTier >= 5) return null;
    const m = GAME_RULES.workshop.tierUpgradeGoldByFromTier as unknown as Record<string, number>;
    const v = m[String(selectedTier)];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }, [selected, selectedTier]);

  const processTierCraftSpeedMult = useMemo(() => {
    if (!selected || selected.kind !== "PROCESS") return null;
    const m = GAME_RULES.workshop.processTierCraftSpeedMultByFromTier as unknown as Record<string, number>;
    const v = m[String(selectedTier)];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 1;
  }, [selected, selectedTier]);

  const grouped = useMemo(() => {
    const gather = workshops.filter((w) => (w.kind ?? "GATHER") === "GATHER");
    const process = workshops.filter((w) => w.kind === "PROCESS");
    const consume = workshops.filter((w) => w.kind === "CONSUME");
    return { gather, process, consume };
  }, [workshops]);

  const plotSlots = useMemo(() => {
    const max = plotMaxSlots;
    return Array.from({ length: max }, (_, i) => ({
      slot: i,
      workshop: workshops.find((w) => w.plotSlot === i) ?? null,
    }));
  }, [workshops, plotMaxSlots]);

  const visibleWorkshops = useMemo(() => {
    return tab === "GATHER" ? grouped.gather : [...grouped.process, ...grouped.consume];
  }, [grouped.consume, grouped.gather, grouped.process, tab]);

  // 탭 전환 시: 현재 선택이 탭 범위 밖이면 첫 마을으로 보정
  useEffect(() => {
    if (!visibleWorkshops.length) return;
    setSelectedWorkshopId((prev) => {
      if (!prev) return visibleWorkshops[0]!.id;
      const ok = visibleWorkshops.some((w) => w.id === prev);
      return ok ? prev : visibleWorkshops[0]!.id;
    });
  }, [visibleWorkshops, tab]);

  useEffect(() => {
    async function loadDrops() {
      if (!selectedWorkshopId) return;
      const ws = workshops.find((w) => w.id === selectedWorkshopId);
      if (ws?.kind === "PROCESS") return;
      if (!selectedDropsKey) return;
      if (dropsByKey[selectedDropsKey]) return;
      try {
        const r = await getJson<{ ok: boolean; drops: DropRow[] }>(
          `/api/workshops/drops?workshopId=${encodeURIComponent(selectedWorkshopId)}`,
        );
        if (r?.ok) setDropsByKey((prev) => ({ ...prev, [selectedDropsKey]: r.drops ?? [] }));
      } catch (e) {
        setError(e);
      }
    }
    void loadDrops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkshopId, workshops, selectedDropsKey]);

  useEffect(() => {
    async function loadRecipes() {
      if (!selectedWorkshopId) return;
      const ws = workshops.find((w) => w.id === selectedWorkshopId);
      if (!ws || ws.kind !== "PROCESS" || !ws.workshopTypeId) return;
      if (recipesByTypeId[ws.workshopTypeId]) return;
      try {
        const r = await getJson<{ ok: boolean; recipes: Recipe[] }>(
          `/api/workshops/recipes?workshopTypeId=${encodeURIComponent(ws.workshopTypeId)}`,
        );
        if ((r as any)?.ok) setRecipesByTypeId((prev) => ({ ...prev, [ws.workshopTypeId!]: (r as any).recipes ?? [] }));
      } catch (e) {
        setError(e);
      }
    }
    void loadRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkshopId, workshops]);

  function workshopMetrics(w: Workshop) {
    const tick = w.mastery?.tickSeconds ?? tickSeconds;
    const tickMs = tick * 1000;
    if (w.minionCount <= 0) {
      return { wholeTicks: 0, nextInSeconds: tick, tickSeconds: tick, bankedAtCap: false };
    }
    const last = new Date(w.lastCollectedAt).getTime();
    const now = nowMsRef.current;
    const elapsed = Math.max(0, now - last);
    const isGather = (w.kind ?? "GATHER") === "GATHER";
    const capMs = isGather ? GAME_RULES.workshop.maxBankedRealTimeMs : 0;
    const banked = isGather && capMs > 0 ? Math.min(elapsed, capMs) : elapsed;
    const wholeTicks = Math.floor(banked / tickMs);
    const atCap = isGather && capMs > 0 && elapsed >= capMs;
    const nextIn = atCap
      ? 0
      : tick - ((Math.floor(elapsed / 1000) % tick) || 0);
    return {
      wholeTicks,
      nextInSeconds: nextIn === tick ? 0 : nextIn,
      tickSeconds: tick,
      bankedAtCap: atCap,
    };
  }

  /** 가공(PROCESS) 마을: 레시피별 제작 시간 기준 진행 상태 */
  function getProcessCraftState(
    w: Workshop,
    recipes: Recipe[],
  ):
    | { status: "idle" }
    | {
        status: "running";
        recipeId: string;
        recipeName: string;
        remainingMs: number;
        quantity: number;
        totalCraftSeconds: number;
      }
    | {
        status: "ready";
        recipeId: string;
        recipeName: string;
        quantity: number;
        totalCraftSeconds: number;
      } {
    const rid = w.processCraftRecipeId;
    if (!rid || !w.processCraftStartedAt) return { status: "idle" };
    const qty = Math.max(1, Math.floor(w.processCraftQuantity ?? 1));
    const recipe = recipes.find((r) => r.id === rid);
    const name = recipe?.name ?? rid;
    const craftSec = Math.max(1, Math.floor(recipe?.craftTimeSeconds ?? 60));
    const readyAt = w.processCraftEndsAt
      ? new Date(w.processCraftEndsAt).getTime()
      : new Date(w.processCraftStartedAt).getTime() + craftSec * qty * 1000;
    const remainingMs = Math.max(0, readyAt - nowMsRef.current);
    const base = {
      recipeId: rid,
      recipeName: name,
      quantity: qty,
      totalCraftSeconds: craftSec * qty,
    };
    if (remainingMs <= 0) return { status: "ready", ...base };
    return { status: "running", remainingMs, ...base };
  }

  function collectCardsFromLast(payload: any): Array<{ itemId: string; itemName?: string; category?: string; qty: number }> {
    const rows = payload?.producedCards ?? payload?.payload?.producedCards ?? null;
    if (Array.isArray(rows) && rows.length) return rows as any;
    const produced = payload?.produced ?? payload?.payload?.produced ?? null;
    if (Array.isArray(produced) && produced.length) return produced as any;
    return [];
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">마을</div>
          <div className="text-sm text-zinc-600">마을 시설 · 미니언 배치/수령/카운트다운</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <div className="text-xs font-semibold text-zinc-600">골드</div>
            <div className="text-xs font-semibold text-zinc-900 tabular-nums">
              {(wallet?.goldAvailable ?? 0).toLocaleString()}G
            </div>
          </div>
          <div className="text-xs font-semibold text-zinc-600">userId (세션)</div>
          <input
            className="h-9 w-[340px] max-w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs text-zinc-700 outline-none"
            value={userId}
            readOnly
          />
          <button
            className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
            disabled={!!busy}
            onClick={() => void refresh()}
          >
            새로고침
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          오류: {formatPanelError(error)}
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-emerald-950">내 부지</div>
            <div className="text-xs text-emerald-900/85">
              시설 {workshops.length}개 · 사용 가능 칸 {plotSlotsUnlocked}/{plotMaxSlots}(첫 칸 무료 · 2번째 1,000G · 3번째
              10,000G 해제)
              {nextUnlockGold != null ? (
                <span className="font-semibold"> · 다음 해제 {nextUnlockGold.toLocaleString()}G</span>
              ) : (
                <span> · 부지 최대 확장</span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {plotSlots.map(({ slot, workshop: w }) => {
            const canUse = slot < plotSlotsUnlocked;
            const isNextLock =
              slot === plotSlotsUnlocked && plotSlotsUnlocked < plotMaxSlots && nextUnlockGold != null;
            const waitPrior = slot > plotSlotsUnlocked;
            return (
              <div
                key={slot}
                className={[
                  "flex min-h-[104px] flex-col rounded-xl border p-3",
                  w ? "border-zinc-300 bg-white" : "border-dashed border-zinc-300 bg-zinc-50/80",
                  !canUse && !w ? "bg-amber-50/50" : "",
                ].join(" ")}
              >
                <div className="text-[11px] font-semibold text-zinc-500">칸 {slot + 1}</div>
                {waitPrior ? (
                  <p className="mt-auto text-[10px] leading-snug text-zinc-400">앞 칸을 먼저 열어요</p>
                ) : isNextLock ? (
                  <button
                    type="button"
                    className="mt-auto h-9 rounded-lg border border-amber-400 bg-amber-100 text-[11px] font-semibold text-amber-950 hover:bg-amber-200 disabled:opacity-50"
                    disabled={!userId || plotBusy}
                    onClick={() =>
                      void (async () => {
                        setPlotBusy(true);
                        setError(null);
                        try {
                          await postJson("/api/workshops/plot/unlock", { userId: userId || undefined });
                          await refresh();
                        } catch (e) {
                          setError(e);
                        } finally {
                          setPlotBusy(false);
                        }
                      })()
                    }
                  >
                    {!userId ? "로그인 필요" : `부지 열기 (${nextUnlockGold?.toLocaleString() ?? "?"}G)`}
                  </button>
                ) : w ? (
                  <>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-900">{w.name}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">
                      {w.kind === "GATHER"
                        ? "수집"
                        : w.kind === "PROCESS"
                          ? "가공"
                          : w.kind === "CONSUME"
                            ? "2차"
                            : (w.kind ?? "—")}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-1 pt-2">
                      <button
                        type="button"
                        className="h-7 rounded-lg bg-zinc-900 px-2 text-[11px] font-semibold text-white"
                        onClick={() => {
                          // 선택한 시설 종류에 맞춰 탭도 같이 전환(수집 탭에선 가공/2차 선택이 자동으로 되돌아가는 문제 방지)
                          setTab(w.kind === "GATHER" ? "GATHER" : "CRAFT");
                          setSelectedWorkshopId(w.id);
                        }}
                      >
                        선택
                      </button>
                      <button
                        type="button"
                        className="h-7 rounded-lg border border-red-200 bg-red-50 px-2 text-[11px] font-semibold text-red-800 disabled:opacity-50"
                        disabled={!!busy || plotBusy}
                        onClick={() =>
                          void (async () => {
                            if (!confirm("이 시설을 철거할까요? 배치된 미니언은 해제됩니다.")) return;
                            setPlotBusy(true);
                            try {
                              await postJson("/api/workshops/plot/remove", {
                                workshopId: w.id,
                                userId: userId || undefined,
                              });
                              if (selectedWorkshopId === w.id) setSelectedWorkshopId("");
                              await refresh();
                            } catch (e) {
                              setError(e);
                            } finally {
                              setPlotBusy(false);
                            }
                          })()
                        }
                      >
                        철거
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="mt-auto h-8 rounded-lg border border-emerald-400 bg-white text-[11px] font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
                    disabled={
                      !userId || !canUse || workshops.length >= plotMaxSlots || plotBusy
                    }
                    onClick={() => {
                      setPlotInstallTypeId(workshopTypes[0]?.id ?? "");
                      setPlotInstallSlot(slot);
                    }}
                  >
                    {!userId
                      ? "로그인 필요"
                      : workshops.length >= plotMaxSlots
                        ? "칸 가득"
                        : "설치(무료)"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {plotInstallSlot != null ? (
          <div className="fixed inset-0 z-[45] flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
              <div className="text-sm font-semibold">칸 {plotInstallSlot + 1}에 시설 설치</div>
              <p className="mt-1 text-xs text-zinc-600">설치할 시설 종류를 고르세요.</p>
              {workshopTypes.length === 0 ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  등록된 시설 종류가 없어요. 관리자 시드(`admin`/데이터 적용) 후 새로고침 해 주세요.
                </div>
              ) : (
                <select
                  className="mt-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none"
                  value={plotInstallTypeId}
                  onChange={(e) => setPlotInstallTypeId(e.target.value)}
                >
                  {workshopTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.kind})
                    </option>
                  ))}
                </select>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold"
                  onClick={() => setPlotInstallSlot(null)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="h-9 rounded-xl bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={
                    plotInstallSlot == null || !plotInstallTypeId || plotBusy || workshopTypes.length === 0
                  }
                  onClick={() =>
                    void (async () => {
                      if (plotInstallSlot == null) return;
                      setPlotBusy(true);
                      setError(null);
                      try {
                        await postJson("/api/workshops/plot/install", {
                          plotSlot: plotInstallSlot,
                          workshopTypeId: plotInstallTypeId,
                          userId: userId || undefined,
                        });
                        setPlotInstallSlot(null);
                        await refresh();
                      } catch (e) {
                        setError(e);
                      } finally {
                        setPlotBusy(false);
                      }
                    })()
                  }
                >
                  설치
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="text-xs font-semibold text-zinc-600">선택한 시설</div>
          <div className="flex gap-2">
            <button
              type="button"
              className={[
                "h-9 rounded-xl px-3 text-xs font-semibold",
                tab === "GATHER" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-900",
              ].join(" ")}
              onClick={() => setTab("GATHER")}
            >
              수집
            </button>
            <button
              type="button"
              className={[
                "h-9 rounded-xl px-3 text-xs font-semibold",
                tab === "CRAFT" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-900",
              ].join(" ")}
              onClick={() => setTab("CRAFT")}
            >
              제작
            </button>
          </div>
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          시설 목록은 숨겼어요. 위 「내 부지」에서 시설의 「선택」으로 바꿀 수 있어요.
        </div>
        {workshops.length === 0 ? (
          <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-sm text-zinc-500">
              마을에 설치된 시설이 없어요. 위 「내 부지」에서 빈 칸에 시설을 설치하거나, 데이터 시드 후 새로고침 해 주세요.
            </div>
          </div>
        ) : (
          <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-4">
            {selected ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-sm font-semibold">미니언</div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <div>
                      <span className="text-xs text-zinc-600">보유</span>{" "}
                      <span className="font-semibold">{minions?.owned ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-600">배치</span>{" "}
                      <span className="font-semibold">{minions?.assigned ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-600">남음</span>{" "}
                      <span className="font-semibold">{minions?.free ?? "—"}</span>
                    </div>
                    <div className="text-xs font-semibold text-zinc-500">미니언은 부화·구매 등으로 확보해.</div>
                  </div>
                </div>

                {(selected.kind ?? "GATHER") === "GATHER" || selected.kind === "PROCESS" ? (
                  <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-zinc-600">
                          {(selected.kind ?? "GATHER") === "GATHER" ? "수집 시설 티어" : "가공 시설 티어"}
                        </div>
                        <div className="mt-1 text-sm text-zinc-700">
                          현재 <span className="font-semibold">T{selectedTier}</span>
                          {selected.kind === "PROCESS" && processTierCraftSpeedMult != null ? (
                            <span className="text-zinc-600">
                              {" "}
                              · 제작 속도{" "}
                              <span className="font-semibold">×{processTierCraftSpeedMult.toFixed(2)}</span>
                              <span className="text-zinc-500"> (직업·시너지 별도)</span>
                            </span>
                          ) : null}
                          {selectedTier >= 5 ? (
                            <span className="text-zinc-500"> · 최대</span>
                          ) : (
                            <span className="text-zinc-500">
                              {" "}
                              · 다음 업그레이드{" "}
                              <span className="font-semibold">
                                {nextTierUpgradeGold == null ? "—" : `${nextTierUpgradeGold.toLocaleString()}G`}
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {(selected.kind ?? "GATHER") === "GATHER"
                            ? "티어가 높을수록 `minTier` 조건을 만족하는 드랍이 추가로 열려."
                            : "티어가 높을수록 가공 제작이 조금 더 빨라져. (미니언 직업·시너지 배율에 곱해져 적용돼.)"}
                        </div>
                      </div>
                      <button
                        className="h-10 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={!!busy || selectedTier >= 5}
                        onClick={async () => {
                          setBusy("tier-upgrade");
                          setError(null);
                          try {
                            await postJson("/api/workshops/tier/upgrade", { workshopId: selected.id });
                            if ((selected.kind ?? "GATHER") === "GATHER") {
                              setDropsByKey((prev) => {
                                const next = { ...prev };
                                for (const k of Object.keys(next)) {
                                  if (k.startsWith(`${selected.id}:`)) delete next[k];
                                }
                                return next;
                              });
                            }
                            await refresh();
                          } catch (e) {
                            setError(e);
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        티어 업그레이드
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{selected.name}</div>
                    <div className="text-xs text-zinc-500">{selected.id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                      disabled={!!busy}
                      onClick={() => void openAssignModal()}
                      title="원하는 미니언을 직접 선택해 배치/해제"
                    >
                      미니언 배치 관리
                    </button>
                    <div className="min-w-[120px] text-center">
                      <div className="text-xs text-zinc-600">미니언</div>
                      <div className="text-sm font-semibold">{selected.minionCount}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {(() => {
                    const kind = selected.kind ?? "GATHER";
                    if (kind === "PROCESS") {
                      const recipes = recipesByTypeId[selected.workshopTypeId ?? ""] ?? [];
                      const pcs = getProcessCraftState(selected, recipes);
                      return (
                        <>
                          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:col-span-3">
                            <div className="text-xs font-semibold text-zinc-600">가공 제작</div>
                            <div className="mt-1 text-sm text-zinc-800">
                              {selected.minionCount <= 0 ? (
                                "미니언을 배치하면 레시피 제작을 시작할 수 있어."
                              ) : pcs.status === "idle" ? (
                                <>
                                  레시피에서 재료를 넣고 제작을 시작하면, 레시피에 설정된 시간만큼 지난 뒤 수령할 수 있어.{" "}
                                  <span className="text-zinc-600">
                                    시설 티어가 높을수록 제작이 조금 더 빨라지고, 미니언 직업·시너지 배율과 같이 적용돼.
                                  </span>
                                </>
                              ) : pcs.status === "running" ? (
                                <>
                                  <span className="font-semibold">{pcs.recipeName}</span> 제작 중 · 남은{" "}
                                  {formatDuration(Math.ceil(pcs.remainingMs / 1000))} · 총{" "}
                                  {formatDuration(pcs.totalCraftSeconds)}
                                </>
                              ) : (
                                <>
                                  <span className="font-semibold">{pcs.recipeName}</span> 완료 · 아래{" "}
                                  <span className="font-semibold">제작 수령</span>으로 결과를 받아.
                                </>
                              )}
                            </div>
                          </div>
                          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:col-span-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-zinc-600">숙련도</div>
                              <div className="text-xs text-zinc-600">
                                Lv <span className="font-semibold">{selected.mastery?.level ?? 1}</span> · XP{" "}
                                <span className="font-semibold">{selected.mastery?.xp ?? 0}</span>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    }
                    if (kind === "CONSUME") {
                      return (
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:col-span-3">
                          <div className="text-xs font-semibold text-zinc-600">2차 소모</div>
                          <div className="mt-1 text-sm text-zinc-800">
                            재료를 제출하면 즉시 소모되고 보상이 지급돼. (틱·대기 시간 없음)
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-2">
                            <div className="text-xs font-semibold text-zinc-600">숙련도</div>
                            <div className="text-xs text-zinc-600">
                              Lv <span className="font-semibold">{selected.mastery?.level ?? 1}</span> · XP{" "}
                              <span className="font-semibold">{selected.mastery?.xp ?? 0}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const m = workshopMetrics(selected);
                    return (
                      <>
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold text-zinc-600">누적 틱</div>
                          <div className="mt-1 text-sm font-semibold">
                            {m.wholeTicks}
                            {m.bankedAtCap ? (
                              <span className="ml-1 text-xs font-semibold text-amber-800">(최대 8h)</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold text-zinc-600">다음 생산까지</div>
                          <div className="mt-1 text-sm font-semibold">{formatDuration(m.nextInSeconds)}</div>
                        </div>
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold text-zinc-600">미수령 롤 수</div>
                          <div className="mt-1 text-sm font-semibold">{m.wholeTicks * selected.minionCount}</div>
                        </div>
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:col-span-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-zinc-600">숙련도</div>
                            <div className="text-xs text-zinc-600">
                              Lv <span className="font-semibold">{selected.mastery?.level ?? 1}</span> · XP{" "}
                              <span className="font-semibold">{selected.mastery?.xp ?? 0}</span> · 틱{" "}
                              <span className="font-semibold">{selected.mastery?.tickSeconds ?? tickSeconds}s</span>{" "}
                              (기본 {selected.mastery?.baseTickSeconds ?? tickSeconds}s)
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {selected.kind === "PROCESS" ? (
                    <>
                      <button
                        className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={
                          !!busy ||
                          selected.minionCount <= 0 ||
                          (() => {
                            const recipes = recipesByTypeId[selected.workshopTypeId ?? ""] ?? [];
                            return getProcessCraftState(selected, recipes).status !== "ready";
                          })()
                        }
                        onClick={async () => {
                          setBusy("craft-complete");
                          setError(null);
                          try {
                            const out = await postJson(`/api/workshops/craft/complete`, {
                              workshopId: selected.id,
                            });
                            setLastCollectById((prev) => ({ ...prev, [selected.id]: out }));
                            await refresh();
                          } catch (e) {
                            setError(e);
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        제작 수령
                      </button>
                      <div className="text-xs text-zinc-500">
                        제작이 끝나면 재료는 이미 소모된 상태로 결과만 받아. (진행 중에는 수령할 수 없어)
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={
                          !!busy ||
                          selected.kind === "CONSUME" ||
                          selected.minionCount <= 0
                        }
                        onClick={async () => {
                          setBusy("collect");
                          setError(null);
                          try {
                            const r = await postJson<any>("/api/workshops/collect", {
                              workshopId: selected.id,
                            });
                            setLastCollectById((prev) => ({ ...prev, [selected.id]: r }));
                            await refresh();
                          } catch (e) {
                            setError(e);
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        수령하기
                      </button>
                      <div className="text-xs text-zinc-500">
                        {selected.kind === "CONSUME"
                          ? "2차 소모처는 미니언이 배치된 경우에만 레시피로 재료를 제출하고 골드를 받을 수 있어."
                          : selected.minionCount <= 0
                            ? "수집 시설은 미니언이 1마리 이상 배치될 때만 시간이 쌓이고 수령할 수 있어."
                            : "수령하면 틱만큼 시간이 진행되고 인벤토리에 들어가. 미수령으로 쌓이는 틱은 최대 8시간 분량까지만 반영돼."}
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950">
                  <div className="border-b border-white/10 px-3 py-2 text-xs font-semibold text-white/70">
                    {selected.kind === "PROCESS" ? "최근 가공 결과(선택한 시설)" : "최근 수령 결과(선택한 시설)"}
                  </div>
                  {(() => {
                    const last = lastCollectById[selected.id] ?? null;
                    const cards = collectCardsFromLast(last);
                    const rewardGold = (last?.rewardGold ?? last?.payload?.rewardGold) as number | undefined;
                    const hasCards = cards.length > 0;
                    return (
                      <div className="p-3">
                        {hasCards ? (
                          <div className="mb-3 grid gap-2 md:grid-cols-2">
                            {cards.map((c) => (
                              <div
                                key={`${c.itemId}`}
                                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-white/95">
                                    {c.itemName ?? c.itemId}
                                  </div>
                                  <div className="truncate text-[11px] text-white/60">
                                    {c.itemId}
                                    {c.category ? ` · ${c.category}` : ""}
                                  </div>
                                </div>
                                <div className="ml-3 text-right">
                                  <div className="text-sm font-semibold tabular-nums text-white/95">x{c.qty}</div>
                                </div>
                              </div>
                            ))}
                            {typeof rewardGold === "number" && rewardGold > 0 ? (
                              <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                                <div className="text-sm font-semibold text-amber-100">골드 보상</div>
                                <div className="text-sm font-semibold tabular-nums text-amber-100">
                                  +{rewardGold.toLocaleString()}G
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-sm text-white/60">아직 수령 기록이 없어.</div>
                        )}

                        <pre className="max-h-[200px] overflow-auto rounded-xl bg-black/20 px-3 py-3 text-xs leading-5 text-white/80">
                          {JSON.stringify(last ?? { hint: "아직 수령 기록이 없어." }, null, 2)}
                        </pre>
                      </div>
                    );
                  })()}
                </div>

                <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
                  {selected.kind === "PROCESS" || selected.kind === "CONSUME" ? (
                    <>
                      <div className="text-sm font-semibold">제작</div>
                      <div className="mt-1 text-xs text-zinc-600">
                        {selected.minionCount <= 0
                          ? "미니언을 1마리 이상 배치해야 레시피 생산이 가능해."
                          : selected.kind === "CONSUME"
                            ? "입력 재료를 제출하고 보상을 받아."
                            : "제작 시작 시 재료가 바로 소모되고, 레시피에 설정된 시간(×수량)이 지나면 위에서 수령할 수 있어."}
                      </div>
                      {(() => {
                        const recipes = recipesByTypeId[selected.workshopTypeId ?? ""] ?? [];
                        if (!recipes.length) {
                          return (
                            <div className="mt-3 text-sm text-zinc-500">
                              레시피가 없어. (관리자 패널에서 recipes.json 적용)
                            </div>
                          );
                        }

                        const need = new Map<
                          string,
                          { itemId: string; maxNeed: number; totalNeed: number; usedIn: number }
                        >();
                        for (const r of recipes) {
                          for (const i of r.inputs ?? []) {
                            const prev = need.get(i.itemId) ?? {
                              itemId: i.itemId,
                              maxNeed: 0,
                              totalNeed: 0,
                              usedIn: 0,
                            };
                            prev.maxNeed = Math.max(prev.maxNeed, Math.max(0, Math.floor(i.quantity ?? 0)));
                            prev.totalNeed += Math.max(0, Math.floor(i.quantity ?? 0));
                            prev.usedIn += 1;
                            need.set(i.itemId, prev);
                          }
                        }
                        const matRows = Array.from(need.values()).sort((a, b) => b.maxNeed - a.maxNeed);
                        const materialsPanel =
                          matRows.length === 0 ? (
                            <div className="text-sm text-zinc-500">이 시설 레시피에는 입력 재료가 없어.</div>
                          ) : (
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                              <div className="text-xs text-zinc-600">
                                보유량 / 레시피 1회 기준 최대 필요(레시피별 입력 중 최댓값)
                              </div>
                              <div className="mt-2 grid max-h-[min(72vh,720px)] gap-1 overflow-y-auto pr-1">
                                {matRows.map((row) => {
                                  const inv = invByItemId.get(row.itemId);
                                  const have = inv?.quantity ?? 0;
                                  const ok = have >= row.maxNeed;
                                  return (
                                    <div
                                      key={row.itemId}
                                      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="truncate text-xs font-semibold text-zinc-900">
                                          {inv?.name ?? row.itemId}
                                        </div>
                                        <div className="text-[10px] text-zinc-500">{row.itemId}</div>
                                      </div>
                                      <div className="ml-3 text-right text-xs font-semibold tabular-nums">
                                        <span className={ok ? "text-emerald-700" : "text-red-700"}>
                                          {have.toLocaleString()}
                                        </span>
                                        <span className="text-zinc-500"> / {row.maxNeed.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );

                        const recipesPanel =
                          selected.kind === "CONSUME" ? (
                            recipes.map((r) => (
                              <div key={r.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-semibold">{r.name}</div>
                                  {(() => {
                                    const needRt = Math.max(1, Math.min(5, Math.floor(r.minTier ?? 1)));
                                    const tierOk = selectedTier >= needRt;
                                    const materialsOk = (r.inputs ?? []).every((i) => {
                                      const have = invByItemId.get(i.itemId)?.quantity ?? 0;
                                      return have >= Math.max(0, Math.floor(i.quantity ?? 0));
                                    });
                                    const canDo = tierOk && materialsOk;
                                    return (
                                      <div
                                        className={[
                                          "rounded-full px-2 py-1 text-[10px] font-semibold",
                                          canDo
                                            ? "bg-emerald-100 text-emerald-900"
                                            : !tierOk
                                              ? "bg-amber-100 text-amber-950"
                                              : "bg-zinc-100 text-zinc-600",
                                        ].join(" ")}
                                      >
                                        {!tierOk
                                          ? `티어 T${needRt}+ 필요`
                                          : materialsOk
                                            ? "제출 가능"
                                            : "재료 부족"}
                                      </div>
                                    );
                                  })()}
                                  <div className="flex gap-2">
                                    <button
                                      className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                                      disabled={
                                        !!busy ||
                                        selected.minionCount <= 0 ||
                                        selectedTier < Math.max(1, Math.min(5, Math.floor(r.minTier ?? 1))) ||
                                        !(r.inputs ?? []).every((i) => {
                                          const have = invByItemId.get(i.itemId)?.quantity ?? 0;
                                          return have >= Math.max(0, Math.floor(i.quantity ?? 0));
                                        })
                                      }
                                      onClick={async () => {
                                        setBusy("craft-1");
                                        setError(null);
                                        try {
                                          const out = await postJson(`/api/workshops/craft`, {
                                            workshopId: selected.id,
                                            recipeId: r.id,
                                            quantity: 1,
                                          });
                                          setLastCollectById((prev) => ({ ...prev, [selected.id]: out }));
                                          await refresh();
                                        } catch (e) {
                                          setError(e);
                                        } finally {
                                          setBusy(null);
                                        }
                                      }}
                                    >
                                      x1 제출
                                    </button>
                                    <button
                                      className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
                                      disabled={
                                        !!busy ||
                                        selected.minionCount <= 0 ||
                                        selectedTier < Math.max(1, Math.min(5, Math.floor(r.minTier ?? 1))) ||
                                        !(r.inputs ?? []).every((i) => {
                                          const have = invByItemId.get(i.itemId)?.quantity ?? 0;
                                          return have >= Math.max(0, Math.floor(i.quantity ?? 0));
                                        })
                                      }
                                      onClick={async () => {
                                        setBusy("craft-5");
                                        setError(null);
                                        try {
                                          const out = await postJson(`/api/workshops/craft`, {
                                            workshopId: selected.id,
                                            recipeId: r.id,
                                            quantity: 5,
                                          });
                                          setLastCollectById((prev) => ({ ...prev, [selected.id]: out }));
                                          await refresh();
                                        } catch (e) {
                                          setError(e);
                                        } finally {
                                          setBusy(null);
                                        }
                                      }}
                                    >
                                      x5 제출
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-2 text-xs text-zinc-700">
                                  최소 시설 티어 T{Math.max(1, Math.min(5, Math.floor(r.minTier ?? 1)))} · 입력:{" "}
                                  {r.inputs.map((i) => `${i.itemId}x${i.quantity}`).join(" + ")} → 보상:{" "}
                                  <span className="font-semibold">{(r.rewardGold ?? 0).toLocaleString()}G</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            (() => {
                              void clockTick;
                              const pcs = getProcessCraftState(selected, recipes);
                              const blockStart = pcs.status !== "idle";
                              return recipes.map((r) => {
                                const perSec = Math.max(1, Math.floor(r.craftTimeSeconds ?? 60));
                                const thisRunning =
                                  pcs.status === "running" && pcs.recipeId === r.id ? pcs : null;
                                const thisReady = pcs.status === "ready" && pcs.recipeId === r.id;
                                const needRt = Math.max(1, Math.min(5, Math.floor(r.minTier ?? 1)));
                                const tierOk = selectedTier >= needRt;
                                const materialsOk = (r.inputs ?? []).every((i) => {
                                  const have = invByItemId.get(i.itemId)?.quantity ?? 0;
                                  return have >= Math.max(0, Math.floor(i.quantity ?? 0));
                                });
                                const craftable = tierOk && materialsOk;
                                return (
                                  <div key={r.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <div className="text-sm font-semibold">{r.name}</div>
                                        <div
                                          className={[
                                            "rounded-full px-2 py-1 text-[10px] font-semibold",
                                            craftable
                                              ? "bg-emerald-100 text-emerald-900"
                                              : !tierOk
                                                ? "bg-amber-100 text-amber-950"
                                                : "bg-zinc-100 text-zinc-600",
                                          ].join(" ")}
                                        >
                                          {!tierOk
                                            ? `티어 T${needRt}+ 필요`
                                            : materialsOk
                                              ? "제작 가능"
                                              : "재료 부족"}
                                        </div>
                                      </div>
                                      {thisRunning ? (
                                        <div className="text-xs font-semibold text-indigo-700">
                                          제작 중 · 남은{" "}
                                          {formatDuration(Math.ceil(thisRunning.remainingMs / 1000))}
                                        </div>
                                      ) : thisReady ? (
                                        <div className="text-xs font-semibold text-emerald-700">
                                          완료 · 상단 「제작 수령」
                                        </div>
                                      ) : blockStart ? (
                                        <div className="text-xs font-semibold text-zinc-500">
                                          다른 레시피 제작 중
                                        </div>
                                      ) : (
                                        <div className="flex gap-2">
                                          <button
                                            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                                            disabled={!!busy || selected.minionCount <= 0 || blockStart || !craftable}
                                            onClick={async () => {
                                              setBusy("craft-start-1");
                                              setError(null);
                                              try {
                                                await postJson(`/api/workshops/craft/start`, {
                                                  workshopId: selected.id,
                                                  recipeId: r.id,
                                                  quantity: 1,
                                                });
                                                await refresh();
                                              } catch (e) {
                                                setError(e);
                                              } finally {
                                                setBusy(null);
                                              }
                                            }}
                                          >
                                            x1 제작 시작
                                          </button>
                                          <button
                                            className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
                                            disabled={!!busy || selected.minionCount <= 0 || blockStart || !craftable}
                                            onClick={async () => {
                                              setBusy("craft-start-5");
                                              setError(null);
                                              try {
                                                await postJson(`/api/workshops/craft/start`, {
                                                  workshopId: selected.id,
                                                  recipeId: r.id,
                                                  quantity: 5,
                                                });
                                                await refresh();
                                              } catch (e) {
                                                setError(e);
                                              } finally {
                                                setBusy(null);
                                              }
                                            }}
                                          >
                                            x5 제작 시작
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    <div className="mt-2 text-xs text-zinc-700">
                                      최소 시설 티어 T{needRt} · 1회당 제작 {perSec}s · 입력:{" "}
                                      {r.inputs.map((i) => `${i.itemId}x${i.quantity}`).join(" + ")} → 출력:{" "}
                                      {r.outputs
                                        .map((o) =>
                                          o.weight != null
                                            ? `${o.itemId}(${o.weight}) x${o.minQty}~${o.maxQty}`
                                            : `${o.itemId} x${o.minQty}~${o.maxQty}`,
                                        )
                                        .join(", ")}
                                    </div>
                                  </div>
                                );
                              });
                            })()
                          );

                        return (
                          <div className="mt-3 grid gap-4 lg:grid-cols-2 lg:items-start">
                            <aside className="min-w-0">
                              <div className="mb-2 text-xs font-semibold text-zinc-800">재료</div>
                              {materialsPanel}
                            </aside>
                            <section className="min-w-0">
                              <div className="mb-2 text-xs font-semibold text-zinc-800">레시피</div>
                              <div className="grid max-h-[min(72vh,720px)] gap-2 overflow-y-auto pr-1">
                                {recipesPanel}
                              </div>
                            </section>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-semibold">드랍 테이블</div>
                      <div className="mt-1 text-xs text-zinc-600">가중치 기반 확률(대략값) · 수량 범위</div>
                      <div className="mt-3 grid gap-2">
                        {(dropsByKey[selectedDropsKey] ?? []).length === 0 ? (
                          <div className="text-sm text-zinc-500">드랍 정보가 없어.</div>
                        ) : (
                          (dropsByKey[selectedDropsKey] ?? []).map((d) => (
                            <div
                              key={`${d.itemId}:${Math.max(1, Math.min(5, Math.floor(d.minTier ?? 1)))}`}
                              className="grid grid-cols-12 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2"
                            >
                              <div className="col-span-5 min-w-0">
                                <div
                                  className={`truncate text-sm font-semibold ${itemGradeNameClassName(d.grade ?? 1)}`}
                                >
                                  {d.itemName}
                                </div>
                                <div className="text-xs text-zinc-500">
                                  {d.itemId} · {d.category}
                                  {d.gradeLabel ? (
                                    <span className="text-zinc-700">
                                      {" "}
                                      · 등급 <span className="font-semibold text-amber-900">{d.gradeLabel}</span>
                                    </span>
                                  ) : null}
                                  {Math.max(1, Math.min(5, Math.floor(d.minTier ?? 1))) > 1 ? (
                                    <span className="text-zinc-500">
                                      {" "}
                                      · 시설 Lv.{Math.max(1, Math.min(5, Math.floor(d.minTier ?? 1)))} 이상
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="col-span-4">
                                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                                  <div
                                    className="h-full bg-zinc-900"
                                    style={{ width: `${Math.round(d.chance * 1000) / 10}%` }}
                                  />
                                </div>
                                <div className="mt-1 text-xs text-zinc-600">
                                  확률 {Math.round(d.chance * 1000) / 10}% · 가중치 {d.weight}
                                </div>
                              </div>
                              <div className="col-span-3 text-right">
                                <div className="text-xs text-zinc-600">수량</div>
                                <div className="text-sm font-semibold tabular-nums">
                                  {d.minQty}~{d.maxQty}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="text-sm text-zinc-500">위 「내 부지」에서 시설의 「선택」을 눌러 주세요.</div>
            )}
          </div>
        )}
      </div>

      {assignOpen && selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">미니언 배치 관리</div>
                <div className="mt-1 text-xs text-zinc-600">
                  시설: <span className="font-semibold">{selected.name}</span>
                </div>
                <div className="mt-2 text-[11px] leading-snug text-zinc-600">
                  어떤 직업이든 배치할 수 있어. 특화 직업(
                  {assignPreferredJobs.length ? assignPreferredJobs.join(", ") : "—"}) 미니언이 있으면 생산 보너스가 붙고,
                  같은 특화 직업이 3·5·7·10명일 때 시너지가 쌓여.
                </div>
              </div>
              <button
                className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                onClick={() => setAssignOpen(false)}
              >
                닫기
              </button>
            </div>

            {assignBusy ? (
              <div className="mt-4 text-sm text-zinc-600">불러오는 중…</div>
            ) : (
              <div className="mt-4">
                <div className="text-xs font-semibold text-zinc-600">
                  체크된 미니언이 이 시설에 배치돼. (현재 {checkedMinionIds.size}명)
                </div>

                <div className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-zinc-200">
                  {(() => {
                    const eligible = allMinions.filter((m) => {
                      const assignedToThis = assignedMinionIds.has(m.id);
                      const isFree = !m.assignedWorkshop;
                      return isFree || assignedToThis;
                    });
                    const assignedHere = eligible.filter((m) => assignedMinionIds.has(m.id));
                    const available = eligible.filter((m) => !assignedMinionIds.has(m.id));
                    return eligible.length === 0 ? (
                    <div className="p-4 text-sm text-zinc-500">미니언이 없어.</div>
                  ) : (
                    <div className="divide-y divide-zinc-200">
                      {assignedHere.length > 0 ? (
                        <div className="bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-700">
                          현재 배치 중 ({assignedHere.length})
                        </div>
                      ) : (
                        <div className="bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-700">
                          현재 배치 중 (0)
                        </div>
                      )}
                      {assignedHere.map((m) => {
                        const checked = checkedMinionIds.has(m.id);
                        return (
                          <label key={m.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">Lv{m.level}</span>
                                <span className={minionLetterGradeBadgeClassName(m.grade)}>
                                  등급 {m.grade ?? "—"}
                                </span>
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                                  {m.jobType}
                                </span>
                                {assignedMinionIds.has(m.id) ? (
                                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                    현재 배치됨
                                  </span>
                                ) : m.assignedWorkshop ? (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                    다른 곳 배치됨
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-[11px] font-mono text-zinc-500">{m.id}</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = new Set(checkedMinionIds);
                                if (e.target.checked) next.add(m.id);
                                else next.delete(m.id);
                                setCheckedMinionIds(next);
                              }}
                            />
                          </label>
                        );
                      })}
                      <div className="bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-700">
                        배치 가능 ({available.length})
                      </div>
                      {available.map((m) => {
                        const checked = checkedMinionIds.has(m.id);
                        return (
                          <label key={m.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">Lv{m.level}</span>
                                <span className={minionLetterGradeBadgeClassName(m.grade)}>
                                  등급 {m.grade ?? "—"}
                                </span>
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                                  {m.jobType}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] font-mono text-zinc-500">{m.id}</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = new Set(checkedMinionIds);
                                if (e.target.checked) next.add(m.id);
                                else next.delete(m.id);
                                setCheckedMinionIds(next);
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  );
                  })()}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    className="h-10 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900"
                    onClick={() => setAssignOpen(false)}
                  >
                    취소
                  </button>
                  <button
                    className="h-10 flex-1 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={assignBusy}
                    onClick={() => void submitAssignModal()}
                  >
                    적용
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

