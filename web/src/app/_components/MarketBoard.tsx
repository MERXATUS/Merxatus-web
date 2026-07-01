"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { formatPanelError } from "@/shared/formatPanelError";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { API_CACHE_TTL } from "@/shared/apiCache";
import { apiGetJson, apiGetJsonCached, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
import {
  GAME_FRAME_REFRESH_EVENT,
} from "@/shared/gameNav";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";
import {
  MarketSellTab,
  MARKET_ARMOR_CATEGORY,
  MARKET_SELL_CATEGORY_ALL,
  MARKET_WEAPON_CATEGORY,
  type SellArmorRow,
  type SellInventoryRow,
  type SellWeaponRow,
} from "@/app/_components/MarketSellTab";
import {
  MarketListingEquipmentHover,
  type MarketListingEquipmentView,
} from "@/app/_components/MarketListingEquipmentHover";

type Listing = {
  id: string;
  saleType: "FIXED" | "AUCTION";
  status: "ACTIVE";
  sellerId: string;
  itemId: string;
  itemName: string;
  itemGrade?: number;
  category: string;
  weapon?: MarketListingEquipmentView | null;
  armor?: MarketListingEquipmentView | null;
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
  weapon?: MarketListingEquipmentView | null;
  armor?: MarketListingEquipmentView | null;
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
  return apiGetJson<T>(url);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiPostJson<T>(url, body);
}

function fmtGold(n: number) {
  return n.toLocaleString();
}

function formatListingEnds(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function listingIconId(l: {
  itemId: string;
  weapon?: { baseItemId: string } | null;
  armor?: { baseItemId: string } | null;
}) {
  return l.weapon?.baseItemId ?? l.armor?.baseItemId ?? l.itemId;
}

function listingDisplayName(l: {
  itemName: string;
  itemGrade?: number;
  weapon?: { name: string; enhanceLevel: number; grade?: number } | null;
  armor?: { name: string; enhanceLevel: number; grade?: number } | null;
}) {
  const equip = l.weapon ?? l.armor;
  if (equip) {
    return {
      name: equip.name,
      enhance: equip.enhanceLevel,
      grade: equip.grade ?? l.itemGrade ?? 1,
    };
  }
  return { name: l.itemName, enhance: 0, grade: l.itemGrade ?? 1 };
}

function listingUnitPrice(l: Listing | MyListing): number | null {
  if (l.saleType === "AUCTION") return l.startPrice;
  if (l.fixedPriceTotal != null && l.quantity > 0) return Math.max(1, Math.floor(l.fixedPriceTotal / l.quantity));
  return l.fixedPricePerUnit;
}

function listingPriceLabel(l: Listing | MyListing): { main: string; sub?: string } {
  if (l.saleType === "AUCTION") {
    const high = l.highestBid;
    return {
      main: high != null ? `${fmtGold(high)} G` : `${fmtGold(l.startPrice ?? 0)} G`,
      sub: high != null ? `시작 ${fmtGold(l.startPrice ?? 0)} G` : "시작가",
    };
  }
  if (l.fixedPriceTotal != null) {
    return { main: `${fmtGold(l.fixedPriceTotal)} G`, sub: "일괄 구매" };
  }
  return { main: `${fmtGold(l.fixedPricePerUnit ?? 0)} G`, sub: "개당" };
}

const CATEGORY_ALL = "전체";

export function MarketBoard({ embedded = false }: EmbeddedPanelProps = {}) {
  const { user, loading: sessionLoading } = useSessionUser();
  const userId = user?.id ?? "";
  const [tab, setTab] = useState<"MARKET" | "SELL" | "MINE">("MARKET");
  const [sellCategories, setSellCategories] = useState<string[]>([MARKET_SELL_CATEGORY_ALL]);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(CATEGORY_ALL);
  const [saleType, setSaleType] = useState<"" | "FIXED" | "AUCTION">("");
  const [sort, setSort] = useState<"NEWEST" | "PRICE_ASC" | "ENDS_SOON">("NEWEST");
  const [bidAmount, setBidAmount] = useState(250);
  const [buyQtyByListingId, setBuyQtyByListingId] = useState<Record<string, number>>({});
  const [statsItemId, setStatsItemId] = useState<string | null>(null);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [statsBusy, setStatsBusy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<MyListing[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editListing, setEditListing] = useState<MyListing | null>(null);
  const [editFixedMode, setEditFixedMode] = useState<"UNIT" | "TOTAL">("UNIT");
  const [editFixedUnit, setEditFixedUnit] = useState(1);
  const [editFixedTotal, setEditFixedTotal] = useState(1);
  const [editStartPrice, setEditStartPrice] = useState(1);

  const closeEditModal = useCallback(() => {
    setEditOpen(false);
    setEditListing(null);
  }, []);

  useEscapeClose(editOpen && !!editListing, closeEditModal);

  const closeStatsPanel = useCallback(() => {
    setStatsItemId(null);
    setStats(null);
  }, []);
  useEscapeClose(!!statsItemId, closeStatsPanel);

  const [saleNotice, setSaleNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "sell") setTab("SELL");
    else if (t === "mine") setTab("MINE");
  }, []);

  const queryUrl = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (saleType) sp.set("saleType", saleType);
    if (sort) sp.set("sort", sort);
    sp.set("take", "50");
    return `/api/market/listings?${sp.toString()}`;
  }, [q, saleType, sort]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const l of listings) if (l.category) set.add(l.category);
    return [CATEGORY_ALL, ...Array.from(set).sort()];
  }, [listings]);

  const filteredListings = useMemo(() => {
    if (categoryFilter === CATEGORY_ALL) return listings;
    return listings.filter((l) => l.category === categoryFilter);
  }, [listings, categoryFilter]);

  const activeCategories = tab === "SELL" ? sellCategories : categories;

  const onSellInventoryLoaded = useCallback(
    (inv: SellInventoryRow[], weapons: SellWeaponRow[], armors: SellArmorRow[]) => {
      const set = new Set<string>();
      for (const it of inv) if (it.category) set.add(it.category);
      if (weapons.length > 0) set.add(MARKET_WEAPON_CATEGORY);
      if (armors.length > 0) set.add(MARKET_ARMOR_CATEGORY);
      setSellCategories([MARKET_SELL_CATEGORY_ALL, ...Array.from(set).sort()]);
    },
    [],
  );

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      if (tab === "MARKET") {
        const r = await getJson<{ ok: boolean; listings: Listing[] }>(queryUrl);
        setListings(r.listings ?? []);
      } else {
        if (!user) {
          setMyListings([]);
          return;
        }
        const r = await apiGetJsonCached<MeState>("/api/me/state?scope=market", {
          ttlMs: API_CACHE_TTL.meStateMarket,
        });
        setMyListings(r?.myListings ?? []);
      }
    } catch (e) {
      if (!isUnauthorizedError(e)) setError(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (sessionLoading) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryUrl, tab, user?.id, sessionLoading]);

  useEffect(() => {
    if (!embedded) return;
    const onFrameRefresh = () => void refresh();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);

  useEffect(() => {
    const pool = tab === "SELL" ? sellCategories : categories;
    if (categoryFilter !== CATEGORY_ALL && !pool.includes(categoryFilter)) {
      setCategoryFilter(CATEGORY_ALL);
    }
  }, [categories, sellCategories, categoryFilter, tab]);

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

  function renderMarketRow(l: Listing) {
    const d = listingDisplayName(l);
    const price = listingPriceLabel(l);
    const iconId = listingIconId(l);
    const isMine = userId && userId === l.sellerId;

    const isEquipment = !!(l.weapon || l.armor);

    return (
      <div key={l.id} className="market-row">
        <MarketListingEquipmentHover weapon={l.weapon} armor={l.armor}>
          <button type="button" className="market-row__item" onClick={() => void openStats(l.itemId)} title="시세 보기">
            <ItemIcon itemId={iconId} size={44} className="market-row__icon" />
            <div className="market-row__info">
              <div className="market-row__name-line">
                <span className={`market-row__name ${itemGradeNameClassName(d.grade)}`}>{d.name}</span>
                {d.enhance > 0 ? <span className="market-row__enh">+{d.enhance}</span> : null}
              </div>
              <div className="market-row__meta">
                <span className={`market-row__badge market-row__badge--${l.saleType === "FIXED" ? "fixed" : "auction"}`}>
                  {l.saleType === "FIXED" ? "고정가" : "경매"}
                </span>
                <span className="market-row__cat">{l.category}</span>
                {isEquipment ? <span className="market-row__cat">옵션 호버</span> : null}
              </div>
            </div>
          </button>
        </MarketListingEquipmentHover>

        <div className="market-row__qty" title="수량">
          <span className="market-row__col-label">수량</span>
          <span className="market-row__qty-val">{l.quantity.toLocaleString()}</span>
        </div>

        <div className="market-row__price">
          <span className="market-row__col-label">가격</span>
          <span className="market-row__price-main">{price.main}</span>
          {price.sub ? <span className="market-row__price-sub">{price.sub}</span> : null}
          {l.endsAt ? (
            <span className="market-row__price-sub">만료 {formatListingEnds(l.endsAt)}</span>
          ) : null}
        </div>

        <div className="market-row__action">
          {l.saleType === "FIXED" ? (
            <div className="market-row__buy">
              {l.fixedPriceTotal == null && !isEquipment ? (
                <input
                  type="number"
                  className="market-input market-input--qty"
                  min={1}
                  max={l.quantity}
                  value={buyQtyByListingId[l.id] ?? 1}
                  onChange={(e) => {
                    const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                    setBuyQtyByListingId((prev) => ({ ...prev, [l.id]: Math.min(v, l.quantity) }));
                  }}
                  title="구매 수량"
                />
              ) : null}
              <button
                type="button"
                className="market-btn market-btn--buy"
                disabled={!!busy || !userId || !!isMine}
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
            </div>
          ) : (
            <button
              type="button"
              className="market-btn market-btn--bid"
              disabled={!!busy || !userId || !!isMine}
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
    );
  }

  function renderMyRow(l: MyListing) {
    const d = listingDisplayName({
      itemName: l.itemName,
      itemGrade: l.itemGrade,
      weapon: l.weapon,
      armor: l.armor,
    });
    const price = listingPriceLabel(l);
    const iconId = listingIconId({ itemId: l.itemId, weapon: l.weapon, armor: l.armor });
    const auctionLocked = l.saleType === "AUCTION" && (l.highestBid != null || l.highestBidderId != null);
    const expired = l.endsAt ? new Date(l.endsAt).getTime() <= Date.now() : false;

    return (
      <div key={l.id} className="market-row market-row--mine">
        <MarketListingEquipmentHover weapon={l.weapon} armor={l.armor}>
          <div className="market-row__item">
            <ItemIcon itemId={iconId} size={44} className="market-row__icon" />
            <div className="market-row__info">
              <div className="market-row__name-line">
                <span className={`market-row__name ${itemGradeNameClassName(d.grade)}`}>{d.name}</span>
                {d.enhance > 0 ? <span className="market-row__enh">+{d.enhance}</span> : null}
              </div>
              <div className="market-row__meta">
                <span className={`market-row__badge market-row__badge--${l.saleType === "FIXED" ? "fixed" : "auction"}`}>
                  {l.saleType === "FIXED" ? "고정가" : "경매"}
                </span>
                <span className="market-row__cat">{l.itemId}</span>
              </div>
            </div>
          </div>
        </MarketListingEquipmentHover>

        <div className="market-row__qty">
          <span className="market-row__col-label">수량</span>
          <span className="market-row__qty-val">{l.quantity.toLocaleString()}</span>
        </div>

        <div className="market-row__price">
          <span className="market-row__col-label">가격</span>
          <span className="market-row__price-main">{price.main}</span>
          {price.sub ? <span className="market-row__price-sub">{price.sub}</span> : null}
          {l.endsAt ? (
            <span className={`market-row__price-sub ${expired ? "text-amber-300" : ""}`}>
              {expired ? "만료됨 · " : "만료 "}
              {formatListingEnds(l.endsAt)}
            </span>
          ) : null}
        </div>

        <div className="market-row__action market-row__action--multi">
          <button
            type="button"
            className="market-btn market-btn--ghost"
            disabled={!!busy || auctionLocked}
            onClick={() => openEditListing(l)}
            title={auctionLocked ? "입찰 후 수정 불가" : "가격 수정"}
          >
            수정
          </button>
          {l.saleType === "AUCTION" || (l.saleType === "FIXED" && expired) ? (
            <button type="button" className="market-btn market-btn--ghost" disabled={!!busy} onClick={() => void settleMine(l.id)}>
              {l.saleType === "FIXED" ? "회수" : "정산"}
            </button>
          ) : null}
          <button type="button" className="market-btn market-btn--cancel" disabled={!!busy} onClick={() => void cancelMine(l.id)}>
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <GamePanel className={`market-board ${embedded ? "market-board--fit" : ""}`}>
      <div className="market-board__header">
        {!embedded ? (
          <div>
            <p className="game-label">거래소</p>
            <h2 className="market-board__title">메르카투스 거래소</h2>
            <p className="mt-1 text-xs text-[var(--game-muted)]">매물 등록 최대 20건 · 판매 기간 48시간 · 수수료 5%</p>
          </div>
        ) : null}
        {saleNotice ? (
          <p className="mt-2 w-full rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100 md:col-span-2">
            {saleNotice}
          </p>
        ) : null}
        <div className="market-board__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "MARKET"}
            className={`market-board__tab ${tab === "MARKET" ? "market-board__tab--active" : ""}`}
            onClick={() => setTab("MARKET")}
          >
            구매
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "SELL"}
            className={`market-board__tab ${tab === "SELL" ? "market-board__tab--active" : ""}`}
            onClick={() => setTab("SELL")}
          >
            판매
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "MINE"}
            className={`market-board__tab ${tab === "MINE" ? "market-board__tab--active" : ""}`}
            onClick={() => setTab("MINE")}
          >
            내 판매
            {myListings.length > 0 ? (
              <span className="market-board__tab-count">
                {myListings.length}/20
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {error ? (
        <div className="market-alert market-alert--error">{formatPanelError(error)}</div>
      ) : null}

      <div className="market-board__layout">
        {tab === "MARKET" || tab === "SELL" ? (
          <aside className="market-board__sidebar" aria-label="카테고리">
            <p className="market-sidebar__title">{tab === "SELL" ? "보유 분류" : "카테고리"}</p>
            <div className="market-sidebar__list">
              {activeCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`market-sidebar__item ${categoryFilter === cat ? "market-sidebar__item--active" : ""}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </aside>
        ) : (
          <aside className="market-board__sidebar market-board__sidebar--hint">
            <p className="market-sidebar__title">내 판매</p>
            <p className="market-sidebar__hint">등록한 매물의 가격 수정·정산·취소를 할 수 있어요. 매물은 48시간 후 만료됩니다.</p>
          </aside>
        )}

        <div className="market-board__main">
          <div className="market-toolbar">
            <div className="market-toolbar__search">
              <input
                className="market-input market-input--search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  tab === "MARKET" ? "아이템 이름 검색…" : tab === "SELL" ? "보유 아이템 검색…" : "내 매물은 아래 목록에서 확인"
                }
                disabled={tab === "MINE"}
              />
            </div>
            {tab === "MARKET" ? (
              <>
                <select className="market-input market-input--select" value={saleType} onChange={(e) => setSaleType(e.target.value as "" | "FIXED" | "AUCTION")}>
                  <option value="">전체 거래</option>
                  <option value="FIXED">고정가</option>
                  <option value="AUCTION">경매</option>
                </select>
                <select className="market-input market-input--select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="NEWEST">최신순</option>
                  <option value="PRICE_ASC">가격 낮은순</option>
                  <option value="ENDS_SOON">마감 임박</option>
                </select>
                <div className="market-toolbar__bid">
                  <label className="market-toolbar__bid-label">입찰액</label>
                  <input
                    type="number"
                    className="market-input market-input--bid"
                    value={bidAmount}
                    min={1}
                    onChange={(e) => setBidAmount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  />
                </div>
              </>
            ) : null}
            <GameBtn variant="ghost" disabled={!!busy} onClick={() => void refresh()}>
              {busy ? "…" : "새로고침"}
            </GameBtn>
          </div>

          <div className="market-table-head" aria-hidden>
            <span className="market-table-head__item">아이템</span>
            <span className="market-table-head__qty">수량</span>
            <span className="market-table-head__price">가격</span>
            <span className="market-table-head__action">{tab === "MARKET" ? "구매" : tab === "SELL" ? "판매" : "관리"}</span>
          </div>

          <div className="market-list">
            {tab === "MARKET" ? (
              filteredListings.length === 0 ? (
                <div className="market-empty">등록된 매물이 없습니다.</div>
              ) : (
                filteredListings.map((l) => renderMarketRow(l))
              )
            ) : tab === "SELL" ? (
              <MarketSellTab
                userId={userId}
                busy={busy}
                setBusy={setBusy}
                onError={setError}
                onListed={(message) => {
                  if (message) setSaleNotice(message);
                  setTab("MINE");
                  void refresh();
                }}
                onInventoryLoaded={onSellInventoryLoaded}
                searchQuery={q}
                categoryFilter={categoryFilter}
              />
            ) : myListings.length === 0 ? (
              <div className="market-empty">판매 중인 매물이 없습니다. 판매 탭에서 등록해 보세요.</div>
            ) : (
              myListings.map((l) => renderMyRow(l))
            )}
          </div>

          <div className="market-board__footer">
            <span>
              {tab === "MARKET" ? `${filteredListings.length}건` : tab === "SELL" ? "보유 목록" : `${myListings.length}건`}
              {(tab === "MARKET" || tab === "SELL") && categoryFilter !== CATEGORY_ALL ? ` · ${categoryFilter}` : ""}
            </span>
            {userId ? null : <span className="market-board__session market-board__session--warn">로그인 필요</span>}
          </div>
        </div>
      </div>

      {statsItemId ? (
        <div className="market-stats-panel">
          <div className="market-stats-panel__head">
            <div>
              <p className="game-label">시세</p>
              <h3 className="market-stats-panel__title">
                <span className={itemGradeNameClassName(stats?.item?.grade ?? 1)}>{stats?.item?.name ?? statsItemId}</span>
              </h3>
            </div>
            <div className="flex gap-2">
              <GameBtn variant="ghost" disabled={statsBusy} onClick={() => void openStats(statsItemId)}>
                새로고침
              </GameBtn>
              <GameBtn variant="ghost" onClick={closeStatsPanel}>
                닫기
              </GameBtn>
            </div>
          </div>
          <div className="market-stats-panel__grid">
            <div className="market-stats-summary">
              <div className="market-stats-summary__cell">
                <span className="market-stats-summary__label">최근 거래</span>
                <span className="market-stats-summary__val">{stats?.summary.trades ?? (statsBusy ? "…" : 0)}</span>
              </div>
              <div className="market-stats-summary__cell">
                <span className="market-stats-summary__label">거래량</span>
                <span className="market-stats-summary__val">{stats?.summary.volume ?? (statsBusy ? "…" : 0)}</span>
              </div>
              <div className="market-stats-summary__cell">
                <span className="market-stats-summary__label">최근 단가</span>
                <span className="market-stats-summary__val market-stats-summary__val--gold">
                  {statsBusy ? "…" : stats?.summary.lastUnitPrice != null ? `${fmtGold(Math.round(stats.summary.lastUnitPrice))} G` : "—"}
                </span>
              </div>
              <div className="market-stats-summary__cell">
                <span className="market-stats-summary__label">평균 단가</span>
                <span className="market-stats-summary__val market-stats-summary__val--gold">
                  {statsBusy ? "…" : stats?.summary.avgUnitPrice != null ? `${fmtGold(Math.round(stats.summary.avgUnitPrice))} G` : "—"}
                </span>
              </div>
            </div>
            <div className="market-stats-trades">
              <p className="market-stats-trades__title">최근 거래 내역</p>
              <div className="market-stats-trades__list">
                {statsBusy ? (
                  <p className="market-empty">불러오는 중…</p>
                ) : !stats?.trades?.length ? (
                  <p className="market-empty">거래 기록 없음</p>
                ) : (
                  stats.trades.map((t) => (
                    <div key={t.transactionId} className="market-stats-trade">
                      <span className="market-stats-trade__time">{new Date(t.createdAt).toLocaleString()}</span>
                      <span className="market-stats-trade__price">{fmtGold(Math.round(t.unitPrice))} G/개</span>
                      <span className="market-stats-trade__qty">×{t.quantity}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen && editListing ? (
        <div className="market-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeEditModal()}>
          <div className="market-modal" role="dialog" aria-modal="true">
            <div className="market-modal__head">
              <h3 className="market-modal__title">매물 가격 수정</h3>
              <button type="button" className="market-btn market-btn--ghost" onClick={closeEditModal}>
                닫기
              </button>
            </div>
            <p className="market-modal__item">
              {editListing.weapon || editListing.armor ? (
                <>
                  <span
                    className={itemGradeNameClassName(
                      (editListing.weapon ?? editListing.armor)!.grade ?? editListing.itemGrade ?? 1,
                    )}
                  >
                    {(editListing.weapon ?? editListing.armor)!.name}
                  </span>
                  {(editListing.weapon ?? editListing.armor)!.enhanceLevel > 0
                    ? ` +${(editListing.weapon ?? editListing.armor)!.enhanceLevel}`
                    : ""}
                </>
              ) : (
                <span className={itemGradeNameClassName(editListing.itemGrade ?? 1)}>{editListing.itemName}</span>
              )}
            </p>
            <div className="market-modal__form">
              {editListing.saleType === "FIXED" ? (
                <>
                  <label className="market-modal__label">
                    가격 유형
                    <select className="market-input" value={editFixedMode} onChange={(e) => setEditFixedMode(e.target.value as "UNIT" | "TOTAL")}>
                      <option value="UNIT">단가 (부분 구매)</option>
                      <option value="TOTAL">총액 (일괄)</option>
                    </select>
                  </label>
                  {editFixedMode === "UNIT" ? (
                    <label className="market-modal__label">
                      단가 (G)
                      <input
                        type="number"
                        className="market-input"
                        min={1}
                        value={editFixedUnit}
                        onChange={(e) => setEditFixedUnit(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                      />
                    </label>
                  ) : (
                    <label className="market-modal__label">
                      총액 (G)
                      <input
                        type="number"
                        className="market-input"
                        min={1}
                        value={editFixedTotal}
                        onChange={(e) => setEditFixedTotal(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                      />
                    </label>
                  )}
                </>
              ) : (
                <label className="market-modal__label">
                  시작가 (G)
                  <input
                    type="number"
                    className="market-input"
                    min={1}
                    value={editStartPrice}
                    onChange={(e) => setEditStartPrice(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  />
                </label>
              )}
            </div>
            <div className="market-modal__actions">
              <GameBtn variant="ghost" onClick={closeEditModal}>
                취소
              </GameBtn>
              <GameBtn variant="gold" disabled={!!busy} onClick={() => void submitEdit()}>
                저장
              </GameBtn>
            </div>
          </div>
        </div>
      ) : null}
    </GamePanel>
  );
}
