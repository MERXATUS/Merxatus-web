"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MinionJobType } from "@prisma/client";
import { DUNGEON_JOB_TYPES, MINION_JOB_LABEL } from "@/server/minionJobs";
import { minionLetterGradeBadgeClassName } from "@/server/itemGrade";

type DungeonDef = {
  id: string;
  name: string;
  mode?: "AUTO_WAVES" | "PUSH_LUCK";
  maxFloors?: number;
  floorPowerGrowth?: number;
  baseWaveSeconds: number;
  power: number;
  drops: Array<{ itemId: string; weight: number; minQty: number; maxQty: number }>;
  bossDrops?: Array<{ itemId: string; weight: number; minQty: number; maxQty: number }>;
};

type RunState = {
  ok: boolean;
  active: boolean;
  run?: { id: string; dungeonId: string; wins: number; losses: number; lastTickAt: string; startedAt: string; floor?: number };
  combat?: { partyPower: number; winRate: number };
  availableWaves?: number;
  dungeon?: DungeonDef;
  party?: Array<{ minionId: string; weaponItemId: string | null; weaponLevel: number }>;
  pendingLoot?: string;
};

const MAX_DUNGEON_PARTY = 10;
const PARTY_STORAGE_KEY = "dungeon_party_minion_ids_v1";

type DungeonMinionRow = {
  id: string;
  level: number;
  grade: string;
  jobType: string;
  assignedWorkshop?: { workshopId: string; workshopName: string; workshopKind: string } | null;
};

type MeStateLite = {
  ok: true;
  inventory: Array<{ itemId: string; name: string }>;
};

function loadPartyIdsFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(PARTY_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string" && x.length > 0));
  } catch {
    return new Set();
  }
}

function savePartyIdsToStorage(ids: Set<string>) {
  try {
    localStorage.setItem(PARTY_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore */
  }
}

function safeParsePendingLoot(raw: unknown): Array<{ itemId: string; qty: number }> {
  try {
    const s = typeof raw === "string" ? raw : JSON.stringify(raw);
    const arr = JSON.parse(s) as any;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => ({
        itemId: typeof x?.itemId === "string" ? x.itemId : "",
        qty: Math.max(0, Math.floor(Number(x?.qty ?? 0))),
      }))
      .filter((x) => x.itemId.length > 0 && x.qty > 0);
  } catch {
    return [];
  }
}

