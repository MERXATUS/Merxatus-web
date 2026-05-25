"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn, GamePanel, GamePanelTitle } from "@/app/_components/gameUi";
import { GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { apiGetJson, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
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
    if (code === "INFAMY_TOO_HIGH_FOR_ROYAL") return "악명이 높아 황실을 이용할 수 없어요.";
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

const ROYAL_TRADE_QTY_MAX = 1_000;

type RoyalRow = {
  itemId: string;
  name: string;
  category: string;
  grade: number;
  buyPricePerUnit: number;
  sellPricePerUnit: number;
  ownedQty: number;
  icon?: string | null;
  iconSrc?: string;
};

type RoyalPrices = {
  ok: true;
  honorPoints: number;
  honorTitle: string | null;
  locked: boolean;
  lockedReason: "INFAMY_TOO_HIGH_FOR_ROYAL" | null;
  goldAvailable: number;
  items: RoyalRow[];
};

function clampQty(n: number) {
  return Math.min(ROYAL_TRADE_QTY_MAX, Math.max(1, Math.floor(n)));
}

function maxBuyQty(gold: number, buyPricePerUnit: number) {
  if (buyPricePerUnit <= 0) return 1;
  return clampQty(Math.floor(gold / buyPricePerUnit));
}

function maxSellQty(owned: number) {
  if (owned <= 0) return 0;
  return clampQty(owned);
}

function fmtGold(n: number) {
  return n.toLocaleString();
}

type RoyalItemRowProps = {
  row: RoyalRow;
  gold: number;
  locked: boolean;
  busy: boolean;
  qty: number;
  onQtyChange: (itemId: string, qty: number) => void;
  onTrade: (side: "buy" | "sell", itemId: string, quantity: number) => Promise<void>;
};

function RoyalItemRow({ row, gold, locked, busy, qty, onQtyChange, onTrade }: RoyalItemRowProps) {
  const owned = Math.max(0, row.ownedQty ?? 0);
  const buyMax = maxBuyQty(gold, row.buyPricePerUnit);
  const sellMax = maxSellQty(owned);
  const buyQty = Math.min(qty, buyMax);
  const sellQty = sellMax > 0 ? Math.min(qty, sellMax) : 0;
  const buyTotal = buyQty * row.buyPricePerUnit;
  const sellTotal = sellQty * row.sellPricePerUnit;

  function step(delta: number) {
    onQtyChange(row.itemId, clampQty(qty + delta));
  }

  return (
    <article className="royal-row">
      <div className="royal-row__item">
        <ItemIcon itemId={row.itemId} icon={row.icon} iconSrc={row.iconSrc} size={44} className="royal-row__icon" />
        <div className="royal-row__meta">
          <div className="royal-row__name-line">
            <span className={`royal-row__name ${itemGradeNameClassName(row.grade)}`}>{row.name}</span>
            <span className="royal-row__grade">{itemGradeLabel(row.grade)}</span>
          </div>
          <span className="royal-row__owned">보유 {fmtGold(owned)}</span>
        </div>
      </div>

      <div className="royal-row__price royal-row__price--sell">
        <span className="royal-row__price-label">판매</span>
        <span className="royal-row__price-val">{fmtGold(row.sellPricePerUnit)}G</span>
      </div>

      <div className="royal-row__price royal-row__price--buy">
        <span className="royal-row__price-label">구매</span>
        <span className="royal-row__price-val">{fmtGold(row.buyPricePerUnit)}G</span>
      </div>

      <div className="royal-row__qty">
        <span className="royal-row__price-label royal-row__price-label--mobile">수량</span>
        <div className="royal-qty">
          <button type="button" className="royal-qty__btn" disabled={busy || locked || qty <= 1} onClick={() => step(-1)} aria-label="수량 감소">
            −
          </button>
          <input
            className="royal-qty__input"
            inputMode="numeric"
            value={String(qty)}
            disabled={busy || locked}
            onChange={(e) => onQtyChange(row.itemId, clampQty(Number(e.target.value || 1)))}
          />
          <button type="button" className="royal-qty__btn" disabled={busy || locked || qty >= ROYAL_TRADE_QTY_MAX} onClick={() => step(1)} aria-label="수량 증가">
            +
          </button>
        </div>
      </div>

      <div className="royal-row__actions">
        <div className="royal-trade royal-trade--sell">
          <button
            type="button"
            className="royal-trade__max"
            disabled={busy || locked || sellMax < 1}
            onClick={() => onQtyChange(row.itemId, sellMax)}
            title={`보유 전부 (${fmtGold(sellMax)}개)`}
          >
            전부
          </button>
          <GameBtn
            variant="gold"
            className="royal-trade__btn"
            disabled={busy || locked || sellMax < 1}
            onClick={() => void onTrade("sell", row.itemId, sellQty)}
          >
            판매
          </GameBtn>
          <span className="royal-trade__hint">{sellMax > 0 ? `+${fmtGold(sellTotal)}G` : "—"}</span>
        </div>
        <div className="royal-trade royal-trade--buy">
          <button
            type="button"
            className="royal-trade__max"
            disabled={busy || locked || buyMax < 1}
            onClick={() => onQtyChange(row.itemId, buyMax)}
            title={`골드 한도 (${fmtGold(buyMax)}개)`}
          >
            전부
          </button>
          <GameBtn
            variant="ghost"
            className="royal-trade__btn"
            disabled={busy || locked || buyMax < 1}
            onClick={() => void onTrade("buy", row.itemId, buyQty)}
          >
            구매
          </GameBtn>
          <span className="royal-trade__hint">{buyMax > 0 ? `−${fmtGold(buyTotal)}G` : "—"}</span>
        </div>
      </div>
    </article>
  );
}

export function RoyalPanel() {
  const { user, loading: sessionLoading } = useSessionUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [royal, setRoyal] = useState<RoyalPrices | null>(null);
  const [qtyByItemId, setQtyByItemId] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!user) {
      setRoyal(null);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await getJson<RoyalPrices>("/api/royal/prices");
      setRoyal(r);
    } catch (e) {
      setRoyal(null);
      if (!isUnauthorizedError(e)) setError(e);
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    if (sessionLoading) return;
    void refresh();
  }, [refresh, sessionLoading]);

  const honorSubtitle = useMemo(() => {
    const honor = royal?.honorPoints?.toLocaleString?.() ?? "—";
    const title = royal?.honorTitle ? ` · ${royal.honorTitle}` : "";
    return `명예 ${honor}${title}`;
  }, [royal?.honorPoints, royal?.honorTitle]);

  function qtyFor(itemId: string) {
    const q = qtyByItemId[itemId];
    return typeof q === "number" && Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
  }

  async function handleTrade(side: "buy" | "sell", itemId: string, quantity: number) {
    setBusy(true);
    setError(null);
    try {
      await postJson(side === "buy" ? "/api/royal/buy" : "/api/royal/sell", { itemId, quantity });
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const items = royal?.items ?? [];

  return (
    <GamePanel className="royal-panel">
      <header className="royal-header">
        <div className="royal-header__main">
          <GamePanelTitle hint="재료 매입·매각 · 거래 시 명예">황실</GamePanelTitle>
          <p className="royal-header__sub">{honorSubtitle}</p>
        </div>
        <div className="royal-header__stats">
          <div className="royal-stat">
            <span className="royal-stat__label">보유 골드</span>
            <span className="royal-stat__val">{fmtGold(royal?.goldAvailable ?? 0)}G</span>
          </div>
          <GameBtn variant="ghost" disabled={busy} onClick={() => void refresh()}>
            {busy ? "…" : "새로고침"}
          </GameBtn>
        </div>
      </header>

      {error ? <div className="royal-alert royal-alert--error">오류: {formatErr(error)}</div> : null}

      {sessionLoading ? <GamePanelLoading label="세션 확인 중…" /> : null}

      {!sessionLoading && !user ? (
        <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
      ) : null}

      {!sessionLoading && user && royal?.locked ? (
        <div className="royal-alert royal-alert--warn">악명이 높아 황실 거래(구매·판매)가 잠겨 있어요.</div>
      ) : null}

      {!sessionLoading && user && items.length === 0 ? (
        <p className="royal-empty">황실 가격표가 비어 있어요. 시드 또는 관리자 apply를 실행하세요.</p>
      ) : null}

      {!sessionLoading && user && items.length > 0 ? (
        <div className="royal-list">
          <div className="royal-list__head" aria-hidden>
            <span>아이템</span>
            <span>판매가</span>
            <span>구매가</span>
            <span>수량</span>
            <span>거래</span>
          </div>
          {items.map((row) => (
            <RoyalItemRow
              key={row.itemId}
              row={row}
              gold={royal?.goldAvailable ?? 0}
              locked={!!royal?.locked}
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
