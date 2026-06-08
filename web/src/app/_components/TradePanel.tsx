"use client";

import { useEffect, useMemo, useState } from "react";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { API_CACHE_TTL } from "@/shared/apiCache";
import { apiGetJson, apiGetJsonCached, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
import { formatPanelError } from "@/shared/formatPanelError";
import { START_TRADE_WITH_EVENT, TRADE_START_USERNAME_KEY } from "@/shared/gameNav";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { itemGradeNameClassName } from "@/server/itemGrade";

type TradeUser = { id: string; username: string };
type TradeItem = {
  id: string;
  side: "A" | "B";
  kind: "STACK" | "WEAPON_INSTANCE" | "ARMOR_INSTANCE";
  itemId: string | null;
  quantity: number;
  weaponInstanceId: string | null;
  armorInstanceId: string | null;
};

type TradeSession = {
  id: string;
  userAId: string;
  userBId: string;
  userA: TradeUser;
  userB: TradeUser;
  status: string;
  offeredGoldA: number;
  offeredGoldB: number;
  lockedGoldA: number;
  lockedGoldB: number;
  lockedA: boolean;
  lockedB: boolean;
  confirmedAAt: string | null;
  confirmedBAt: string | null;
  expiresAt: string;
  items: TradeItem[];
};

function sideLabel(side: "A" | "B") {
  return side === "A" ? "A" : "B";
}

type TradeInvState = {
  inventory: Array<{ itemId: string; name: string; category: string; quantity: number; grade?: number; icon?: string | null; iconSrc?: string }>;
  weaponInstances?: Array<{ id: string; baseItemId: string; name: string; enhanceLevel: number; grade?: number; icon?: string | null; iconSrc?: string }>;
  armorInstances?: Array<{ id: string; baseItemId: string; name: string; grade?: number; icon?: string | null; iconSrc?: string }>;
};

export function TradePanel() {
  const { user, loading: sessionLoading } = useSessionUser();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tradeId, setTradeId] = useState<string>("");
  const [trade, setTrade] = useState<TradeSession | null>(null);
  const [invBusy, setInvBusy] = useState(false);
  const [invError, setInvError] = useState<unknown>(null);
  const [inv, setInv] = useState<TradeInvState | null>(null);

  const [counterpartyUsername, setCounterpartyUsername] = useState("");

  useEffect(() => {
    function applyPrefill(username: string) {
      setCounterpartyUsername(username);
      try {
        sessionStorage.removeItem(TRADE_START_USERNAME_KEY);
      } catch {
        /* ignore */
      }
    }
    try {
      const pending = sessionStorage.getItem(TRADE_START_USERNAME_KEY);
      if (pending) applyPrefill(pending);
    } catch {
      /* ignore */
    }
    function onStartTrade(ev: Event) {
      const detail = (ev as CustomEvent<{ username?: string }>).detail;
      if (detail?.username) applyPrefill(detail.username);
    }
    window.addEventListener(START_TRADE_WITH_EVENT, onStartTrade);
    return () => window.removeEventListener(START_TRADE_WITH_EVENT, onStartTrade);
  }, []);

  // offer editing
  const [offeredGold, setOfferedGold] = useState(0);
  const [goldDirty, setGoldDirty] = useState(false);
  const [stackItemId, setStackItemId] = useState("");
  const [stackQty, setStackQty] = useState(1);
  const [weaponInstId, setWeaponInstId] = useState("");
  const [armorInstId, setArmorInstId] = useState("");
  const [draftItems, setDraftItems] = useState<
    Array<
      | { kind: "STACK"; itemId: string; quantity: number }
      | { kind: "WEAPON_INSTANCE"; weaponInstanceId: string }
      | { kind: "ARMOR_INSTANCE"; armorInstanceId: string }
    >
  >([]);
  const [invTab, setInvTab] = useState<"STACK" | "WEAPON" | "ARMOR">("STACK");
  const [invQ, setInvQ] = useState("");
  const [showAdvancedAdd, setShowAdvancedAdd] = useState(false);

  const mySide = useMemo(() => {
    if (!user || !trade) return null;
    if (trade.userAId === user.id) return "A" as const;
    if (trade.userBId === user.id) return "B" as const;
    return null;
  }, [user, trade]);

  const myLocked = mySide === "A" ? !!trade?.lockedA : mySide === "B" ? !!trade?.lockedB : false;
  const myConfirmed = mySide === "A" ? !!trade?.confirmedAAt : mySide === "B" ? !!trade?.confirmedBAt : false;
  const otherLocked = mySide === "A" ? !!trade?.lockedB : mySide === "B" ? !!trade?.lockedA : false;
  const otherConfirmed = mySide === "A" ? !!trade?.confirmedBAt : mySide === "B" ? !!trade?.confirmedAAt : false;

  const friendlyError = useMemo(() => (error ? formatPanelError(error) : ""), [error]);
  const friendlyInvError = useMemo(() => (invError ? formatPanelError(invError) : ""), [invError]);

  async function refresh() {
    if (!tradeId.trim()) return;
    try {
      const r = await apiGetJson<{ ok: true; trade: TradeSession }>(`/api/trade/get?tradeId=${encodeURIComponent(tradeId)}`);
      if (r?.ok) setTrade(r.trade);
    } catch (e) {
      if (!isUnauthorizedError(e)) setError(e);
    }
  }

  useEffect(() => {
    if (!tradeId.trim()) return;
    void refresh();
    const t = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  async function refreshInventory() {
    if (!user) return;
    setInvBusy(true);
    setInvError(null);
    try {
      const [inv, weapons, armor] = await Promise.all([
        apiGetJsonCached<{ ok: boolean; inventory?: TradeInvState["inventory"] }>(
          "/api/me/state?scope=inventory",
          { ttlMs: API_CACHE_TTL.meStateInventory },
        ),
        apiGetJsonCached<{ ok: boolean; weaponInstances?: TradeInvState["weaponInstances"] }>(
          "/api/me/state?scope=weapons",
          { ttlMs: API_CACHE_TTL.meStateWeapons },
        ),
        apiGetJsonCached<{ ok: boolean; armorInstances?: TradeInvState["armorInstances"] }>(
          "/api/me/state?scope=armor",
          { ttlMs: API_CACHE_TTL.meStateArmor },
        ),
      ]);
      if (inv?.ok) {
        setInv({
          inventory: inv.inventory ?? [],
          weaponInstances: weapons.weaponInstances ?? [],
          armorInstances: armor.armorInstances ?? [],
        });
      }
    } catch (e) {
      if (!isUnauthorizedError(e)) setInvError(e);
    } finally {
      setInvBusy(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void refreshInventory();
    const t = window.setInterval(() => void refreshInventory(), 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    // sync offered gold from server when trade loaded
    if (!trade || !mySide) return;
    if (goldDirty && !myLocked) return;
    setOfferedGold(mySide === "A" ? trade.offeredGoldA : trade.offeredGoldB);
  }, [trade, mySide]);

  async function createTrade() {
    if (!counterpartyUsername.trim()) return;
    setBusy("create");
    setError(null);
    try {
      const r = await apiPostJson<{ ok: true; tradeId: string }>("/api/trade/create", {
        counterpartyUsername: counterpartyUsername.trim(),
      });
      if (r?.ok) {
        setTradeId(r.tradeId);
        setDraftItems([]);
        setGoldDirty(false);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function pushOffer() {
    if (!tradeId.trim()) return;
    setBusy("offer");
    setError(null);
    try {
      const r = await apiPostJson<{ ok: true }>("/api/trade/offer", {
        tradeId,
        offeredGold,
        items: draftItems,
      });
      if (r?.ok) {
        setGoldDirty(false);
        await refresh();
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function lockMine() {
    if (!tradeId.trim()) return;
    setBusy("lock");
    setError(null);
    try {
      const r = await apiPostJson<{ ok: true }>("/api/trade/lock", { tradeId });
      if (r?.ok) {
        setGoldDirty(false);
        await refresh();
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function confirmMine() {
    if (!tradeId.trim()) return;
    setBusy("confirm");
    setError(null);
    try {
      const r = await apiPostJson<{ ok: true }>("/api/trade/confirm", { tradeId });
      if (r?.ok) await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!tradeId.trim()) return;
    setBusy("cancel");
    setError(null);
    try {
      const r = await apiPostJson<{ ok: true }>("/api/trade/cancel", { tradeId });
      if (r?.ok) {
        setTradeId("");
        setTrade(null);
        setDraftItems([]);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  function addStackDraft() {
    const id = stackItemId.trim();
    const qty = Math.max(1, Math.floor(stackQty || 1));
    if (!id) return;
    setDraftItems((cur) => [...cur, { kind: "STACK", itemId: id, quantity: qty }]);
    setStackItemId("");
    setStackQty(1);
  }

  function bumpStackDraft(itemId: string, qty: number) {
    const q = Math.max(1, Math.floor(qty || 1));
    setDraftItems((cur) => {
      const idx = cur.findIndex((x: any) => x.kind === "STACK" && x.itemId === itemId);
      if (idx >= 0) {
        const next = cur.slice();
        const row = next[idx] as any;
        next[idx] = { ...row, quantity: Math.max(1, Math.floor((row.quantity ?? 0) + q)) };
        return next;
      }
      return [...cur, { kind: "STACK", itemId, quantity: q }];
    });
  }

  function updateStackDraftQty(itemId: string, qty: number) {
    const q = Math.max(1, Math.floor(qty || 1));
    setDraftItems((cur) =>
      cur.map((it: any) => (it.kind === "STACK" && it.itemId === itemId ? { ...it, quantity: q } : it)),
    );
  }

  function removeDraftRow(idx: number) {
    setDraftItems((cur) => cur.filter((_, i) => i !== idx));
  }

  function addStackFromInventory(it: { itemId: string; quantity: number }, e?: { shiftKey?: boolean; altKey?: boolean }) {
    if (myLocked) return;
    const base = e?.altKey ? 10 : e?.shiftKey ? 50 : 1;
    const q = Math.max(1, Math.min(base, Math.floor(it.quantity || 1)));
    bumpStackDraft(it.itemId, q);
  }

  function addDraftFromPayload(raw: string) {
    try {
      const p = JSON.parse(raw) as any;
      if (!p || typeof p !== "object") return;
      if (p.kind === "STACK" && typeof p.itemId === "string") {
        const qty = Math.max(1, Math.floor(Number(p.quantity ?? 1) || 1));
        bumpStackDraft(p.itemId, qty);
        return;
      }
      if (p.kind === "WEAPON_INSTANCE" && typeof p.weaponInstanceId === "string") {
        setDraftItems((cur) => [...cur, { kind: "WEAPON_INSTANCE", weaponInstanceId: p.weaponInstanceId }]);
        return;
      }
      if (p.kind === "ARMOR_INSTANCE" && typeof p.armorInstanceId === "string") {
        setDraftItems((cur) => [...cur, { kind: "ARMOR_INSTANCE", armorInstanceId: p.armorInstanceId }]);
      }
    } catch {
      // ignore
    }
  }
  function addInstDraft(kind: "WEAPON_INSTANCE" | "ARMOR_INSTANCE") {
    if (kind === "WEAPON_INSTANCE") {
      const id = weaponInstId.trim();
      if (!id) return;
      setDraftItems((cur) => [...cur, { kind, weaponInstanceId: id }]);
      setWeaponInstId("");
      return;
    }
    const id = armorInstId.trim();
    if (!id) return;
    setDraftItems((cur) => [...cur, { kind, armorInstanceId: id }]);
    setArmorInstId("");
  }

  if (sessionLoading) return <GamePanelLoading label="세션 확인 중…" className="m-6" />;
  if (!user) return <GamePanelInfo className="m-6">로그인이 필요합니다.</GamePanelInfo>;

  const fee = Math.floor((Math.max(0, offeredGold) * 5) / 100);
  const netToOther = Math.max(0, offeredGold - fee);

  const invQuery = invQ.trim().toLowerCase();
  const filteredStacks = (inv?.inventory ?? [])
    .filter((x) => (x.quantity ?? 0) > 0)
    .filter((x) => {
      if (!invQuery) return true;
      return (
        x.name?.toLowerCase().includes(invQuery) ||
        x.itemId?.toLowerCase().includes(invQuery) ||
        x.category?.toLowerCase().includes(invQuery)
      );
    })
    .slice(0, 80);

  const filteredWeapons = (inv?.weaponInstances ?? [])
    .filter((x: any) => {
      if (!invQuery) return true;
      return x.name?.toLowerCase().includes(invQuery) || x.id?.toLowerCase().includes(invQuery) || x.baseItemId?.toLowerCase().includes(invQuery);
    })
    .slice(0, 60);

  const filteredArmors = (inv?.armorInstances ?? [])
    .filter((x: any) => {
      if (!invQuery) return true;
      return x.name?.toLowerCase().includes(invQuery) || x.id?.toLowerCase().includes(invQuery) || x.baseItemId?.toLowerCase().includes(invQuery);
    })
    .slice(0, 60);

  const stackById = useMemo(() => {
    const map = new Map<string, any>();
    for (const it of inv?.inventory ?? []) map.set(it.itemId, it);
    return map;
  }, [inv]);
  const weaponById = useMemo(() => new Map((inv?.weaponInstances ?? []).map((w: any) => [w.id, w])), [inv]);
  const armorById = useMemo(() => new Map((inv?.armorInstances ?? []).map((a: any) => [a.id, a])), [inv]);

  return (
    <GamePanel className="m-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">직거래</div>
          <div className="text-xs text-[var(--game-muted)]">골드 포함 · 수수료 5% · 양측 잠금/확정</div>
        </div>
        <div className="flex gap-2">
          <GameBtn variant="ghost" disabled={!tradeId || !!busy} onClick={() => void refresh()}>
            새로고침
          </GameBtn>
          <GameBtn variant="ghost" disabled={!tradeId || !!busy} onClick={() => void cancel()}>
            취소
          </GameBtn>
        </div>
      </div>

      {friendlyError ? (
        <div className="mt-3">
          <GamePanelError error={friendlyError} />
        </div>
      ) : null}

      {!tradeId ? (
        <div className="mt-4 space-y-2">
          <div className="text-sm text-[var(--game-muted)]">상대 유저명을 입력해 거래 세션을 만듭니다.</div>
          <div className="flex flex-wrap gap-2">
            <input
              className="game-input"
              placeholder="상대 유저명"
              value={counterpartyUsername}
              onChange={(e) => setCounterpartyUsername(e.target.value)}
            />
            <GameBtn disabled={!!busy || !counterpartyUsername.trim()} onClick={() => void createTrade()}>
              거래 요청
            </GameBtn>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* LEFT: trade */}
            <div className="space-y-4">
              <div className="rounded-xl bg-[var(--game-panel-2)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold">Trade</span>{" "}
                    <span className="font-mono">{tradeId.slice(0, 10)}…</span>
                    {trade ? (
                      <span className="ml-2 text-xs text-[var(--game-muted)]">
                        상태 {trade.status} · 만료 {new Date(trade.expiresAt).toLocaleTimeString()}
                      </span>
                    ) : null}
                  </div>
                  {trade ? (
                    <div className="text-xs text-[var(--game-muted)]">
                      내 잠금 {myLocked ? "Y" : "N"} · 내 확정 {myConfirmed ? "Y" : "N"} · 상대 잠금{" "}
                      {otherLocked ? "Y" : "N"} · 상대 확정 {otherConfirmed ? "Y" : "N"}
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className="rounded-xl bg-[var(--game-panel-2)] p-3"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw =
                    e.dataTransfer.getData("application/x-merxatus-trade") || e.dataTransfer.getData("text/plain");
                  if (raw) addDraftFromPayload(raw);
                }}
              >
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">내 제시</div>
                    <div className="text-xs text-[var(--game-muted)]">
                      스택: 클릭(1개) · Shift+클릭(50개) · Alt+클릭(10개) · 또는 드래그 드롭
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <GameBtn disabled={!!busy || myLocked} onClick={() => void pushOffer()}>
                      저장
                    </GameBtn>
                    <GameBtn disabled={!!busy || myLocked} onClick={() => void lockMine()}>
                      잠금
                    </GameBtn>
                    <GameBtn disabled={!!busy || !trade || trade.status !== "LOCKED"} onClick={() => void confirmMine()}>
                      확정
                    </GameBtn>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-[var(--game-muted)]">
                    골드
                    <input
                      className="game-input mt-1"
                      type="number"
                      min={0}
                      value={offeredGold}
                      disabled={myLocked}
                      onChange={(e) => {
                        setGoldDirty(true);
                        setOfferedGold(Math.max(0, Math.floor(Number(e.target.value) || 0)));
                      }}
                    />
                  </label>
                  <div className="text-xs text-[var(--game-muted)]">
                    수수료 5%: {fee.toLocaleString()}G · 상대 수령: {netToOther.toLocaleString()}G
                  </div>
                </div>

                <div className="mt-3">
                  {draftItems.length === 0 ? (
                    <div className="text-sm text-[var(--game-muted)]">오른쪽 인벤에서 아이템을 올려 주세요.</div>
                  ) : (
                    <div className="space-y-2">
                      {draftItems.map((it: any, idx) => (
                        <div
                          key={idx}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--game-panel)] px-3 py-2"
                        >
                          {it.kind === "STACK" ? (() => {
                            const row = stackById.get(it.itemId);
                            const name = row?.name ?? it.itemId;
                            const grade = row?.grade ?? 1;
                            return (
                              <div className="flex min-w-0 items-center gap-2">
                                <ItemIcon itemId={it.itemId} icon={row?.icon} iconSrc={row?.iconSrc} size={32} eager />
                                <div className="min-w-0">
                                  <div className={`truncate text-xs font-semibold ${itemGradeNameClassName(grade)}`}>{name}</div>
                                  <div className="text-[10px] text-[var(--game-muted)]">{it.itemId}</div>
                                </div>
                              </div>
                            );
                          })() : it.kind === "WEAPON_INSTANCE" ? (() => {
                            const w = weaponById.get(it.weaponInstanceId);
                            const name = w?.name ?? it.weaponInstanceId;
                            const grade = w?.grade ?? 1;
                            const iconItemId = w?.baseItemId ?? "weapon_wood_sword";
                            return (
                              <div className="flex min-w-0 items-center gap-2">
                                <ItemIcon itemId={iconItemId} icon={w?.icon} iconSrc={w?.iconSrc} size={32} eager />
                                <div className="min-w-0">
                                  <div className={`truncate text-xs font-semibold ${itemGradeNameClassName(grade)}`}>
                                    {name}{w?.enhanceLevel > 0 ? ` +${w.enhanceLevel}` : ""}
                                  </div>
                                  <div className="text-[10px] text-[var(--game-muted)]">{it.weaponInstanceId.slice(0, 12)}…</div>
                                </div>
                              </div>
                            );
                          })() : (() => {
                            const a = armorById.get(it.armorInstanceId);
                            const name = a?.name ?? it.armorInstanceId;
                            const grade = a?.grade ?? 1;
                            const iconItemId = a?.baseItemId ?? "armor_leather_armor";
                            return (
                              <div className="flex min-w-0 items-center gap-2">
                                <ItemIcon itemId={iconItemId} icon={a?.icon} iconSrc={a?.iconSrc} size={32} eager />
                                <div className="min-w-0">
                                  <div className={`truncate text-xs font-semibold ${itemGradeNameClassName(grade)}`}>{name}</div>
                                  <div className="text-[10px] text-[var(--game-muted)]">{it.armorInstanceId.slice(0, 12)}…</div>
                                </div>
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-2">
                            {it.kind === "STACK" ? (
                              <input
                                className="game-input w-24"
                                type="number"
                                min={1}
                                value={it.quantity}
                                disabled={myLocked}
                                onChange={(e) => updateStackDraftQty(it.itemId, Number(e.target.value))}
                              />
                            ) : null}
                            <button
                              type="button"
                              className="text-xs text-[var(--game-muted)] hover:text-[var(--game-text)]"
                              disabled={myLocked}
                              onClick={() => removeDraftRow(idx)}
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className="mt-3 text-xs text-[var(--game-muted)] hover:text-[var(--game-text)]"
                    onClick={() => setShowAdvancedAdd((v) => !v)}
                    disabled={myLocked}
                  >
                    {showAdvancedAdd ? "고급 추가 닫기" : "고급 추가(직접 id 입력)"}
                  </button>

                  {showAdvancedAdd ? (
                    <div className="mt-2 grid gap-2">
                      <div className="flex flex-wrap gap-2">
                        <input
                          className="game-input"
                          placeholder="stack itemId (예: item_stone)"
                          value={stackItemId}
                          disabled={myLocked}
                          onChange={(e) => setStackItemId(e.target.value)}
                        />
                        <input
                          className="game-input w-24"
                          type="number"
                          min={1}
                          value={stackQty}
                          disabled={myLocked}
                          onChange={(e) => setStackQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                        />
                        <GameBtn disabled={myLocked} onClick={addStackDraft}>
                          스택 추가
                        </GameBtn>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input
                          className="game-input"
                          placeholder="weaponInstanceId"
                          value={weaponInstId}
                          disabled={myLocked}
                          onChange={(e) => setWeaponInstId(e.target.value)}
                        />
                        <GameBtn disabled={myLocked} onClick={() => addInstDraft("WEAPON_INSTANCE")}>
                          무기 추가
                        </GameBtn>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input
                          className="game-input"
                          placeholder="armorInstanceId"
                          value={armorInstId}
                          disabled={myLocked}
                          onChange={(e) => setArmorInstId(e.target.value)}
                        />
                        <GameBtn disabled={myLocked} onClick={() => addInstDraft("ARMOR_INSTANCE")}>
                          방어구 추가
                        </GameBtn>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* RIGHT: inventory */}
            <div className="rounded-xl bg-[var(--game-panel-2)] p-3">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">내 인벤토리</div>
                  <div className="text-xs text-[var(--game-muted)]">클릭/드래그로 왼쪽에 추가</div>
                </div>
                <div className="flex gap-2">
                  <GameBtn variant="ghost" disabled={invBusy} onClick={() => void refreshInventory()}>
                    {invBusy ? "…" : "새로고침"}
                  </GameBtn>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2" role="tablist">
                  {(
                    [
                      ["STACK", "스택"],
                      ["WEAPON", "무기"],
                      ["ARMOR", "방어구"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={invTab === id}
                      className={`market-board__tab ${invTab === id ? "market-board__tab--active" : ""}`}
                      onClick={() => setInvTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  className="market-input market-input--search"
                  placeholder="검색…"
                  value={invQ}
                  onChange={(e) => setInvQ(e.target.value)}
                />
              </div>

              {friendlyInvError ? (
                <div className="mt-2">
                  <GamePanelError error={friendlyInvError} />
                </div>
              ) : null}

              {!inv ? (
                <div className="mt-3 text-sm text-[var(--game-muted)]">{invBusy ? "불러오는 중…" : "—"}</div>
              ) : (
                <div className="mt-3">
                  {invTab === "STACK" ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {filteredStacks.map((it) => {
                        const payload = JSON.stringify({ kind: "STACK", itemId: it.itemId, quantity: 1 });
                        return (
                          <button
                            key={it.itemId}
                            type="button"
                            className="inventory-item-card inventory-item-card--compact flex items-center gap-2"
                            disabled={myLocked}
                            draggable={!myLocked}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("application/x-merxatus-trade", payload);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={(e) => addStackFromInventory(it, e)}
                          >
                            <ItemIcon itemId={it.itemId} icon={it.icon} iconSrc={it.iconSrc} size={36} eager />
                            <div className="min-w-0 text-left">
                              <div className={`truncate text-xs font-semibold ${itemGradeNameClassName(it.grade ?? 1)}`}>
                                {it.name}
                              </div>
                              <div className="text-[10px] text-[var(--game-muted)]">×{it.quantity}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : invTab === "WEAPON" ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {filteredWeapons.map((w: any) => {
                        const payload = JSON.stringify({ kind: "WEAPON_INSTANCE", weaponInstanceId: w.id });
                        return (
                          <button
                            key={w.id}
                            type="button"
                            className="inventory-item-card inventory-item-card--compact flex items-center gap-2"
                            disabled={myLocked}
                            draggable={!myLocked}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("application/x-merxatus-trade", payload);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => addDraftFromPayload(payload)}
                          >
                            <ItemIcon itemId={w.baseItemId} icon={w.icon} iconSrc={w.iconSrc} size={36} eager />
                            <div className="min-w-0 text-left">
                              <div className={`truncate text-xs font-semibold ${itemGradeNameClassName(w.grade ?? 1)}`}>
                                {w.name}
                                {w.enhanceLevel > 0 ? ` +${w.enhanceLevel}` : ""}
                              </div>
                              <div className="text-[10px] text-[var(--game-muted)]">{w.id.slice(0, 10)}…</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {filteredArmors.map((a: any) => {
                        const payload = JSON.stringify({ kind: "ARMOR_INSTANCE", armorInstanceId: a.id });
                        return (
                          <button
                            key={a.id}
                            type="button"
                            className="inventory-item-card inventory-item-card--compact flex items-center gap-2"
                            disabled={myLocked}
                            draggable={!myLocked}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("application/x-merxatus-trade", payload);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => addDraftFromPayload(payload)}
                          >
                            <ItemIcon itemId={a.baseItemId} icon={a.icon} iconSrc={a.iconSrc} size={36} eager />
                            <div className="min-w-0 text-left">
                              <div className={`truncate text-xs font-semibold ${itemGradeNameClassName(a.grade ?? 1)}`}>
                                {a.name}
                              </div>
                              <div className="text-[10px] text-[var(--game-muted)]">{a.id.slice(0, 10)}…</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </GamePanel>
  );
}

