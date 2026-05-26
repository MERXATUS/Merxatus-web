"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MinionJobType } from "@prisma/client";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { apiGetJson, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
import { DUNGEON_JOB_TYPES, MINION_JOB_LABEL } from "@/server/minionJobs";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { GameBtn, GamePanel, GamePanelTitle, GameStat } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { MinionEquipDoll } from "@/app/_components/MinionEquipDoll";
import { formatCombatLogLine, type CombatLogLine } from "@/shared/dungeonCombatLog";

type DungeonDef = {
  id: string;
  name: string;
  mode?: "AUTO_WAVES" | "PUSH_LUCK";
  maxFloors?: number;
  maxPartySize?: number;
  baseWaveSeconds: number;
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
};

type AdvanceResult = {
  ok: boolean;
  combatLog?: CombatLogLine[];
  partyHp?: Array<{ minionId: string; hp: number; maxHp: number; label?: string }>;
};

type DungeonMinionRow = {
  id: string;
  level: number;
  jobType: string;
  combatStats?: { combatPower: number };
  equippedWeapon?: {
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    grade: number;
  } | null;
  assignedWorkshop?: { workshopId: string; workshopName: string } | null;
};

type DisplayLogLine = { id: string; text: string; tone: "party" | "enemy" | "system" | "win" | "loss" };

const PARTY_KEY = "dungeon_party_minion_ids_v1";
const DUNGEON_SELECT_KEY = "dungeon_selected_id_v1";

