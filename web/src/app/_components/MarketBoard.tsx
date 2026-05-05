"use client";

import { useEffect, useMemo, useState } from "react";
import { itemGradeNameClassName } from "@/server/itemGrade";

type Listing = {
  id: string;
  saleType: "FIXED" | "AUCTION";
  status: "ACTIVE";
  sellerId: string;
  itemId: string;
  itemName: string;
  itemGrade?: number;
  category: string;
  weapon?: {
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    status: string;
    grade?: number;
  } | null;
  quantity: number;
  fixedPricePerUnit: number | null;
  fixedPriceTotal?: number | null;
  startPrice: number | null;
  endsAt: string | null;
  highestBid: number | null;
  highestBidderId: string | null;
  createdAt: string;
};

type MyListing = {
  id: string;
  saleType: "FIXED" | "AUCTION";
  status: "ACTIVE";
  itemId: string;
  itemName: string;
  itemGrade?: number;
  weaponInstance?: {
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    grade?: number;
  } | null;
  quantity: number;
  fixedPricePerUnit: number | null;
  fixedPriceTotal?: number | null;
  startPrice: number | null;
  endsAt: string | null;
  highestBid: number | null;
  highestBidderId: string | null;
  createdAt: string;
};

type MeState = { ok: true; myListings: MyListing[] };

type MarketStats = {
  ok: true;
  item: { id: string; name: string | null; category: string | null; grade?: number | null };
  summary: {
    trades: number;
    volume: number;
    lastUnitPrice: number | null;
    avgUnitPrice: number | null;
    minUnitPrice: number | null;
    maxUnitPrice: number | null;
  };
  trades: Array<{
    transactionId: string;
    createdAt: string;
    grossGold: number;
    feeGold: number;
    netGold: number;
    quantity: number;
    unitPrice: number;
    buyerId: string;
    sellerId: string;
    saleType: "FIXED" | "AUCTION";
    listingId: string;
  }>;
};

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

function useLocalStorageString(key: string) {
  const [value, setValue] = useState("");

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v) setValue(v);
    } catch {}
  }, [key]);

  useEffect(() => {
    function syncFromStorage() {
      try {
        const v = localStorage.getItem(key) ?? "";
        setValue(v);
      } catch {}
    }

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("dev_user_changed", syncFromStorage as EventListener);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("dev_user_changed", syncFromStorage as EventListener);
    };
  }, [key]);

  useEffect(() => {
    try {
      if (value) localStorage.setItem(key, value);
    } catch {}
  }, [key, value]);

  return [value, setValue] as const;
}

