"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn, GamePanel, GamePanelTitle } from "@/app/_components/gameUi";
import { GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { apiGetJson, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";
import { itemGradeLabel, itemGradeNameClassName } from "@/server/itemGrade";

async function getJson<T>(url: string): Promise<T> {
  return apiGetJson<T>(url);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiPostJson<T>(url, body);
}

function formatErr(e: unknown) {
  if (!e) return "오류";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e && "error" in e && typeof (e as { error: string }).error === "string") {
    const code = (e as { error: string }).error;
    if (code === "HONOR_TOO_HIGH_FOR_BLACKMARKET") return "명예가 높아 암시장을 이용할 수 없어요.";
    if (code === "INSUFFICIENT_ITEMS") return "보유 수량이 부족해요.";
    if (code === "INSUFFICIENT_GOLD") return "골드가 부족해요.";
    if (code === "BAD_REQUEST") return "요청 수량이 올바르지 않아요. (1~1,000, 보유·골드 범위 내)";
    if (code === "UNAUTHORIZED") return "로그인이 필요합니다.";
    return code;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

const BLACK_TRADE_QTY_MAX = 1_000;

type BlackRow = {
  itemId: string;
  name: string;
  category: string;
  grade: number;
  pricePerUnit: number;
  eventApplied: boolean;
  ownedQty: number;
  priceDeltaPct: number | null;
  priceDeltaDir: "up" | "down" | "flat";
  icon?: string | null;
  iconSrc?: string;
};

type BlackPrices = {
  ok: true;
  honorPoints: number;
  locked: boolean;
  lockedReason: "HONOR_TOO_HIGH_FOR_BLACKMARKET" | null;
  infamyPoints: number;
  maxGrade: number;
  event: { kind: "BOOM" | "CRASH"; multiplier: number; startsAt: string; endsAt: string } | null;
  goldAvailable: number;
  items: BlackRow[];
};

function clampQty(n: number) {
  return Math.min(BLACK_TRADE_QTY_MAX, Math.max(1, Math.floor(n)));
}

function maxBuyQty(gold: number, pricePerUnit: number) {
  if (pricePerUnit <= 0) return 1;
  return clampQty(Math.floor(gold / pricePerUnit));
}

function maxSellQty(owned: number) {
  if (owned <= 0) return 0;
  return clampQty(owned);
}

function fmtGold(n: number) {
  return n.toLocaleString();
}

function PriceDeltaBadge({ dir, pct }: { dir: BlackRow["priceDeltaDir"]; pct: number | null }) {
  if (pct == null) return null;
  if (dir === "up") {
    return (
      <span className="black-delta black-delta--up">
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
          <path d="M6 2 L10 8 H2 Z" fill="currentColor" />
        </svg>
        +{Math.abs(pct)}%
      </span>
    );
  }
  if (dir === "down") {
    return (
      <span className="black-delta black-delta--down">
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
          <path d="M6 10 L10 4 H2 Z" fill="currentColor" />
        </svg>
        −{Math.abs(pct)}%
      </span>
    );
  }
  return <span className="black-delta black-delta--flat">±0%</span>;
}

type BlackItemRowProps = {
  row: BlackRow;
  gold: number;
  locked: boolean;
  busy: boolean;
  qty: number;
  onQtyChange: (itemId: string, qty: number) => void;
  onTrade: (side: "buy" | "sell", itemId: string, quantity: number) => Promise<void>;
};

function BlackItemRow({ row, gold, locked, busy, qty, onQtyChange, onTrade }: BlackItemRowProps) {
  const owned = Math.max(0, row.ownedQty ?? 0);
  const buyMax = maxBuyQty(gold, row.pricePerUnit);
  const sellMax = maxSellQty(owned);
  const buyQty = Math.min(qty, buyMax);
  const sellQty = sellMax > 0 ? Math.min(qty, sellMax) : 0;
  const buyTotal = buyQty * row.pricePerUnit;
  const sellTotal = sellQty * row.pricePerUnit;

  function step(delta: number) {
    onQtyChange(row.itemId, clampQty(qty + delta));
  }

  return (
    <article className="black-row">
      <div className="black-row__item">
        <ItemIcon itemId={row.itemId} icon={row.icon} iconSrc={row.iconSrc} size={44} className="black-row__icon" />
        <div className="black-row__meta">
          <div className="black-row__name-line">
            <span className={`black-row__name ${itemGradeNameClassName(row.grade)}`}>{row.name}</span>
            <span className="black-row__grade">{itemGradeLabel(row.grade)}</span>
            {row.eventApplied ? <span className="black-row__event">이벤트</span> : null}
          </div>
          <span className="black-row__owned">보유 {fmtGold(owned)}</span>
        </div>
      </div>

      <div className="black-row__price">
        <span className="black-row__price-label">시세</span>
        <span className="black-row__price-val">{fmtGold(row.pricePerUnit)}G</span>
        <PriceDeltaBadge dir={row.priceDeltaDir} pct={row.priceDeltaPct} />
      </div>

      <div className="black-row__qty">
        <span className="black-row__price-label black-row__price-label--mobile">수량</span>
        <div className="black-qty">
          <button type="button" className="black-qty__btn" disabled={busy || locked || qty <= 1} onClick={() => step(-1)} aria-label="수량 감소">
            −
          </button>
          <input
            className="black-qty__input"
            inputMode="numeric"
            value={String(qty)}
            disabled={busy || locked}
            onChange={(e) => onQtyChange(row.itemId, clampQty(Number(e.target.value || 1)))}
          />
          <button type="button" className="black-qty__btn" disabled={busy || locked || qty >= BLACK_TRADE_QTY_MAX} onClick={() => step(1)} aria-label="수량 증가">
            +
          </button>
        </div>
      </div>

      <div className="black-row__actions">
        <div className="black-trade black-trade--sell">
          <button
            type="button"
            className="black-trade__max"
            disabled={busy || locked || sellMax < 1}
            onClick={() => onQtyChange(row.itemId, sellMax)}
            title={`보유 전부 (${fmtGold(sellMax)}개)`}
          >
            전부
          </button>
          <button
            type="button"
            className="black-trade__btn black-trade__btn--sell"
            disabled={busy || locked || sellMax < 1}
            onClick={() => void onTrade("sell", row.itemId, sellQty)}
          >
            판매
          </button>
          <span className="black-trade__hint">{sellMax > 0 ? `+${fmtGold(sellTotal)}G` : "—"}</span>
        </div>
        <div className="black-trade black-trade--buy">
          <button
            type="button"
            className="black-trade__max"
            disabled={busy || locked || buyMax < 1}
            onClick={() => onQtyChange(row.itemId, buyMax)}
            title={`골드 한도 (${fmtGold(buyMax)}개)`}
          >
            전부
          </button>
          <GameBtn variant="ghost" className="black-trade__btn" disabled={busy || locked || buyMax < 1} onClick={() => void onTrade("buy", row.itemId, buyQty)}>
            구매
          </GameBtn>
          <span className="black-trade__hint">{buyMax > 0 ? `−${fmtGold(buyTotal)}G` : "—"}</span>
        </div>
      </div>
    </article>
  );
}

export function BlackMarketPanel({ embedded = false }: EmbeddedPanelProps = {}) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [black, setBlack] = useState<BlackPrices | null>(null);
  const [qtyByItemId, setQtyByItemId] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!user) {
      setBlack(null);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await getJson<BlackPrices>("/api/blackmarket/prices");
      setBlack(r);
    } catch (e) {
      setBlack(null);
      if (!isUnauthorizedError(e)) setError(e);
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    if (sessionLoading) return;
    void refresh();
  }, [refresh, sessionLoading]);

  useEffect(() => {
    if (!embedded) return;
    const onFrameRefresh = () => void refresh();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
  }, [embedded, refresh]);

  useEffect(() => {
    if (sessionLoading || !user) return;
    const t = setInterval(() => void refresh(), 45_000);
    return () => clearInterval(t);
  }, [refresh, sessionLoading, user]);

  const infamySubtitle = useMemo(() => {
    return `악명 ${black?.infamyPoints?.toLocaleString?.() ?? "—"} · 거래 등급 ≤ ${black?.maxGrade ?? "—"}`;
  }, [black?.infamyPoints, black?.maxGrade]);

  const eventLabel = useMemo(() => {
    const ev = black?.event;
    if (!ev) return null;
    return ev.kind === "BOOM" ? `폭등 ×${ev.multiplier}` : `폭락 ×${ev.multiplier}`;
  }, [black?.event]);

  function qtyFor(itemId: string) {
    const q = qtyByItemId[itemId];
    return typeof q === "number" && Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
  }

  async function handleTrade(side: "buy" | "sell", itemId: string, quantity: number) {
    setBusy(true);
    setError(null);
    try {
      await postJson(side === "buy" ? "/api/blackmarket/buy" : "/api/blackmarket/sell", { itemId, quantity });
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const items = black?.items ?? [];

  return (
    <GamePanel className={`black-panel ${embedded ? "black-panel--fit panel-fit" : ""}`}>
      {!embedded ? (
        <header className="black-header">
          <div className="black-header__main">
            <GamePanelTitle hint="황실 중가 기준 · 5분마다 ±10% 변동">지하도시(암시장)</GamePanelTitle>
            <p className="black-header__sub">{infamySubtitle}</p>
            <p className="black-header__note">직전 5분 슬롯 대비 등락률(▲상승 ▼하락) · 거래 시 악명</p>
          </div>
          <div className="black-header__stats">
            {eventLabel ? (
              <div className="black-stat black-stat--event">
                <span className="black-stat__label">이벤트</span>
                <span className="black-stat__val">{eventLabel}</span>
              </div>
            ) : null}
            <div className="black-stat">
              <span className="black-stat__label">보유 골드</span>
              <span className="black-stat__val">{fmtGold(black?.goldAvailable ?? 0)}G</span>
            </div>
            <GameBtn variant="ghost" disabled={busy} onClick={() => void refresh()}>
              {busy ? "…" : "새로고침"}
            </GameBtn>
          </div>
        </header>
      ) : (
        <div className="mb-1">
          <p className="black-header__sub text-[10px]">{infamySubtitle}</p>
          {eventLabel ? <p className="black-header__note mt-0.5 text-[10px]">이벤트 · {eventLabel}</p> : null}
        </div>
      )}

      {error ? <div className="black-alert black-alert--error">오류: {formatErr(error)}</div> : null}

      {!embedded && sessionLoading ? <GamePanelLoading label="세션 확인 중…" /> : null}

      {!embedded && !sessionLoading && !user ? (
        <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
      ) : null}

      {(embedded || !sessionLoading) && user && black?.locked ? (
        <div className="black-alert black-alert--warn">명예가 높아 암시장 거래(구매·판매)가 잠겨 있어요.</div>
      ) : null}

      {(embedded || !sessionLoading) && user && items.length === 0 ? (
        <p className="black-empty">거래 가능한 아이템이 없어요.</p>
      ) : null}

      {(embedded || !sessionLoading) && user && items.length > 0 ? (
        <div className={embedded ? "panel-scroll-region black-list" : "black-list"}>
          <div className="black-list__head" aria-hidden>
            <span>아이템</span>
            <span>시세</span>
            <span>수량</span>
            <span>거래</span>
          </div>
          {items.map((row) => (
            <BlackItemRow
              key={row.itemId}
              row={row}
              gold={black?.goldAvailable ?? 0}
              locked={!!black?.locked}
              busy={busy}
              qty={qtyFor(row.itemId)}
              onQtyChange={(itemId, next) => setQtyByItemId((prev) => ({ ...prev, [itemId]: next }))}
              onTrade={handleTrade}
            />
          ))}
        </div>
      ) : null}
    </GamePanel>
  );
}