function logTone(line: CombatLogLine): DisplayLogLine["tone"] {
  if (line.t === "floor_start") return "system";
  if (line.t === "result") return line.outcome === "WIN" ? "win" : "loss";
  if (line.t === "hit") return line.side === "party" ? "party" : "enemy";
  return "system";
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

export function DungeonsPanel() {
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
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyBusy, setPartyBusy] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logId = useRef(0);

  const floor = Math.max(1, Math.floor(run?.run?.floor ?? 1));
  const maxFloors = dungeon?.maxFloors ?? 20;
  const maxParty = Math.max(1, dungeon?.maxPartySize ?? 1);
  const floorPct = Math.min(100, Math.round((floor / maxFloors) * 100));
  const loot = parseLoot(run?.pendingLoot ?? "[]");

  const partyChips = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const id of partyIds) {
      const m = minions.find((x) => x.id === id);
      if (!m) continue;
      out.push({
        id,
        label: `${MINION_JOB_LABEL[m.jobType as MinionJobType] ?? m.jobType} Lv${m.level}`,
      });
    }
    return out;
  }, [partyIds, minions]);

  const partyRoster = useMemo(() => {
    if (!run?.active || !run.party?.length) return null;
    return run.party.map((p) => {
      const m = minions.find((x) => x.id === p.minionId);
      const maxHp = Math.max(1, Math.floor(p.maxHp ?? 1));
      const hp = Math.min(maxHp, Math.max(0, Math.floor(p.hp ?? maxHp)));
      const fallbackLabel = m
        ? `${MINION_JOB_LABEL[m.jobType as MinionJobType] ?? m.jobType} Lv${m.level}`
        : p.minionId.slice(0, 8);
      return {
        id: p.minionId,
        label: p.label ?? fallbackLabel,
        hp,
        maxHp,
        pct: Math.round((hp / maxHp) * 100),
        dead: hp <= 0,
      };
    });
  }, [run?.active, run?.party, minions]);

  const partyAlive = partyRoster?.filter((m) => !m.dead).length ?? 0;

  const dungeonMinions = useMemo(
    () => minions.filter((m) => DUNGEON_JOB_TYPES.has(m.jobType as MinionJobType)),
    [minions],
  );

  const playLog = useCallback((lines: CombatLogLine[], done?: () => void) => {
    if (!lines.length) {
      done?.();
      return;
    }
    setLogLines([]);
    setPlayingLog(true);
    let i = 0;
    const step = () => {
      if (i >= lines.length) {
        setPlayingLog(false);
        done?.();
        return;
      }
      const line = lines[i]!;
      setLogLines((prev) => [
        ...prev,
        { id: `l${logId.current++}`, text: formatCombatLogLine(line), tone: logTone(line) },
      ]);
      i += 1;
      const ms = line.t === "floor_start" ? 520 : line.t === "result" ? 900 : 340;
      window.setTimeout(step, ms);
    };
    window.setTimeout(step, 280);
  }, []);

  async function refresh() {
    if (!user) return;
    try {
      const [list, state] = await Promise.all([
        getJson<{ ok: boolean; dungeons: DungeonDef[] }>("/api/dungeons/list"),
        getJson<RunState>("/api/dungeons/run/state"),
      ]);
      if (list.ok) {
        setDungeons(list.dungeons);
        const savedId =
          typeof window !== "undefined" ? localStorage.getItem(DUNGEON_SELECT_KEY) ?? "" : "";
        const next =
          list.dungeons.find((d) => d.id === savedId) ??
          list.dungeons.find((d) => d.id === dungeon?.id) ??
          list.dungeons[0] ??
          null;
        setDungeon(next);
      }
      if (state.ok) {
        setRun(state);
        if (state.active && state.party?.length) setPartyIds(new Set(state.party.map((p) => p.minionId)));
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

  useEffect(() => {
    if (sessionLoading) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionLoading]);

  useEffect(() => {
    if (sessionLoading || !user || playingLog) return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, playingLog]);

  useEffect(() => {
    setPartyIds((prev) => {
      if (prev.size <= maxParty) return prev;
      return new Set([...prev].slice(0, maxParty));
    });
  }, [dungeon?.id, maxParty]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logLines.length]);

  useEscapeClose(partyOpen, () => setPartyOpen(false));

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

  async function advance() {
    setBusy("advance");
    setError(null);
    try {
      const r = await postJson<AdvanceResult>("/api/dungeons/run/advance", {});
      if (r.partyHp?.length) {
        setRun((prev) =>
          prev?.active
            ? {
                ...prev,
                party: r.partyHp!.map((h) => ({
                  minionId: h.minionId,
                  hp: h.hp,
                  maxHp: h.maxHp,
                  label: h.label,
                })),
              }
            : prev,
        );
      }
      playLog(r.combatLog ?? [], () => void refresh());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="dungeon-shell">
      <div className="dungeon-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="game-label">던전</p>
            <h2 className="game-title mt-1 text-lg">{dungeon?.name ?? "슬라임의 숲"}</h2>
            <p className="mt-1 text-xs text-[var(--game-muted)]">층마다 전투 관전 · 패배 시 보상 소멸</p>
          </div>
          <span className={`dungeon-status-pill ${run?.active ? "dungeon-status-pill--live" : ""}`.trim()}>
            {run?.active ? "● 탐험 중" : "○ 대기"}
          </span>
        </div>
        <div className="dungeon-floor-track">
          <div className="dungeon-floor-fill" style={{ width: `${run?.active ? floorPct : 0}%` }} />
        </div>
        <p className="mt-2 text-right text-[11px] font-semibold tabular-nums text-[var(--game-muted)]">
          {run?.active ? `${floor} / ${maxFloors}층` : `최대 ${maxFloors}층`}
        </p>
        {!run?.active && dungeons.length > 1 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {dungeons.map((d) => (
              <GameBtn
                key={d.id}
                variant={dungeon?.id === d.id ? "gold" : "ghost"}
                className="h-8 px-3 text-xs"
                disabled={!!busy}
                onClick={() => {
                  setDungeon(d);
                  try {
                    localStorage.setItem(DUNGEON_SELECT_KEY, d.id);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {d.name}
              </GameBtn>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <GamePanelError error={error} /> : null}

      {sessionLoading ? (
        <GamePanelLoading label="세션 확인 중…" />
      ) : !user ? (
        <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
      ) : (
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div className="flex flex-col gap-3">
          <GamePanel className="!p-3">
            <GamePanelTitle>전투</GamePanelTitle>
            <p className="mt-1 text-[10px] leading-snug text-[var(--game-muted)]">
              클리어 확률은 현재 층 전투를 여러 번 시뮬한 추정치입니다.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <GameStat label="전투력" value={run?.combat?.partyPower ?? "—"} highlight />
              <GameStat
                label="클리어 확률"
                value={run?.combat ? `${Math.round(run.combat.clearChance * 100)}%` : "—"}
              />
              <GameStat label="승" value={run?.run?.wins ?? 0} />
              <GameStat label="패" value={run?.run?.losses ?? 0} />
            </div>
            {run?.combat?.partyPower != null && run.combat.partyPower < 120 ? (
              <p className="mt-2 text-[11px] leading-snug text-[var(--game-muted)]">
                더 깊은 층은 더 높은 전투력이 필요해요.{" "}
                <Link href="/market" className="font-semibold text-[var(--game-gold-bright)] underline-offset-2 hover:underline">
                  거래소에서 장비 구매
                </Link>
              </p>
            ) : null}
          </GamePanel>

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
              <ul className="dungeon-party-hp-list mt-2">
                {partyRoster.map((m) => (
                  <li key={m.id} className={`dungeon-party-hp-row${m.dead ? " dungeon-party-hp-row--dead" : ""}`.trim()}>
                    <div className="dungeon-party-hp-head">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-xs font-semibold">{m.label}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[11px] text-[var(--game-muted)]">
                        {m.dead ? "전투불가" : `${m.hp}/${m.maxHp}`}
                      </span>
                    </div>
                    <div className="dungeon-hp-track" aria-hidden={m.dead}>
                      <div
                        className={`dungeon-hp-fill${m.pct <= 30 ? " dungeon-hp-fill--low" : ""}`.trim()}
                        style={{ width: `${m.pct}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
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

          <GamePanel className="!p-3">
            <GamePanelTitle>명령</GamePanelTitle>
            <div className="dungeon-action-grid mt-2">
              <GameBtn
                variant="primary"
                className="h-10 text-sm"
                disabled={!!busy || !dungeon || partyIds.size === 0 || run?.active}
                onClick={async () => {
                  if (!dungeon) return;
                  setBusy("start");
                  setLogLines([]);
                  try {
                    await postJson("/api/dungeons/run/start", {
                      dungeonId: dungeon.id,
                      minionIds: [...partyIds],
                    });
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
              <GameBtn variant="gold" className="h-10 text-sm" disabled={!!busy || !run?.active || playingLog} onClick={() => void advance()}>
                {playingLog ? "전투 중…" : "다음 층"}
              </GameBtn>
              <GameBtn
                variant="ghost"
                className="h-10 text-sm"
                disabled={!!busy || !run?.active}
                onClick={async () => {
                  setBusy("cashout");
                  try {
                    await postJson("/api/dungeons/run/cashout", {});
                    await refresh();
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                정산
              </GameBtn>
              <GameBtn
                variant="ghost"
                className="h-10 text-sm !text-red-300"
                disabled={!!busy || !run?.active}
                onClick={async () => {
                  setBusy("stop");
                  try {
                    await postJson("/api/dungeons/run/stop", {});
                    await refresh();
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                중단
              </GameBtn>
            </div>
          </GamePanel>

          {run?.active && loot.length > 0 ? (
            <GamePanel className="!p-3">
              <GamePanelTitle hint="패배 시 소멸">누적 보상</GamePanelTitle>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {loot.map((x) => (
                  <span key={x.itemId} className="dungeon-loot-chip">
                    {(itemNames.get(x.itemId) ?? x.itemId).slice(0, 14)} ×{x.qty}
                  </span>
                ))}
              </div>
            </GamePanel>
          ) : null}
        </div>

        <div className={`dungeon-log-panel ${playingLog ? "dungeon-log-panel--playing" : ""}`.trim()}>
          <div className="dungeon-log-head">
            <span className="text-xs font-semibold">전투 로그</span>
            {playingLog ? <span className="text-[11px] text-emerald-400">재생 중…</span> : null}
          </div>
          <div className="dungeon-combat-log" aria-live="polite">
            {logLines.length === 0 ? (
              <p className="dungeon-log-empty whitespace-pre-line">
                {run?.active ? "「다음 층」을 눌러\n전투를 관전하세요." : "파티 편성 후\n탐험을 시작하세요."}
              </p>
            ) : (
              logLines.map((line) => (
                <div
                  key={line.id}
                  className={[
                    "dungeon-log-row",
                    line.tone === "party"
                      ? "dungeon-log-row--party"
                      : line.tone === "enemy"
                        ? "dungeon-log-row--enemy"
                        : line.tone === "win"
                          ? "dungeon-log-row--win"
                          : line.tone === "loss"
                            ? "dungeon-log-row--loss"
                            : "dungeon-log-row--system",
                  ].join(" ")}
                >
                  {line.text}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
      )}

      {partyOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 sm:items-center"
          onMouseDown={(e) => e.target === e.currentTarget && setPartyOpen(false)}
        >
          <div className="game-panel w-full max-w-3xl p-4" onMouseDown={(e) => e.stopPropagation()}>
            <GamePanelTitle>파티 편성 · 최대 {maxParty}명</GamePanelTitle>
            <p className="mt-1 text-xs text-[var(--game-muted)]">
              카드를 눌러 파티에 넣으세요. 장비 슬롯에 아이콘이 보이면 착용 중입니다.
            </p>
            {partyBusy ? (
              <p className="mt-3 text-sm text-[var(--game-muted)]">불러오는 중…</p>
            ) : dungeonMinions.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--game-muted)]">던전용 미니언(전사·궁수·마법사)이 없습니다.</p>
            ) : (
              <div className="dungeon-party-pick-grid mt-3 max-h-[min(28rem,70vh)] overflow-auto pr-1">
                {dungeonMinions.map((m) => {
                  const on = partyIds.has(m.id);
                  const busyWorkshop = !!m.assignedWorkshop;
                  const cap = !busyWorkshop && maxParty > 1 && partyIds.size >= maxParty && !on;
                  const disabled = busyWorkshop || cap;
                  const weapon = m.equippedWeapon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={disabled}
                      className={[
                        "dungeon-party-pick-card",
                        on ? "dungeon-party-pick-card--selected" : "",
                        disabled && !on ? "dungeon-party-pick-card--disabled" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => {
                        if (disabled) return;
                        toggleParty(m.id, !on);
                      }}
                    >
                      <div className="dungeon-party-pick-card__head">
                        <span className="dungeon-party-pick-card__job">
                          {MINION_JOB_LABEL[m.jobType as MinionJobType] ?? m.jobType}
                        </span>
                        <span className="dungeon-party-pick-card__level">Lv{m.level}</span>
                        {m.combatStats ? (
                          <span className="text-[10px] font-semibold text-[var(--game-gold-bright)]">
                            CP {m.combatStats.combatPower}
                          </span>
                        ) : null}
                      </div>
                      <div className="dungeon-party-pick-card__doll">
                        <MinionEquipDoll
                          compact
                          equipment={{
                            weapon: weapon
                              ? {
                                  baseItemId: weapon.baseItemId,
                                  name: weapon.name,
                                  enhanceLevel: weapon.enhanceLevel,
                                  grade: weapon.grade,
                                }
                              : null,
                          }}
                        />
                      </div>
                      <p className="dungeon-party-pick-card__weapon-line">
                        {weapon ? (
                          <span className={itemGradeNameClassName(weapon.grade ?? 1)}>
                            {weapon.name}
                            {weapon.enhanceLevel > 0 ? ` +${weapon.enhanceLevel}` : ""}
                          </span>
                        ) : (
                          <span className="dungeon-party-pick-card__weapon-line--empty">무기 미착용</span>
                        )}
                      </p>
                      {busyWorkshop ? (
                        <span className="dungeon-party-pick-card__tag">작업장: {m.assignedWorkshop!.workshopName}</span>
                      ) : on ? (
                        <span className="dungeon-party-pick-card__tag dungeon-party-pick-card__tag--pick">파티</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <GameBtn variant="ghost" className="flex-1 h-10" onClick={() => setPartyOpen(false)}>
                취소
              </GameBtn>
              <GameBtn
                variant="primary"
                className="flex-1 h-10"
                onClick={() => {
                  try {
                    localStorage.setItem(PARTY_KEY, JSON.stringify([...partyIds]));
                  } catch {
                    /* ignore */
                  }
                  setPartyOpen(false);
                }}
              >
                완료 ({partyIds.size}/{maxParty})
              </GameBtn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
