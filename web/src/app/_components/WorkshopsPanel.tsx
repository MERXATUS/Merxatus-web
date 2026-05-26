"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CraftMotionOverlay } from "@/app/_components/CraftMotionOverlay";
import { CraftReveal, type CraftRevealCard, type CraftValueHintsView } from "@/app/_components/CraftReveal";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { GAME_RULES } from "@/server/gameRules";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import {
  playerMatchesProcessWorkshop,
  processWorkshopNamesForProfession,
  type SpecialistProfessionSlug,
} from "@/shared/specialistProfession";
import { notifyTutorialRefresh } from "@/app/_components/TutorialPanel";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { GATHER_TUTORIAL_WORKSHOPS } from "@/shared/tutorial";
import { isUnauthorizedError } from "@/shared/sessionClient";

export type WorkshopsPanelVariant = "gather" | "specialist";

const GATHER_ACTIVITY_NAMES = ["광산", "낚시터", "탐험", "고고학"] as const;

const GATHER_MINION_JOB_LABEL: Record<string, string> = {
  MINER: "광부",
  FISHER: "낚시꾼",
  EXPLORER: "탐험가",
  ARCHAEOLOGIST: "고고학자",
};

function workshopsForPanelVariant(
  list: Workshop[],
  variant: WorkshopsPanelVariant,
  specialistProfession: string | null,
): Workshop[] {
  if (variant === "gather") return list.filter((w) => (w.kind ?? "GATHER") === "GATHER");
  if (!specialistProfession) return [];
  return list.filter(
    (w) => w.kind === "PROCESS" && playerMatchesProcessWorkshop(w.name, specialistProfession),
  );
}

type Workshop = {
  id: string;
  /** 부지 슬롯 0~2 */
  plotSlot?: number | null;
  name: string;
  kind?: "GATHER" | "PROCESS";
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
  icon?: string | null;
  iconSrc?: string;
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
  /** 시설 티어(1~5) 이상일 때만 제작·제출 가능 */
  minTier?: number;
  /** 가공: 1회당 제작 시간(초) */
  craftTimeSeconds?: number;
  inputs: Array<{ itemId: string; quantity: number }>;
  outputs: Array<{ itemId: string; weight: number | null; minQty: number; maxQty: number }>;
};

function recipeMinTier(r: Recipe): number {
  return Math.max(1, Math.min(5, Math.floor(r.minTier ?? 1)));
}

/** 전문 작업장: 현재 시설 티어에서 제작 가능한 레시피만 */
function recipesForWorkshopTier(recipes: Recipe[], workshopTier: number): Recipe[] {
  const tier = Math.max(1, Math.min(5, Math.floor(workshopTier)));
  return recipes.filter((r) => recipeMinTier(r) <= tier);
}

type MinionRow = {
  id: string;
  jobType: string;
  level: number;
  combatStats?: { combatPower: number };
  equippedWeapon?: { id: string; baseItemId: string; name: string; enhanceLevel: number } | null;
  assignedWorkshop?: { workshopId: string; workshopName: string; workshopKind: string } | null;
};

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