export function MarketBoard() {
  const [userId, setUserId] = useLocalStorageString("dev_userId");
  const [tab, setTab] = useState<"MARKET" | "MINE">("MARKET");
  const [q, setQ] = useState("");
  const [saleType, setSaleType] = useState<"" | "FIXED" | "AUCTION">("");
  const [sort, setSort] = useState<"NEWEST" | "PRICE_ASC" | "ENDS_SOON">("NEWEST");
  const [bidAmount, setBidAmount] = useState(250);
  const [buyQtyByListingId, setBuyQtyByListingId] = useState<Record<string, number>>({});
  const [statsItemId, setStatsItemId] = useState<string | null>(null);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [statsBusy, setStatsBusy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<MyListing[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editListing, setEditListing] = useState<MyListing | null>(null);
  const [editFixedMode, setEditFixedMode] = useState<"UNIT" | "TOTAL">("UNIT");
  const [editFixedUnit, setEditFixedUnit] = useState(1);
  const [editFixedTotal, setEditFixedTotal] = useState(1);
  const [editStartPrice, setEditStartPrice] = useState(1);

  const queryUrl = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (saleType) sp.set("saleType", saleType);
    if (sort) sp.set("sort", sort);
    sp.set("take", "50");
    return `/api/market/listings?${sp.toString()}`;
  }, [q, saleType, sort]);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      if (tab === "MARKET") {
        const r = await getJson<{ ok: boolean; listings: Listing[] }>(queryUrl);
        setListings(r.listings ?? []);
      } else {
        const r = await getJson<MeState>("/api/me/state");
        setMyListings(r?.myListings ?? []);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryUrl, tab]);

  async function cancelMine(listingId: string) {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/market/cancel", { listingId });
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function settleMine(listingId: string) {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/market/settle", { listingId });
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function openStats(itemId: string) {
    setStatsItemId(itemId);
    setStats(null);
    setStatsBusy(true);
    try {
      const r = await getJson<MarketStats>(`/api/market/stats?itemId=${encodeURIComponent(itemId)}&take=30`);
      setStats(r);
    } catch (e) {
      setStats(null);
      setError(e);
    } finally {
      setStatsBusy(false);
    }
  }

  function openEditListing(l: MyListing) {
    setError(null);
    setEditListing(l);
    setEditOpen(true);

    if (l.saleType === "FIXED") {
      const mode: "UNIT" | "TOTAL" = l.fixedPriceTotal != null ? "TOTAL" : "UNIT";
      setEditFixedMode(mode);
      setEditFixedUnit(Math.max(1, Math.floor(l.fixedPricePerUnit ?? 1)));
      setEditFixedTotal(Math.max(1, Math.floor(l.fixedPriceTotal ?? 1)));
    } else {
      setEditStartPrice(Math.max(1, Math.floor(l.startPrice ?? 1)));
    }
  }

  async function submitEdit() {
    if (!editListing) return;
    setBusy(true);
    setError(null);
    try {
      if (editListing.saleType === "FIXED") {
        const body =
          editFixedMode === "TOTAL"
            ? {
                listingId: editListing.id,
                saleType: "FIXED" as const,
                fixedPriceTotal: Math.max(1, Math.floor(editFixedTotal)),
              }
            : {
                listingId: editListing.id,
                saleType: "FIXED" as const,
                fixedPricePerUnit: Math.max(1, Math.floor(editFixedUnit)),
              };
        await postJson("/api/market/update", body);
      } else {
        await postJson("/api/market/update", {
          listingId: editListing.id,
          saleType: "AUCTION" as const,
          startPrice: Math.max(1, Math.floor(editStartPrice)),
        });
      }
      setEditOpen(false);
      setEditListing(null);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold">경매장</div>
          <div className="text-sm text-zinc-600">
            {tab === "MARKET" ? "경매장 물품 (전체 활성 매물)" : "내 판매 물품 (내 활성 매물)"}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className={`h-10 rounded-xl px-4 text-sm font-semibold ${tab === "MARKET" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-900"}`}
            onClick={() => setTab("MARKET")}
          >
            경매장 물품
          </button>
          <button
            className={`h-10 rounded-xl px-4 text-sm font-semibold ${tab === "MINE" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-900"}`}
            onClick={() => setTab("MINE")}
          >
            내 판매 물품
          </button>
        </div>
      </div>

      {tab === "MARKET" ? (
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="flex flex-col gap-2 md:col-span-2">
          <label className="text-xs font-semibold text-zinc-600">검색</label>
          <input
            className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="아이템 이름 / itemId / listingId"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-zinc-600">타입</label>
          <select
            className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            value={saleType}
            onChange={(e) => setSaleType(e.target.value as any)}
          >
            <option value="">전체</option>
            <option value="FIXED">고정가</option>
            <option value="AUCTION">경매</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-zinc-600">정렬</label>
          <select
            className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
          >
            <option value="NEWEST">최신</option>
            <option value="PRICE_ASC">가격 낮은순</option>
            <option value="ENDS_SOON">종료 임박순</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-zinc-600">내 userId (세션)</label>
          <input
            className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-700 outline-none"
            value={userId}
            readOnly
          />
          <div className="text-[11px] text-zinc-500">로그인하면 자동으로 채워져. 구매/입찰은 세션을 사용해.</div>
        </div>
      </div>
      ) : (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          내 판매 물품 탭에서는 내가 올린 활성 매물을 보고 취소/정산할 수 있어.
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void refresh()}
        >
          새로고침
        </button>
        {tab === "MARKET" ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-600">경매 입찰액</span>
              <input
                className="h-10 w-32 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(Number(e.target.value))}
                min={1}
                step={1}
              />
            </div>
            <div className="text-xs text-zinc-500">총 {listings.length}개</div>
          </>
        ) : (
          <div className="text-xs text-zinc-500">총 {myListings.length}개</div>
        )}
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          조회 실패: {typeof error === "string" ? error : JSON.stringify(error)}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2">
        {tab === "MARKET" ? (
        listings.length === 0 ? (
          <div className="text-sm text-zinc-500">매물이 없어. (시드 넣기/판매 등록 후 새로고침)</div>
        ) : (
          listings.map((l) => (
            <div
              key={l.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="truncate text-left text-sm font-semibold underline decoration-zinc-300 underline-offset-4"
                    onClick={() => void openStats(l.itemId)}
                    title="클릭해서 시세/거래 히스토리 보기"
                  >
                    {l.weapon ? (
                      <>
                        <span className={itemGradeNameClassName(l.weapon.grade ?? l.itemGrade ?? 1)}>
                          {l.weapon.name}
                        </span>
                        {l.weapon.enhanceLevel > 0 ? (
                          <span className="text-zinc-700">{` +${l.weapon.enhanceLevel}`}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className={itemGradeNameClassName(l.itemGrade ?? 1)}>{l.itemName}</span>
                    )}
                  </button>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                    {l.saleType}
                  </span>
                  <span className="text-xs text-zinc-500">
                    qty {l.quantity} · {l.itemId} · {l.category}
                  </span>
                </div>
                {l.saleType === "FIXED" ? (
                  l.fixedPriceTotal != null ? (
                    <div className="mt-1 text-sm text-zinc-700">
                      총액: {l.fixedPriceTotal}G (전체 구매만 가능) · 참고 단가{" "}
                      {l.quantity > 0 ? Math.max(1, Math.floor(l.fixedPriceTotal / l.quantity)) : "-"}G/개
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-zinc-700">단가: {l.fixedPricePerUnit}G /개 (부분 구매 가능)</div>
                  )
                ) : (
                  <div className="mt-1 text-sm text-zinc-700">
                    시작가: {l.startPrice} · 최고가: {l.highestBid ?? "-"} · 종료:{" "}
                    {l.endsAt ? new Date(l.endsAt).toLocaleTimeString() : "-"}
                  </div>
                )}
                <div className="mt-1 text-xs text-zinc-500">listingId: {l.id}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {l.saleType === "FIXED" ? (
                  <>
                    {l.fixedPriceTotal != null ? (
                      <div className="text-sm font-semibold text-zinc-800">수량 {l.quantity}</div>
                    ) : (
                      <input
                        className="h-10 w-24 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                        type="number"
                        min={1}
                        max={l.quantity}
                        value={buyQtyByListingId[l.id] ?? 1}
                        onChange={(e) => {
                          const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setBuyQtyByListingId((prev) => ({ ...prev, [l.id]: Math.min(v, l.quantity) }));
                        }}
                        title="구매 수량"
                      />
                    )}
                    <button
                      className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                      disabled={busy || !userId || userId === l.sellerId}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        try {
                          const qty = l.fixedPriceTotal != null ? l.quantity : (buyQtyByListingId[l.id] ?? 1);
                          await postJson("/api/market/buy", { listingId: l.id, quantity: qty });
                          await refresh();
                        } catch (e) {
                          setError(e);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      구매
                    </button>
                  </>
                ) : (
                  <button
                    className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busy || !userId || userId === l.sellerId}
                    onClick={async () => {
                      setBusy(true);
                      setError(null);
                      try {
                        await postJson("/api/market/bid", { listingId: l.id, amount: bidAmount });
                        await refresh();
                      } catch (e) {
                        setError(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    입찰
                  </button>
                )}
              </div>
            </div>
          ))
        )
        ) : (
          myListings.length === 0 ? (
            <div className="text-sm text-zinc-500">내 판매중 매물이 없어.</div>
          ) : (
            myListings.map((l) => (
              <div
                key={l.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-semibold">
                      {l.weaponInstance ? (
                        <>
                          <span className={itemGradeNameClassName(l.weaponInstance.grade ?? l.itemGrade ?? 1)}>
                            {l.weaponInstance.name}
                          </span>
                          {l.weaponInstance.enhanceLevel > 0 ? (
                            <span className="text-zinc-700">{` +${l.weaponInstance.enhanceLevel}`}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className={itemGradeNameClassName(l.itemGrade ?? 1)}>{l.itemName}</span>
                      )}
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                      {l.saleType}
                    </span>
                    <span className="text-xs text-zinc-500">qty {l.quantity} · {l.itemId}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">listingId: {l.id}</div>
                  {l.saleType === "AUCTION" ? (
                    <div className="mt-1 text-sm text-zinc-700">
                      시작가: {l.startPrice} · 최고가: {l.highestBid ?? "-"} · 종료:{" "}
                      {l.endsAt ? new Date(l.endsAt).toLocaleTimeString() : "-"}
                    </div>
                  ) : l.fixedPriceTotal != null ? (
                    <div className="mt-1 text-sm text-zinc-700">총액: {l.fixedPriceTotal}G</div>
                  ) : (
                    <div className="mt-1 text-sm text-zinc-700">단가: {l.fixedPricePerUnit}G /개</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                    disabled={
                      busy ||
                      (l.saleType === "AUCTION" && (l.highestBid != null || l.highestBidderId != null))
                    }
                    onClick={() => openEditListing(l)}
                    title={
                      l.saleType === "AUCTION" && (l.highestBid != null || l.highestBidderId != null)
                        ? "입찰이 있으면 경매 시작가 수정이 불가"
                        : "가격 수정"
                    }
                  >
                    수정
                  </button>
                  {l.saleType === "AUCTION" ? (
                    <button
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void settleMine(l.id)}
                    >
                      정산
                    </button>
                  ) : null}
                  <button
                    className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void cancelMine(l.id)}
                  >
                    취소
                  </button>
                </div>
              </div>
            ))
          )
        )}
      </div>

      {statsItemId ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div className="text-sm font-semibold">
              시세 · 거래 히스토리{" "}
              <span className="text-xs font-semibold text-zinc-500">({statsItemId})</span>
            </div>
            <div className="flex gap-2">
              <button
                className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                disabled={statsBusy}
                onClick={() => void openStats(statsItemId)}
              >
                새로고침
              </button>
              <button
                className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white"
                onClick={() => {
                  setStatsItemId(null);
                  setStats(null);
                }}
              >
                닫기
              </button>
            </div>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-semibold">
                <span className={itemGradeNameClassName(stats?.item?.grade ?? 1)}>{stats?.item?.name ?? "아이템"}</span>{" "}
                <span className="text-xs font-semibold text-zinc-500">{stats?.item?.category ?? ""}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs font-semibold text-zinc-600">최근 거래 수</div>
                  <div className="mt-1 font-semibold">{stats?.summary.trades ?? (statsBusy ? "…" : 0)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-600">거래량(수량)</div>
                  <div className="mt-1 font-semibold">{stats?.summary.volume ?? (statsBusy ? "…" : 0)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-600">최근 단가</div>
                  <div className="mt-1 font-semibold">
                    {statsBusy ? "…" : stats?.summary.lastUnitPrice?.toFixed(2) ?? "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-600">평균 단가(최근)</div>
                  <div className="mt-1 font-semibold">
                    {statsBusy ? "…" : stats?.summary.avgUnitPrice?.toFixed(2) ?? "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-600">최저 단가</div>
                  <div className="mt-1 font-semibold">
                    {statsBusy ? "…" : stats?.summary.minUnitPrice?.toFixed(2) ?? "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-600">최고 단가</div>
                  <div className="mt-1 font-semibold">
                    {statsBusy ? "…" : stats?.summary.maxUnitPrice?.toFixed(2) ?? "-"}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-zinc-600">
                단가 = 거래 총액 / 거래 수량. (지금은 단일 매물 거래라 정확)
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold">최근 거래</div>
              <div className="mt-3 grid gap-2">
                {statsBusy ? (
                  <div className="text-sm text-zinc-500">불러오는 중…</div>
                ) : !stats?.trades?.length ? (
                  <div className="text-sm text-zinc-500">거래 기록이 아직 없어. (구매/정산 후 생김)</div>
                ) : (
                  stats.trades.map((t) => (
                    <div
                      key={t.transactionId}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-700">
                          {new Date(t.createdAt).toLocaleString()} · {t.saleType}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate">
                          seller {t.sellerId} → buyer {t.buyerId}
                        </div>
                      </div>
                      <div className="ml-3 text-right">
                        <div className="text-sm font-semibold tabular-nums">{t.unitPrice.toFixed(2)} /개</div>
                        <div className="text-xs text-zinc-600 tabular-nums">
                          총 {t.grossGold} · qty {t.quantity}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen && editListing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">내 매물 가격 수정</div>
                <div className="mt-1 text-xs text-zinc-600">
                  {editListing.weaponInstance ? (
                    <>
                      <span
                        className={itemGradeNameClassName(
                          editListing.weaponInstance.grade ?? editListing.itemGrade ?? 1,
                        )}
                      >
                        {editListing.weaponInstance.name}
                      </span>
                      {editListing.weaponInstance.enhanceLevel > 0 ? (
                        <span className="text-zinc-700">{` +${editListing.weaponInstance.enhanceLevel}`}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className={itemGradeNameClassName(editListing.itemGrade ?? 1)}>{editListing.itemName}</span>
                  )}{" "}
                  · <span className="font-mono">{editListing.id}</span> · {editListing.saleType}
                </div>
              </div>
              <button
                className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                onClick={() => {
                  setEditOpen(false);
                  setEditListing(null);
                }}
              >
                닫기
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {editListing.saleType === "FIXED" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-zinc-600">고정가 타입</label>
                    <select
                      className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      value={editFixedMode}
                      onChange={(e) => setEditFixedMode(e.target.value as any)}
                    >
                      <option value="UNIT">단가(부분 구매 가능)</option>
                      <option value="TOTAL">총액(전체 구매만)</option>
                    </select>
                  </div>

                  {editFixedMode === "UNIT" ? (
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label className="text-xs font-semibold text-zinc-600">단가</label>
                      <input
                        className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                        type="number"
                        min={1}
                        value={editFixedUnit}
                        onChange={(e) => setEditFixedUnit(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label className="text-xs font-semibold text-zinc-600">총액</label>
                      <input
                        className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                        type="number"
                        min={1}
                        value={editFixedTotal}
                        onChange={(e) => setEditFixedTotal(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                      />
                      <div className="mt-1 text-[11px] text-zinc-500">총액 고정가는 구매자가 수량을 나눠 살 수 없어.</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-600">시작가</label>
                  <input
                    className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                    type="number"
                    min={1}
                    value={editStartPrice}
                    onChange={(e) => setEditStartPrice(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  />
                  <div className="mt-1 text-[11px] text-zinc-500">경매는 입찰이 있으면 수정이 막혀.</div>
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="h-10 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900"
                onClick={() => {
                  setEditOpen(false);
                  setEditListing(null);
                }}
              >
                취소
              </button>
              <button
                className="h-10 flex-1 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => void submitEdit()}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