function isDungeonEligibleJob(jobType: string): boolean {
  return DUNGEON_JOB_TYPES.has(jobType as MinionJobType);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

function withUserId(url: string, userId: string) {
  if (!userId) return url;
  const hasQ = url.includes("?");
  return `${url}${hasQ ? "&" : "?"}userId=${encodeURIComponent(userId)}`;
}

function getUserIdFromStorage() {
  try {
    return localStorage.getItem("dev_userId") ?? "";
  } catch {
    return "";
  }
}

export function DungeonsPanel() {
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);
  const [dungeons, setDungeons] = useState<DungeonDef[]>([]);
  const [selectedDungeonId, setSelectedDungeonId] = useState<string>("");
  const [run, setRun] = useState<RunState | null>(null);
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [partyModalBusy, setPartyModalBusy] = useState(false);
  const [allMinions, setAllMinions] = useState<DungeonMinionRow[]>([]);
  const [partyCheckedIds, setPartyCheckedIds] = useState<Set<string>>(new Set());
  const partyHydratedRef = useRef(false);
  const [lastCollect, setLastCollect] = useState<any>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [battleLog, setBattleLog] = useState<Array<{ id: string; t: number; type: "WIN" | "LOSS" }>>([]);
  const [lootToasts, setLootToasts] = useState<Array<{ id: string; text: string; t: number }>>([]);
  const toastIdRef = useRef(0);
  const [itemNameById, setItemNameById] = useState<Map<string, string>>(new Map());

  async function grantDungeonJobsAndOpenParty() {
    if (!userId) return;
    setBusy("grant_dungeon_jobs");
    setError(null);
    try {
      const r = await postJson<{ ok: boolean; created?: number; minionIds?: string[]; error?: string }>(
        "/api/dev/grant-dungeon-jobs",
        { userId },
      );
      if (!r?.ok) throw r;
      setLootToasts((prev) => [
        ...prev,
        {
          id: `t${toastIdRef.current++}`,
          t: Date.now(),
          text: `+ 던전 직업 미니언 ${Math.max(0, Math.floor(Number(r.created ?? 0)))}명 지급`,
        },
      ]);
      await openPartyModal();
      if (Array.isArray(r.minionIds) && r.minionIds.length > 0) {
        setPartyCheckedIds(new Set(r.minionIds));
        savePartyIdsToStorage(new Set(r.minionIds));
      }
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    setUserId(getUserIdFromStorage());
    function onChanged() {
      setUserId(getUserIdFromStorage());
    }
    window.addEventListener("dev_user_changed", onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener("dev_user_changed", onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, []);

  async function refresh() {
    if (!userId) return;
    try {
      const [dl, st] = await Promise.all([
        getJson<{ ok: boolean; dungeons: DungeonDef[] }>(`/api/dungeons/list`),
        getJson<RunState>(withUserId(`/api/dungeons/run/state`, userId)),
      ]);
      if (dl?.ok) {
        setDungeons(dl.dungeons ?? []);
        if (!selectedDungeonId) setSelectedDungeonId(dl.dungeons?.[0]?.id ?? "");
      }
      if ((st as any)?.ok) {
        setRun(st);
        const active = !!(st as RunState).active;
        if (active && (st as RunState).party && (st as RunState).party!.length > 0) {
          setPartyCheckedIds(new Set((st as RunState).party!.map((p) => p.minionId)));
          partyHydratedRef.current = true;
        } else if (!active && !partyHydratedRef.current) {
          partyHydratedRef.current = true;
          const fromDisk = loadPartyIdsFromStorage();
          if (fromDisk.size > 0) setPartyCheckedIds(fromDisk);
        }
      }

      // best-effort: load item names for loot display
      try {
        const me = await getJson<MeStateLite>(withUserId(`/api/me/state`, userId));
        if (me?.ok) setItemNameById(new Map((me.inventory ?? []).map((x) => [x.itemId, x.name])));
      } catch {
        // ignore
      }
    } catch (e) {
      setError(e);
    }
  }

  async function openPartyModal() {
    setPartyModalOpen(true);
    setPartyModalBusy(true);
    setError(null);
    try {
      const m = await getJson<{ ok: boolean; minions: DungeonMinionRow[] }>(withUserId(`/api/minions/list`, userId));
      if (m.ok) {
        const list = m.minions ?? [];
        setAllMinions(list);
        setPartyCheckedIds((prev) => {
          const next = new Set(prev);
          for (const id of prev) {
            const row = list.find((x) => x.id === id);
            if (row?.assignedWorkshop) next.delete(id);
          }
          return next;
        });
      }
    } catch (e) {
      setError(e);
    } finally {
      setPartyModalBusy(false);
    }
  }

  function closePartyModalAndSave() {
    savePartyIdsToStorage(partyCheckedIds);
    setPartyModalOpen(false);
  }

  function togglePartyMinion(id: string, eligible: boolean, nextChecked: boolean) {
    if (!eligible) return;
    setPartyCheckedIds((prev) => {
      const n = new Set(prev);
      if (nextChecked) {
        if (n.size >= MAX_DUNGEON_PARTY && !n.has(id)) return prev;
        n.add(id);
      } else {
        n.delete(id);
      }
      return n;
    });
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPartyModalOpen(false);
    }
    if (partyModalOpen) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [partyModalOpen]);

  useEffect(() => {
    if (lootToasts.length === 0) return;
    const t = setInterval(() => {
      const cutoff = Date.now() - 2500;
      setLootToasts((prev) => prev.filter((x) => x.t >= cutoff));
    }, 300);
    return () => clearInterval(t);
  }, [lootToasts.length]);

  const selected = useMemo(() => dungeons.find((d) => d.id === selectedDungeonId) ?? null, [dungeons, selectedDungeonId]);

  const partySummaryLine = useMemo(() => {
    if (partyCheckedIds.size === 0) return "출전 미니언을 선택해 주세요.";
    const parts: string[] = [];
    for (const id of partyCheckedIds) {
      const row = allMinions.find((m) => m.id === id);
      if (row) {
        parts.push(
          `Lv${row.level} ${MINION_JOB_LABEL[row.jobType as MinionJobType] ?? row.jobType}`,
        );
      } else {
        parts.push(`${id.slice(0, 10)}…`);
      }
    }
    return `${partyCheckedIds.size}명: ${parts.join(" · ")}`;
  }, [partyCheckedIds, allMinions]);

  const eligibleMinions = useMemo(() => {
    return allMinions
      .filter((m) => isDungeonEligibleJob(m.jobType) && !m.assignedWorkshop)
      .sort((a, b) => {
        const ac = partyCheckedIds.has(a.id) ? 1 : 0;
        const bc = partyCheckedIds.has(b.id) ? 1 : 0;
        if (ac !== bc) return bc - ac;
        return b.level - a.level;
      });
  }, [allMinions, partyCheckedIds]);

  /** 던전 직업이지만 마을 시설에 붙어 있어 출전 불가 */
  const workshopBlockedMinions = useMemo(() => {
    return allMinions
      .filter((m) => isDungeonEligibleJob(m.jobType) && !!m.assignedWorkshop)
      .sort((a, b) => b.level - a.level);
  }, [allMinions]);

  const ineligibleMinions = useMemo(() => {
    return allMinions.filter((m) => !isDungeonEligibleJob(m.jobType)).sort((a, b) => b.level - a.level);
  }, [allMinions]);

  const waveUi = useMemo(() => {
    if (!run?.active || !selected || !run.run?.lastTickAt) {
      return { ratio: 0, remainingSec: selected?.baseWaveSeconds ?? 0, readyWaves: 0 };
    }
    const base = selected.baseWaveSeconds;
    const last = new Date(run.run.lastTickAt).getTime();
    const elapsedSec = Math.max(0, Math.floor((nowMs - last) / 1000));
    const mod = base > 0 ? elapsedSec % base : 0;
    const remainingSec = base > 0 ? Math.max(0, base - mod) : 0;
    const ratio = base > 0 ? Math.max(0, Math.min(1, mod / base)) : 0;
    return { ratio, remainingSec, readyWaves: run.availableWaves ?? 0 };
  }, [run?.active, run?.availableWaves, run?.run?.lastTickAt, selected, nowMs]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">던전</div>
          <div className="text-sm text-zinc-600">세션 시작/진행/수령 (웨이브 승률 롤)</div>
        </div>
        <button
          className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
          disabled={!userId || !!busy}
          onClick={() => void refresh()}
        >
          새로고침
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          오류: {typeof error === "string" ? error : JSON.stringify(error)}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="md:col-span-1">
          <div className="text-xs font-semibold text-zinc-600">던전 목록</div>
          <div className="mt-2 grid gap-2">
            {dungeons.map((d) => (
              <button
                key={d.id}
                className={[
                  "w-full rounded-xl border px-3 py-2 text-left",
                  d.id === selectedDungeonId ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                ].join(" ")}
                onClick={() => setSelectedDungeonId(d.id)}
              >
                <div className="text-sm font-semibold">{d.name}</div>
                <div className="mt-1 text-xs text-zinc-600">
                  난이도 {d.power} · 웨이브 {d.baseWaveSeconds}s
                </div>
                <div className="mt-1 text-[11px] text-zinc-500 truncate">{d.id}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="text-xs font-semibold text-zinc-600">세션</div>
          <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-4">
            {selected ? (
              <>
                <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-4 text-white">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white/70">몬스터</div>
                      <div className="mt-1 text-lg font-semibold">{selected.name}의 수호자</div>
                      <div className="mt-1 text-xs text-white/60">
                        난이도 {selected.power} · 웨이브 {selected.baseWaveSeconds}s · 수령가능 {waveUi.readyWaves}
                      </div>
                    </div>

                    <div className="min-w-[200px]">
                      <div className="text-[11px] font-semibold text-white/60">다음 웨이브까지</div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-emerald-400 transition-[width] duration-200"
                          style={{ width: `${Math.round(waveUi.ratio * 100)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-right text-xs font-semibold tabular-nums text-white/80">
                        {run?.active ? `${waveUi.remainingSec}s` : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] font-semibold text-white/60">전투력</div>
                      <div className="mt-1 text-sm font-semibold">{run?.combat ? run.combat.partyPower : "—"}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] font-semibold text-white/60">승률</div>
                      <div className="mt-1 text-sm font-semibold">
                        {run?.combat ? `${Math.round(run.combat.winRate * 100)}%` : "—"}
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-amber-400 transition-[width] duration-200"
                          style={{ width: `${Math.round((run?.combat?.winRate ?? 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] font-semibold text-white/60">전투 로그</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(battleLog.slice(0, 18).length === 0 ? [{ id: "none", type: "LOSS" as const, t: 0 }] : battleLog.slice(0, 18)).map(
                          (e) => (
                            <span
                              key={e.id}
                              className={[
                                "inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-extrabold",
                                e.id === "none"
                                  ? "bg-white/10 text-white/50"
                                  : e.type === "WIN"
                                    ? "bg-emerald-400/20 text-emerald-200"
                                    : "bg-rose-400/20 text-rose-200",
                              ].join(" ")}
                              title={e.id === "none" ? "아직 수령 기록 없음" : e.type}
                            >
                              {e.id === "none" ? "·" : e.type === "WIN" ? "W" : "L"}
                            </span>
                          ),
                        )}
                      </div>
                      <div className="mt-2 text-[11px] text-white/50">
                        수령 버튼을 누르면 지난 웨이브의 승/패가 여기에 쌓여.
                      </div>
                    </div>
                  </div>

                  <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-emerald-400/10 blur-2xl" />
                  <div className="pointer-events-none absolute -left-10 -bottom-10 h-56 w-56 rounded-full bg-amber-400/10 blur-2xl" />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold">{selected.name}</div>
                    <div className="text-xs text-zinc-500">{selected.id}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={!userId || !!busy || partyCheckedIds.size === 0}
                      onClick={async () => {
                        setBusy("start");
                        setError(null);
                        try {
                          const minionIds = Array.from(partyCheckedIds);
                          if (minionIds.length === 0) {
                            setError({ error: "파티를 먼저 구성해 주세요." });
                            return;
                          }
                          await postJson("/api/dungeons/run/start", { userId, dungeonId: selected.id, minionIds });
                          await refresh();
                        } catch (e) {
                          setError(e);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      시작
                    </button>
                    <button
                      className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                      disabled={!userId || !!busy}
                      onClick={async () => {
                        setBusy("stop");
                        setError(null);
                        try {
                          await postJson("/api/dungeons/run/stop", { userId });
                          await refresh();
                        } catch (e) {
                          setError(e);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      중단
                    </button>
                    <button
                      className="h-9 rounded-xl bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={!userId || !!busy}
                      onClick={async () => {
                        const mode = run?.dungeon?.mode ?? "AUTO_WAVES";
                        setBusy(mode === "PUSH_LUCK" ? "advance" : "collect");
                        setError(null);
                        try {
                          const r =
                            mode === "PUSH_LUCK"
                              ? await postJson("/api/dungeons/run/advance", { userId })
                              : await postJson("/api/dungeons/run/collect", { userId });
                          setLastCollect(r);
                          const type: "WIN" | "LOSS" =
                            (r as any)?.result === "LOSS" || (r as any)?.lossesAdded > 0 ? "LOSS" : "WIN";
                          setBattleLog((prev) => [{ id: `e${Date.now()}_${Math.random()}`, t: Date.now(), type }, ...prev].slice(0, 60));

                          const loot = ((r as any)?.loot ?? (r as any)?.lootGained ?? []) as Array<{ itemId: string; qty: number }>;
                          if (Array.isArray(loot) && loot.length > 0) {
                            setLootToasts((prev) => [
                              ...prev,
                              ...loot.slice(0, 6).map((x) => ({
                                id: `t${toastIdRef.current++}`,
                                t: Date.now(),
                                text: `+ ${x.itemId} x${x.qty}`,
                              })),
                            ]);
                          }
                          await refresh();
                        } catch (e) {
                          setError(e);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {run?.dungeon?.mode === "PUSH_LUCK" ? "다음 층" : "수령"}
                    </button>
                    {run?.dungeon?.mode === "PUSH_LUCK" ? (
                      <button
                        className="h-9 rounded-xl bg-amber-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={!userId || !!busy}
                        onClick={async () => {
                          setBusy("cashout");
                          setError(null);
                          try {
                            const r = await postJson("/api/dungeons/run/cashout", { userId });
                            setLastCollect(r);
                            await refresh();
                          } catch (e) {
                            setError(e);
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        정산
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-zinc-600">던전 파티 (마을 배치와 동일하게 선택)</div>
                      <div className="mt-2 text-sm text-zinc-800">{partySummaryLine}</div>
                      <div className="mt-2 text-[11px] leading-snug text-zinc-500">
                        전사·궁수·마법사만 출전. 마을에 배치된 미니언은 던전에 내보낼 수 없어. 최대{" "}
                        {MAX_DUNGEON_PARTY}명. 선택은 이 기기에 저장돼.
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        className="h-9 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                        disabled={!userId || !!busy}
                        onClick={() => void grantDungeonJobsAndOpenParty()}
                        title="테스트용: 전사/궁수/마법사 미니언 1명씩 지급"
                      >
                        테스트 미니언 지급
                      </button>
                      <button
                        type="button"
                        className="h-9 rounded-xl bg-zinc-900 px-4 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={!userId || !!busy}
                        onClick={() => void openPartyModal()}
                      >
                        미니언 선택
                      </button>
                    </div>
                  </div>
                </div>

                {run?.active && run?.dungeon?.mode === "PUSH_LUCK" ? (
                  <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-600">진행 상황</div>
                        <div className="mt-1 text-sm font-semibold">
                          현재 {Math.max(1, Math.floor(run?.run?.floor ?? 1))}층 / {run.dungeon.maxFloors ?? 20}층
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          20층은 <span className="font-semibold text-zinc-800">슬라임 킹</span> (추가 드랍: 문양)
                        </div>
                      </div>
                      <div className="min-w-[240px] flex-1">
                        <div className="text-xs font-semibold text-zinc-600">누적 보상(패배 시 소멸)</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {safeParsePendingLoot(run.pendingLoot ?? "[]").length === 0 ? (
                            <span className="text-sm text-zinc-500">아직 없음</span>
                          ) : (
                            safeParsePendingLoot(run.pendingLoot ?? "[]")
                              .slice(0, 12)
                              .map((x) => (
                                <span
                                  key={`${x.itemId}_${x.qty}`}
                                  className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800"
                                >
                                  {(itemNameById.get(x.itemId) ?? x.itemId).slice(0, 24)} ×{x.qty}
                                </span>
                              ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-600">활성 세션</div>
                    <div className="mt-1 text-sm font-semibold">{run?.active ? "RUNNING" : "없음"}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-600">전투력 / 승률</div>
                    <div className="mt-1 text-sm font-semibold">
                      {run?.combat ? `${run.combat.partyPower} / ${Math.round(run.combat.winRate * 100)}%` : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-600">수령 가능 웨이브</div>
                    <div className="mt-1 text-sm font-semibold">{run?.active ? run.availableWaves ?? 0 : 0}</div>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950">
                  <div className="border-b border-white/10 px-3 py-2 text-xs font-semibold text-white/70">
                    최근 던전 수령 결과
                  </div>
                  <pre className="max-h-[260px] overflow-auto px-3 py-3 text-xs leading-5 text-white/90">
                    {JSON.stringify(lastCollect ?? { hint: "아직 수령 기록이 없어." }, null, 2)}
                  </pre>
                </div>

                {lootToasts.length > 0 ? (
                  <div className="pointer-events-none fixed bottom-6 right-6 z-50 grid gap-2">
                    {lootToasts.slice(-4).map((t) => (
                      <div
                        key={t.id}
                        className="w-[260px] rounded-xl border border-emerald-300/30 bg-emerald-950/90 px-3 py-2 text-xs font-semibold text-emerald-100 shadow-lg"
                      >
                        {t.text}
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-zinc-500">던전을 선택해.</div>
            )}
          </div>
        </div>
      </div>

      {partyModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dungeon-party-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPartyModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div id="dungeon-party-modal-title" className="text-sm font-semibold">
                  던전 파티 구성
                </div>
                <div className="mt-2 text-[11px] leading-snug text-zinc-600">
                  체크한 미니언이 출전해. 전사·궁수·마법사만 선택 가능하고, 마을에 배치된 미니언은 던전에 넣을 수
                  없어. 최대 {MAX_DUNGEON_PARTY}명까지.
                </div>
                <div className="mt-2 text-xs font-semibold text-zinc-700">
                  선택 {partyCheckedIds.size}/{MAX_DUNGEON_PARTY}
                </div>
              </div>
              <button
                type="button"
                className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                onClick={() => setPartyModalOpen(false)}
              >
                닫기
              </button>
            </div>

            {partyModalBusy ? (
              <div className="mt-4 text-sm text-zinc-600">미니언 목록 불러오는 중…</div>
            ) : (
              <div className="mt-4">
                <div className="max-h-[420px] overflow-auto rounded-xl border border-zinc-200">
                  {allMinions.length === 0 ? (
                    <div className="p-4 text-sm text-zinc-500">미니언이 없어.</div>
                  ) : (
                    <div className="divide-y divide-zinc-200">
                      <div className="bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-900">
                        던전 출전 가능 ({eligibleMinions.length})
                      </div>
                      {eligibleMinions.map((m) => {
                        const checked = partyCheckedIds.has(m.id);
                        const atCap = partyCheckedIds.size >= MAX_DUNGEON_PARTY && !checked;
                        return (
                          <label
                            key={m.id}
                            className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3 ${atCap ? "opacity-50" : ""}`}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">Lv{m.level}</span>
                                <span className={minionLetterGradeBadgeClassName(m.grade)}>
                                  등급 {m.grade ?? "—"}
                                </span>
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                                  {MINION_JOB_LABEL[m.jobType as MinionJobType] ?? m.jobType}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] font-mono text-zinc-500">{m.id}</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={atCap}
                              onChange={(e) => togglePartyMinion(m.id, true, e.target.checked)}
                            />
                          </label>
                        );
                      })}

                      {workshopBlockedMinions.length > 0 ? (
                        <>
                          <div className="bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-950">
                            마을 배치 중 · 던전 불가 ({workshopBlockedMinions.length})
                          </div>
                          {workshopBlockedMinions.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between gap-3 bg-amber-50/60 px-4 py-3"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold">Lv{m.level}</span>
                                  <span className={minionLetterGradeBadgeClassName(m.grade)}>
                                    등급 {m.grade ?? "—"}
                                  </span>
                                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                                    {MINION_JOB_LABEL[m.jobType as MinionJobType] ?? m.jobType}
                                  </span>
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
                                    {m.assignedWorkshop?.workshopName ?? "마을"}
                                  </span>
                                </div>
                                <div className="mt-1 text-[11px] font-mono text-zinc-500">{m.id}</div>
                              </div>
                              <input type="checkbox" disabled className="opacity-40" checked={false} />
                            </div>
                          ))}
                        </>
                      ) : null}

                      {ineligibleMinions.length > 0 ? (
                        <>
                          <div className="bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-600">
                            출전 불가 · 생산 직업 ({ineligibleMinions.length})
                          </div>
                          {ineligibleMinions.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between gap-3 bg-zinc-50/80 px-4 py-3 opacity-70"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold">Lv{m.level}</span>
                                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                                    {MINION_JOB_LABEL[m.jobType as MinionJobType] ?? m.jobType}
                                  </span>
                                  <span className="text-[11px] text-zinc-500">던전 직업 아님</span>
                                </div>
                                <div className="mt-1 text-[11px] font-mono text-zinc-500">{m.id}</div>
                              </div>
                              <input type="checkbox" disabled className="opacity-40" checked={false} />
                            </div>
                          ))}
                        </>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="h-10 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900"
                    onClick={() => setPartyModalOpen(false)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="h-10 flex-1 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white"
                    onClick={() => closePartyModalAndSave()}
                  >
                    선택 완료
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