export function WorkshopsPanel({ variant = "gather" }: { variant?: WorkshopsPanelVariant }) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [tickSeconds, setTickSeconds] = useState(60);
  const [workshopTypes, setWorkshopTypes] = useState<WorkshopTypeOption[]>([]);
  const [workshopActionBusy, setWorkshopActionBusy] = useState(false);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [wallet, setWallet] = useState<{ goldAvailable: number; goldLocked: number } | null>(null);
  const [inventory, setInventory] = useState<Array<{ itemId: string; name: string; quantity: number }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string>("");
  /** 수령 직후 버튼 위에 잠깐 보여 줄 카드 (GATHER 전용) */
  const [gatherCollectToast, setGatherCollectToast] = useState<{
    cards: Array<{ itemId: string; itemName?: string; category?: string; qty: number }>;
    key: number;
  } | null>(null);
  const gatherCollectToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tutorialGrantMsg, setTutorialGrantMsg] = useState<string | null>(null);
  const tutorialGrantTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dropsByKey, setDropsByKey] = useState<Record<string, DropRow[]>>({});
  const [recipesByTypeId, setRecipesByTypeId] = useState<Record<string, Recipe[]>>({});
  const [minions, setMinions] = useState<{
    owned: number;
    assigned: number;
    free: number;
    nextPrice: number;
    maxGatherOwned?: number;
  } | null>(
    null,
  );

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [allMinions, setAllMinions] = useState<MinionRow[]>([]);
  const [assignedMinionIds, setAssignedMinionIds] = useState<Set<string>>(new Set());
  const [checkedMinionIds, setCheckedMinionIds] = useState<Set<string>>(new Set());
  const [assignPreferredJobs, setAssignPreferredJobs] = useState<string[]>([]);
  const [specialistUnlocked, setSpecialistUnlocked] = useState(false);
  const [specialistProfession, setSpecialistProfession] = useState<string | null>(null);
  const [craftMotion, setCraftMotion] = useState<{
    workshopId: string;
    recipeId: string;
    recipeName: string;
    quantity: number;
  } | null>(null);
  const pendingCraftRef = useRef<typeof craftMotion>(null);
  const craftRunInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const [craftReveal, setCraftReveal] = useState<{
    recipeName: string;
    cards: CraftRevealCard[];
    valueHints?: CraftValueHintsView | null;
  } | null>(null);

  const nowMsRef = useRef(Date.now());
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    return () => {
      if (gatherCollectToastTimerRef.current) clearTimeout(gatherCollectToastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setGatherCollectToast(null);
    if (gatherCollectToastTimerRef.current) {
      clearTimeout(gatherCollectToastTimerRef.current);
      gatherCollectToastTimerRef.current = null;
    }
  }, [selectedWorkshopId]);

  useEffect(() => {
    if (!user || variant !== "gather") {
      if (variant !== "gather") setWorkshopTypes([]);
      return;
    }
    void getJson<{ ok: boolean; types: WorkshopTypeOption[] }>("/api/workshops/types")
      .then((r) => {
        if (r?.ok && Array.isArray(r.types)) setWorkshopTypes(r.types);
      })
      .catch(() => setWorkshopTypes([]));
  }, [user?.id, variant]);

  useEffect(() => {
    const t = setInterval(() => {
      nowMsRef.current = Date.now();
      setClockTick((x) => (x + 1) % 10_000);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  async function refresh(options?: { silent?: boolean }) {
    const silent = options?.silent === true;
    if (refreshInFlightRef.current) return;
    if (!user) {
      if (!silent) {
        setBusy(null);
        setWorkshops([]);
        setMinions(null);
        setWallet(null);
        setInventory([]);
        setError(null);
      }
      return;
    }
    refreshInFlightRef.current = true;
    if (!silent) setBusy("refresh");
    if (!silent) setError(null);
    try {
      if (variant === "gather") {
        const [r, m, me] = await Promise.all([
          getJson<{
            ok: boolean;
            tickSeconds: number;
            workshopMaxCount?: number;
            workshops: Workshop[];
          }>("/api/workshops/list"),
          getJson<{
            ok: boolean;
            owned: number;
            assigned: number;
            free: number;
            nextPrice: number;
            maxGatherOwned?: number;
          }>(`/api/minions/state`),
          getJson<{
            ok: boolean;
            wallet: { goldAvailable: number; goldLocked: number };
            inventory?: Array<{ itemId: string; name: string; quantity: number }>;
            specialistUnlocked?: boolean;
            specialistProfession?: string | null;
          }>(`/api/me/state`),
        ]);
        setTickSeconds(r.tickSeconds ?? 60);
        setWorkshops(r.workshops ?? []);
        if (m?.ok) {
          setMinions({
            owned: m.owned,
            assigned: m.assigned,
            free: m.free,
            nextPrice: m.nextPrice,
            maxGatherOwned: m.maxGatherOwned ?? 10,
          });
        }
        if ((me as any)?.ok) {
          setWallet({ goldAvailable: me.wallet?.goldAvailable ?? 0, goldLocked: me.wallet?.goldLocked ?? 0 });
          setInventory((me as any).inventory ?? []);
          setSpecialistUnlocked(Boolean((me as any).specialistUnlocked));
          setSpecialistProfession(
            (me as any).specialistProfession != null ? String((me as any).specialistProfession) : null,
          );
        }
      } else {
        const [r, panel] = await Promise.all([
          getJson<{
            ok: boolean;
            tickSeconds: number;
            workshopMaxCount?: number;
            workshops: Workshop[];
          }>("/api/workshops/list"),
          getJson<{
            ok: boolean;
            wallet: { goldAvailable: number; goldLocked: number };
            inventory: Array<{ itemId: string; name: string; quantity: number }>;
            specialistUnlocked: boolean;
            specialistProfession: string | null;
          }>("/api/me/workshop-panel"),
        ]);
        setTickSeconds(r.tickSeconds ?? 60);
        setWorkshops(r.workshops ?? []);
        if (panel.ok) {
          setWallet(panel.wallet);
          setInventory(panel.inventory ?? []);
          setSpecialistUnlocked(panel.specialistUnlocked);
          setSpecialistProfession(panel.specialistProfession);
        }
      }
    } catch (e) {
      if (!silent && !isUnauthorizedError(e)) setError(e);
    } finally {
      refreshInFlightRef.current = false;
      if (!silent) setBusy(null);
    }
  }

  function startCraftMotion(payload: {
    workshopId: string;
    recipeId: string;
    recipeName: string;
    quantity: number;
  }) {
    pendingCraftRef.current = payload;
    setCraftMotion(payload);
    setError(null);
  }

  const onCraftMotionComplete = useCallback(async () => {
    if (craftRunInFlightRef.current) return;
    const m = pendingCraftRef.current;
    if (!m) return;
    craftRunInFlightRef.current = true;
    pendingCraftRef.current = null;
    setCraftMotion(null);
    setBusy(`craft-${m.quantity}`);
    setError(null);
    try {
      const done = await postJson(`/api/workshops/craft/run`, {
        workshopId: m.workshopId,
        recipeId: m.recipeId,
        quantity: m.quantity,
      });
      const cards = craftRewardCardsFromPayload(done);
      setWorkshops((prev) =>
        prev.map((w) =>
          w.id === m.workshopId
            ? {
                ...w,
                processCraftRecipeId: null,
                processCraftEndsAt: null,
                processCraftQuantity: 0,
              }
            : w,
        ),
      );
      if (cards.length > 0) {
        const valueHints = (done as { valueHints?: CraftValueHintsView | null }).valueHints ?? null;
        setCraftReveal({ recipeName: m.recipeName, cards, valueHints });
        if ((done as { tutorialAdvanced?: boolean }).tutorialAdvanced) {
          notifyTutorialRefresh();
        }
      }
      window.dispatchEvent(new Event("auth_session_changed"));
      await refresh({ silent: true });
    } catch (e) {
      setError(e);
    } finally {
      craftRunInFlightRef.current = false;
      setBusy(null);
    }
  }, []);

  async function openAssignModal() {
    if (!selected) return;
    if ((selected.kind ?? "GATHER") === "PROCESS") {
      setError({
        ok: false,
        error: "가공 시설에는 미니언을 배치하지 않아. 수집 시설만 미니언을 두고, 가공은 플레이어 전문 직업으로 진행해.",
      });
      return;
    }
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

    const isGatherWs = (selected.kind ?? "GATHER") === "GATHER";
    const allowed = new Set(assignPreferredJobs);
    if (isGatherWs && allowed.size > 0) {
      const bad = assignIds.filter((id) => {
        const m = allMinions.find((x) => x.id === id);
        return m && !allowed.has(m.jobType);
      });
      if (bad.length > 0) {
        const labels = assignPreferredJobs.map((j) => GATHER_MINION_JOB_LABEL[j] ?? j).join(", ");
        setError({
          ok: false,
          error: `MINION_JOB_NOT_ALLOWED_FOR_WORKSHOP:${selected.name}:${labels}`,
        });
        return;
      }
    }

    if (isGatherWs && (assignIds.length > 0 || unassignIds.length > 0)) {
      const m = workshopMetrics(selected);
      let msg: string | null = null;
      if (unassignIds.length > 0) {
        msg =
          "미니언을 제거하면 누적 틱이 초기화됩니다." +
          (m.wholeTicks > 0 ? `\n\n현재 누적 틱 ${m.wholeTicks}이 사라집니다.` : "") +
          "\n\n정말 초기화하시겠습니까?";
      } else if (assignIds.length > 0 && (prev.size > 0 || m.wholeTicks > 0)) {
        msg =
          "미니언을 추가·변경하면 누적 틱이 초기화됩니다." +
          (m.wholeTicks > 0 ? `\n\n현재 누적 틱 ${m.wholeTicks}이 0으로 돌아갑니다.` : "") +
          "\n\n계속하시겠습니까?";
      }
      if (msg && !window.confirm(msg)) return;
    }

    setAssignBusy(true);
    setError(null);
    try {
      const r = await postJson<{
        ok: boolean;
        minionCount?: number;
        ticksReset?: boolean;
        lastCollectedAt?: string;
      }>("/api/workshops/minions", {
        workshopId: selected.id,
        assignMinionIds: assignIds,
        unassignMinionIds: unassignIds,
      });
      if (r?.ticksReset && r.lastCollectedAt) {
        setWorkshops((list) =>
          list.map((w) =>
            w.id === selected.id
              ? {
                  ...w,
                  lastCollectedAt: r.lastCollectedAt!,
                  ...(typeof r.minionCount === "number" ? { minionCount: r.minionCount } : {}),
                }
              : w,
          ),
        );
      }
      setAssignOpen(false);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setAssignBusy(false);
    }
  }

  useEffect(() => {
    if (sessionLoading) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionLoading, variant]);

  useEffect(() => {
    if (sessionLoading || !user || variant !== "gather") return;
    const t = setInterval(() => {
      void refresh({ silent: true });
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, variant]);

  const invByItemId = useMemo(() => {
    const m = new Map<string, { itemId: string; name: string; quantity: number }>();
    for (const row of inventory) m.set(row.itemId, row);
    return m;
  }, [inventory]);

  const dropIconByItemId = useMemo(() => {
    const m = new Map<string, { icon?: string | null; iconSrc?: string }>();
    for (const rows of Object.values(dropsByKey)) {
      for (const row of rows) {
        m.set(row.itemId, { icon: row.icon, iconSrc: row.iconSrc });
      }
    }
    return m;
  }, [dropsByKey]);

  const visibleWorkshops = useMemo(
    () => workshopsForPanelVariant(workshops, variant, specialistProfession),
    [workshops, variant, specialistProfession],
  );

  const orderedVisibleWorkshops = useMemo(() => {
    return [...visibleWorkshops].sort((a, b) => {
      const pa = typeof a.plotSlot === "number" ? a.plotSlot : 1e9;
      const pb = typeof b.plotSlot === "number" ? b.plotSlot : 1e9;
      if (pa !== pb) return pa - pb;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [visibleWorkshops]);

  const workshopCap = GAME_RULES.workshop.maxInstancesPerUser;

  const selected = useMemo(() => {
    const w = workshops.find((x) => x.id === selectedWorkshopId) ?? null;
    if (!w) return null;
    if (!visibleWorkshops.some((x) => x.id === w.id)) return null;
    return w;
  }, [workshops, selectedWorkshopId, visibleWorkshops]);

  const staleCraftRecoverRef = useRef(false);
  const [recoveringStaleCraft, setRecoveringStaleCraft] = useState(false);
  useEffect(() => {
    if (variant !== "specialist" || !selected || (selected.kind ?? "GATHER") !== "PROCESS") return;
    if (!selected.processCraftRecipeId || craftMotion || busy || craftRunInFlightRef.current) return;
    if (staleCraftRecoverRef.current) return;
    const workshopId = selected.id;
    staleCraftRecoverRef.current = true;
    setRecoveringStaleCraft(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await postJson("/api/workshops/craft/complete", {
            workshopId,
            forceReady: true,
          });
          setWorkshops((prev) =>
            prev.map((w) =>
              w.id === workshopId
                ? {
                    ...w,
                    processCraftRecipeId: null,
                    processCraftEndsAt: null,
                    processCraftQuantity: 0,
                  }
                : w,
            ),
          );
          window.dispatchEvent(new Event("auth_session_changed"));
          await refresh({ silent: true });
        } catch {
          /* 무시 — 제작 시 CRAFT_IN_PROGRESS로 안내 */
        } finally {
          staleCraftRecoverRef.current = false;
          setRecoveringStaleCraft(false);
        }
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    variant,
    selected?.id,
    selected?.processCraftRecipeId,
    selected?.kind,
    craftMotion,
    busy,
  ]);

  const gatherCollectReady = useMemo(() => {
    if (!selected || (selected.kind ?? "GATHER") !== "GATHER") return false;
    if (selected.minionCount <= 0) return false;
    return workshopMetrics(selected).wholeTicks > 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clockTick drives live tick countdown
  }, [selected, clockTick, tickSeconds]);

  const closeAssignModal = useCallback(() => setAssignOpen(false), []);
  useEscapeClose(assignOpen && !!selected, closeAssignModal);

  useEffect(() => {
    if (variant !== "gather") return;
    if (selectedWorkshopId) {
      const w = workshops.find((x) => x.id === selectedWorkshopId);
      if (w && (w.kind ?? "GATHER") === "GATHER") {
        return;
      }
    }
    for (const name of GATHER_ACTIVITY_NAMES) {
      const w = workshops.find((x) => (x.kind ?? "GATHER") === "GATHER" && x.name === name);
      if (w) {
        setSelectedWorkshopId(w.id);
        return;
      }
    }
  }, [variant, workshops, selectedWorkshopId]);

  useEffect(() => {
    if (variant !== "specialist" || !specialistProfession) return;
    if (selectedWorkshopId && visibleWorkshops.some((w) => w.id === selectedWorkshopId)) return;
    const names = processWorkshopNamesForProfession(specialistProfession as SpecialistProfessionSlug);
    for (const name of names) {
      const w = visibleWorkshops.find((x) => x.name === name);
      if (w) {
        setSelectedWorkshopId(w.id);
        return;
      }
    }
    if (orderedVisibleWorkshops[0]) setSelectedWorkshopId(orderedVisibleWorkshops[0].id);
  }, [variant, specialistProfession, selectedWorkshopId, visibleWorkshops, orderedVisibleWorkshops]);

  const selectGatherActivity = useCallback(
    async (name: (typeof GATHER_ACTIVITY_NAMES)[number]) => {
      if (!user) {
        setError("로그인이 필요해요.");
        return;
      }
      const existing = workshops.find((x) => (x.kind ?? "GATHER") === "GATHER" && x.name === name);
      if (existing) {
        setSelectedWorkshopId(existing.id);
        if (GATHER_TUTORIAL_WORKSHOPS.includes(name)) {
          try {
            await postJson("/api/tutorial/gather-visit", { workshopName: name });
            notifyTutorialRefresh();
          } catch {
            /* ignore */
          }
        }
        return;
      }
      const type = workshopTypes.find((t) => t.kind === "GATHER" && t.name === name);
      if (!type) {
        setError(`${name} 시설 타입이 서버에 없어요. workshops.json을 반영한 뒤 시드를 다시 실행해 주세요.`);
        return;
      }
      setWorkshopActionBusy(true);
      setError(null);
      try {
        const r = await postJson<{ ok?: boolean; workshopId?: string }>("/api/workshops/plot/install", {
          workshopTypeId: type.id,
        });
        const wid = typeof r?.workshopId === "string" ? r.workshopId : "";
        if (wid) setSelectedWorkshopId(wid);
        if (GATHER_TUTORIAL_WORKSHOPS.includes(name)) {
          try {
            await postJson("/api/tutorial/gather-visit", { workshopName: name });
            notifyTutorialRefresh();
          } catch {
            /* ignore */
          }
        }
        await refresh();
      } catch (e) {
        setError(e);
      } finally {
        setWorkshopActionBusy(false);
      }
    },
    [user, workshops, workshopTypes],
  );

  const selectedTier = useMemo(() => {
    if (!selected) return 1;
    return Math.max(1, Math.min(5, Math.floor(selected.tier ?? 1)));
  }, [selected]);

  const processCraftAllowed = useMemo(() => {
    if (!selected || (selected.kind ?? "GATHER") !== "PROCESS") return true;
    if (!specialistUnlocked) return false;
    return playerMatchesProcessWorkshop(selected.name, specialistProfession);
  }, [selected, specialistUnlocked, specialistProfession]);

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

  // 현재 패널에서 선택 가능한 시설이 바뀌면 선택 ID 보정
  useEffect(() => {
    if (!visibleWorkshops.length) {
      setSelectedWorkshopId("");
      return;
    }
    setSelectedWorkshopId((prev) => {
      if (!prev) return visibleWorkshops[0]!.id;
      const ok = visibleWorkshops.some((w) => w.id === prev);
      return ok ? prev : visibleWorkshops[0]!.id;
    });
  }, [visibleWorkshops]);

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

  function isWeaponOrToolItem(itemId: string, category?: string) {
    return (
      category === "무기" ||
      category === "도구" ||
      itemId.startsWith("weapon_") ||
      itemId.startsWith("tool_")
    );
  }

  /** 제작 결과 공개용 — 무기/도구는 인스턴스만, 재료는 producedCards */
  function craftRewardCardsFromPayload(payload: unknown): CraftRevealCard[] {
    const inst = (
      payload as {
        craftedInstances?: Array<{
          itemId: string;
          itemName?: string;
          kind: string;
          instanceId: string;
        }>;
      }
    )?.craftedInstances;

    const byItemId = new Map<string, CraftRevealCard>();

    if (Array.isArray(inst)) {
      for (const row of inst) {
        const prev = byItemId.get(row.itemId);
        if (prev) {
          prev.qty += 1;
          continue;
        }
        byItemId.set(row.itemId, {
          itemId: row.itemId,
          itemName: row.itemName ?? row.itemId,
          category: row.kind === "weapon" ? "무기" : row.kind === "tool" ? "도구" : "",
          qty: 1,
        });
      }
    }

    for (const c of collectCardsFromLast(payload)) {
      if (isWeaponOrToolItem(c.itemId, c.category)) continue;
      const prev = byItemId.get(c.itemId);
      if (prev) {
        prev.qty += Math.max(1, c.qty);
      } else {
        byItemId.set(c.itemId, {
          itemId: c.itemId,
          itemName: c.itemName ?? c.itemId,
          category: c.category,
          qty: Math.max(1, c.qty),
        });
      }
    }

    return Array.from(byItemId.values());
  }

  function collectCardsFromLast(payload: any): Array<{ itemId: string; itemName?: string; category?: string; qty: number }> {
    const rows = payload?.producedCards ?? payload?.payload?.producedCards ?? null;
    if (Array.isArray(rows) && rows.length) return rows as any;
    const produced = payload?.produced ?? payload?.payload?.produced ?? null;
    if (Array.isArray(produced) && produced.length) return produced as any;
    return [];
  }

  return (
    <GamePanel className="workshop-shell flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-semibold text-[var(--game-text)]">
          {variant === "gather" ? "수집" : "전문 작업장"}
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-[var(--game-border)] bg-black/25 px-3 py-2 text-xs">
            <span className="text-[var(--game-muted)]">골드 </span>
            <span className="font-semibold tabular-nums text-[var(--game-gold-bright)]">
              {(wallet?.goldAvailable ?? 0).toLocaleString()}G
            </span>
          </div>
          <GameBtn variant="ghost" disabled={!!busy} onClick={() => void refresh()}>
            새로고침
          </GameBtn>
        </div>
      </div>

      {tutorialGrantMsg ? (
        <div className="mt-3 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100">
          {tutorialGrantMsg}
        </div>
      ) : null}

      {error ? <GamePanelError error={error} className="mt-0" /> : null}

      {sessionLoading ? (
        <GamePanelLoading label="세션 확인 중…" />
      ) : !user ? (
        <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
      ) : null}

      {!sessionLoading && user && variant === "gather" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="text-sm font-semibold text-emerald-950">수집 활동</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {GATHER_ACTIVITY_NAMES.map((name) => {
              const w = workshops.find((x) => (x.kind ?? "GATHER") === "GATHER" && x.name === name) ?? null;
              const isActive = !!selected && selected.name === name;
              return (
                <button
                  key={name}
                  type="button"
                  className={[
                    "h-11 min-w-[5.5rem] rounded-xl border px-3 text-sm font-semibold transition-colors",
                    isActive
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-emerald-300 bg-white text-emerald-950 hover:bg-emerald-100",
                  ].join(" ")}
                  disabled={!user || workshopActionBusy}
                  onClick={() => void selectGatherActivity(name)}
                >
                  {name}
                  {!w ? <span className="ml-1 text-[10px] font-normal opacity-80">(신규)</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!sessionLoading && user ? (
      <>
      <div className={variant === "gather" ? "mt-4" : ""}>
        {selected ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <>
                {variant === "gather" ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-sm font-semibold">미니언</div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <div>
                      <span className="text-xs text-zinc-600">수집 미니언</span>{" "}
                      <span className="font-semibold">
                        {minions?.owned ?? "—"}/{minions?.maxGatherOwned ?? 10}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-600">배치</span>{" "}
                      <span className="font-semibold">{minions?.assigned ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-600">남음</span>{" "}
                      <span className="font-semibold">{minions?.free ?? "—"}</span>
                    </div>
                  </div>
                </div>
                ) : null}

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
                  </div>
                  {variant === "gather" ? (
                    <div className="flex items-center gap-2">
                      <button
                        className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                        disabled={!!busy || (selected.kind ?? "GATHER") === "PROCESS"}
                        onClick={() => void openAssignModal()}
                      >
                        미니언 배치 관리
                      </button>
                      <div className="min-w-[120px] text-center">
                        <div className="text-xs text-zinc-600">미니언</div>
                        <div className="text-sm font-semibold">{selected.minionCount}</div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {(() => {
                    const kind = selected.kind ?? "GATHER";
                    if (kind === "PROCESS") {
                      return (
                        <>
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

                {selected.kind === "PROCESS" ? null : (
                  <div className="mt-4">
                    {gatherCollectToast && gatherCollectToast.cards.length > 0 ? (
                      <div
                        key={gatherCollectToast.key}
                        className="workshops-collect-toast mb-3 rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white px-4 py-3 shadow-md shadow-emerald-900/10"
                      >
                        <div className="text-xs font-semibold text-emerald-900">이번에 받은 아이템</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {gatherCollectToast.cards.map((c) => (
                            <div
                              key={`${c.itemId}-${gatherCollectToast.key}`}
                              className="flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-emerald-100 bg-white/90 px-2.5 py-2 shadow-sm"
                            >
                              <ItemIcon
                                itemId={c.itemId}
                                icon={dropIconByItemId.get(c.itemId)?.icon}
                                iconSrc={dropIconByItemId.get(c.itemId)?.iconSrc}
                                size={36}
                              />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-zinc-900">
                                  {c.itemName ?? c.itemId}
                                </div>
                                <div className="text-xs font-semibold tabular-nums text-emerald-800">
                                  ×{c.qty.toLocaleString()}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={!!busy || !gatherCollectReady}
                        onClick={async () => {
                          setBusy("collect");
                          setError(null);
                          try {
                            const r = await postJson<any>("/api/workshops/collect", {
                              workshopId: selected.id,
                            });
                            const collectedAt =
                              typeof r?.lastCollectedAt === "string"
                                ? r.lastCollectedAt
                                : new Date().toISOString();
                            const masteryAfter = r?.mastery?.after;
                            setWorkshops((prev) =>
                              prev.map((w) =>
                                w.id === selected.id
                                  ? {
                                      ...w,
                                      lastCollectedAt: collectedAt,
                                      ...(masteryAfter ? { mastery: masteryAfter } : {}),
                                    }
                                  : w,
                              ),
                            );
                            const cards = collectCardsFromLast(r);
                            if (gatherCollectToastTimerRef.current) {
                              clearTimeout(gatherCollectToastTimerRef.current);
                              gatherCollectToastTimerRef.current = null;
                            }
                            if (cards.length > 0) {
                              setGatherCollectToast({ cards, key: Date.now() });
                              gatherCollectToastTimerRef.current = setTimeout(() => {
                                setGatherCollectToast(null);
                                gatherCollectToastTimerRef.current = null;
                              }, 2400);
                            } else {
                              setGatherCollectToast(null);
                            }
                            await refresh();
                            notifyTutorialRefresh();
                            const grants = Array.isArray(r?.tutorialMinionGrants)
                              ? r.tutorialMinionGrants.filter(
                                  (g: { message?: string; jobType?: string }) =>
                                    g?.jobType === "FISHER" && !!g?.message,
                                )
                              : [];
                            const granted = grants.filter((g: { granted?: boolean }) => g?.granted);
                            if (granted.length > 0 || grants.some((g: { granted?: boolean }) => !g.granted)) {
                              window.dispatchEvent(new Event("auth_session_changed"));
                              const msg = (granted.length > 0 ? granted : grants)
                                .map((g: { message?: string }) => g.message)
                                .filter(Boolean)
                                .join(" ");
                              setTutorialGrantMsg(msg);
                              if (tutorialGrantTimerRef.current) {
                                clearTimeout(tutorialGrantTimerRef.current);
                              }
                              tutorialGrantTimerRef.current = setTimeout(() => {
                                setTutorialGrantMsg(null);
                                tutorialGrantTimerRef.current = null;
                              }, 5000);
                            }
                          } catch (e) {
                            setError(e);
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        수령하기
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
                  {selected.kind === "PROCESS" ? (
                    <>
                      <div className="text-sm font-semibold">제작</div>
                      {(() => {
                        const allRecipes = recipesByTypeId[selected.workshopTypeId ?? ""] ?? [];
                        const recipes =
                          variant === "specialist"
                            ? recipesForWorkshopTier(allRecipes, selectedTier)
                            : allRecipes;
                        if (!recipes.length) {
                          return (
                            <div className="mt-3 text-sm text-zinc-500">
                              {allRecipes.length > 0 && variant === "specialist"
                                ? `현재 시설 T${selectedTier}에서 제작 가능한 레시피가 없어요. 티어 업그레이드 후 다시 확인해 주세요.`
                                : "레시피 없음"}
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
                            <div className="text-sm text-zinc-500">—</div>
                          ) : (
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                              <div className="grid max-h-[min(72vh,720px)] gap-1 overflow-y-auto pr-1">
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

                        const recipesPanel = (() => {
                          void clockTick;
                          const craftLocked =
                            !!craftMotion ||
                            recoveringStaleCraft ||
                            (!!busy && busy.startsWith("craft"));
                          return recipes.map((r) => {
                                const perSec = Math.max(1, Math.floor(r.craftTimeSeconds ?? 60));
                                const needRt = recipeMinTier(r);
                                const materialsOk = (r.inputs ?? []).every((i) => {
                                  const have = invByItemId.get(i.itemId)?.quantity ?? 0;
                                  return have >= Math.max(0, Math.floor(i.quantity ?? 0));
                                });
                                const craftable = materialsOk;
                                return (
                                  <div key={r.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <div className="text-sm font-semibold">{r.name}</div>
                                        <div
                                          className={[
                                            "rounded-full px-2 py-1 text-[10px] font-semibold",
                                            craftable ? "bg-emerald-100 text-emerald-900" : "bg-zinc-100 text-zinc-600",
                                          ].join(" ")}
                                        >
                                          {materialsOk ? "제작 가능" : "재료 부족"}
                                        </div>
                                      </div>
                                      {craftMotion?.recipeId === r.id ? (
                                        <div className="text-xs font-semibold text-amber-700">제작 준비 중…</div>
                                      ) : (
                                        <div className="flex gap-2">
                                          <button
                                            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                                            disabled={
                                              !!busy ||
                                              craftLocked ||
                                              !processCraftAllowed ||
                                              !craftable
                                            }
                                            onClick={() => {
                                              if (!selected) return;
                                              startCraftMotion({
                                                workshopId: selected.id,
                                                recipeId: r.id,
                                                recipeName: r.name,
                                                quantity: 1,
                                              });
                                            }}
                                          >
                                            x1 제작 시작
                                          </button>
                                          <button
                                            className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
                                            disabled={
                                              craftLocked ||
                                              !processCraftAllowed ||
                                              !craftable
                                            }
                                            onClick={() => {
                                              if (!selected) return;
                                              startCraftMotion({
                                                workshopId: selected.id,
                                                recipeId: r.id,
                                                recipeName: r.name,
                                                quantity: 5,
                                              });
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
                        })();

                        return (
                          <div className="mt-3 grid gap-4 lg:grid-cols-2 lg:items-start">
                            <aside className="min-w-0">
                              <div className="mb-2 text-xs font-semibold text-zinc-800">재료</div>
                              {materialsPanel}
                            </aside>
                            <section className="min-w-0">
                              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                                <div className="text-xs font-semibold text-zinc-800">레시피</div>
                                {variant === "specialist" ? (
                                  <div className="text-[10px] text-zinc-500">시설 T{selectedTier} 이하</div>
                                ) : null}
                              </div>
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
                      <div className="mt-3 grid gap-2">
                        {(dropsByKey[selectedDropsKey] ?? []).length === 0 ? (
                          <div className="text-sm text-zinc-500">—</div>
                        ) : (
                          (dropsByKey[selectedDropsKey] ?? []).map((d) => (
                            <div
                              key={`${d.itemId}:${Math.max(1, Math.min(5, Math.floor(d.minTier ?? 1)))}`}
                              className="grid grid-cols-12 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2"
                            >
                              <div className="col-span-5 flex min-w-0 items-center gap-2">
                                <ItemIcon itemId={d.itemId} icon={d.icon} iconSrc={d.iconSrc} size={40} />
                                <div className="min-w-0">
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
          </div>
        ) : null}
      </div>

      {assignOpen && selected && variant === "gather" ? (
        <div className="workshop-assign-overlay fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label="닫기"
            className="absolute inset-0 bg-black/70"
            onClick={() => setAssignOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="workshop-assign-title"
            className="workshop-assign-modal game-modal relative z-[1] flex max-h-[min(90dvh,40rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div id="workshop-assign-title" className="text-sm font-semibold text-[var(--game-text)]">
                  미니언 배치 관리
                </div>
                <div className="mt-1 text-xs text-[var(--game-muted)]">
                  {selected.name}
                </div>
              </div>
              <GameBtn variant="ghost" className="h-9 shrink-0 px-3 text-xs" onClick={() => setAssignOpen(false)}>
                닫기
              </GameBtn>
            </div>

            {assignBusy ? (
              <div className="mt-4 text-sm text-[var(--game-muted)]">불러오는 중…</div>
            ) : (
              <div className="mt-4 min-h-0 flex-1 flex flex-col">
                <div className="workshop-assign-modal__list mt-3 min-h-0 flex-1 overflow-auto rounded-xl border">
                  {(() => {
                    const isGatherWs = (selected.kind ?? "GATHER") === "GATHER";
                    const allowed = new Set(assignPreferredJobs);
                    const jobOk = (m: MinionRow) =>
                      !isGatherWs || allowed.size === 0 || allowed.has(m.jobType);

                    const eligible = allMinions.filter((m) => {
                      const assignedToThis = assignedMinionIds.has(m.id);
                      const isFree = !m.assignedWorkshop;
                      if (!assignedToThis && !jobOk(m)) return false;
                      return isFree || assignedToThis;
                    });
                    const assignedHere = eligible.filter((m) => assignedMinionIds.has(m.id));
                    const available = eligible.filter((m) => !assignedMinionIds.has(m.id));
                    return eligible.length === 0 ? (
                    <div className="p-4 text-sm text-[var(--game-muted)]">미니언이 없어.</div>
                  ) : (
                    <div className="divide-y divide-[var(--game-border)]">
                      {assignedHere.length > 0 ? (
                        <div className="workshop-assign-modal__group-head px-4 py-2 text-xs font-semibold">
                          현재 배치 중 ({assignedHere.length})
                        </div>
                      ) : (
                        <div className="workshop-assign-modal__group-head px-4 py-2 text-xs font-semibold">
                          현재 배치 중 (0)
                        </div>
                      )}
                      {assignedHere.map((m) => {
                        const checked = checkedMinionIds.has(m.id);
                        return (
                          <label
                            key={m.id}
                            className="workshop-assign-modal__row flex cursor-pointer items-center justify-between gap-3 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-[var(--game-text)]">Lv{m.level}</span>
                                {m.combatStats ? (
                                  <span className="text-xs font-semibold text-[var(--game-gold-bright)]">
                                    CP {m.combatStats.combatPower}
                                  </span>
                                ) : null}
                                <span className="workshop-assign-modal__job-badge rounded-full px-2 py-0.5 text-xs font-semibold">
                                  {GATHER_MINION_JOB_LABEL[m.jobType] ?? m.jobType}
                                </span>
                                {assignedMinionIds.has(m.id) ? (
                                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                    현재 배치됨
                                  </span>
                                ) : m.assignedWorkshop ? (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                    다른 곳 배치됨 · {m.assignedWorkshop.workshopName}
                                  </span>
                                ) : null}
                              </div>
                              {m.equippedWeapon ? (
                                <div className="mt-1 text-[11px] text-[var(--game-muted)]">
                                  {m.equippedWeapon.name}
                                  {m.equippedWeapon.enhanceLevel > 0 ? ` +${m.equippedWeapon.enhanceLevel}` : ""}
                                </div>
                              ) : null}
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
                      <div className="workshop-assign-modal__group-head px-4 py-2 text-xs font-semibold">
                        배치 가능 ({available.length})
                      </div>
                      {available.map((m) => {
                        const checked = checkedMinionIds.has(m.id);
                        return (
                          <label
                            key={m.id}
                            className="workshop-assign-modal__row flex cursor-pointer items-center justify-between gap-3 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-[var(--game-text)]">Lv{m.level}</span>
                                {m.combatStats ? (
                                  <span className="text-xs font-semibold text-[var(--game-gold-bright)]">
                                    CP {m.combatStats.combatPower}
                                  </span>
                                ) : null}
                                <span className="workshop-assign-modal__job-badge rounded-full px-2 py-0.5 text-xs font-semibold">
                                  {GATHER_MINION_JOB_LABEL[m.jobType] ?? m.jobType}
                                </span>
                              </div>
                              {m.equippedWeapon ? (
                                <div className="mt-1 text-[11px] text-[var(--game-muted)]">
                                  {m.equippedWeapon.name}
                                  {m.equippedWeapon.enhanceLevel > 0 ? ` +${m.equippedWeapon.enhanceLevel}` : ""}
                                </div>
                              ) : null}
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

                <div className="mt-4 flex shrink-0 gap-2">
                  <GameBtn variant="ghost" className="h-10 flex-1" onClick={() => setAssignOpen(false)}>
                    취소
                  </GameBtn>
                  <GameBtn
                    variant="gold"
                    className="h-10 flex-1"
                    disabled={assignBusy}
                    onClick={() => void submitAssignModal()}
                  >
                    적용
                  </GameBtn>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      </>
      ) : null}

      <CraftMotionOverlay
        active={!!craftMotion}
        recipeName={craftMotion?.recipeName ?? ""}
        quantity={craftMotion?.quantity ?? 1}
        onComplete={() => void onCraftMotionComplete()}
      />

      {craftReveal ? (
        <CraftReveal
          recipeName={craftReveal.recipeName}
          cards={craftReveal.cards}
          valueHints={craftReveal.valueHints}
          onClose={() => setCraftReveal(null)}
        />
      ) : null}
    </GamePanel>
  );
}

