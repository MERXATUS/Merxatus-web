"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn } from "@/app/_components/gameUi";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { itemIconSrc } from "@/shared/itemIcon";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { formatPanelError } from "@/shared/formatPanelError";
import { API_CACHE_TTL } from "@/shared/apiCache";
import { apiGetJson, apiGetJsonCached, apiPostJson } from "@/shared/sessionClient";
import { MarketListingEquipmentHover } from "@/app/_components/MarketListingEquipmentHover";
import type { MarketListingEquipmentView } from "@/app/_components/MarketListingEquipmentHover";

export type SellInventoryRow = {
  itemId: string;
  name: string;
  category: string;
  quantity: number;
  grade?: number;
  icon?: string | null;
  iconSrc?: string;
};

export type SellWeaponRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  grade?: number;
  gradeLabel?: string;
  identified?: boolean;
  options?: MarketListingEquipmentView["options"];
  userLocked?: boolean;
  equippedByMinion?: { minionId: string; displayName: string } | null;
  icon?: string | null;
  iconSrc?: string;
};

export type SellArmorRow = SellWeaponRow;

type MeState = {
  ok: true;
  inventory?: SellInventoryRow[];
  weaponInstances?: SellWeaponRow[];
  market?: {
    maxActiveListings: number;
    listingDurationHours: number;
    activeListingCount: number;
  };
};

type MarketStatsSuggest = {
  ok: true;
  summary: {
    lastUnitPrice: number | null;
    avgUnitPrice: number | null;
    referenceGoldPerUnit?: number;
  };
};

async function loadSellMeState() {
  const [inv, weapons, armors, marketR] = await Promise.all([
    apiGetJsonCached<MeState>("/api/me/state?scope=inventory", { ttlMs: API_CACHE_TTL.meStateInventory }),
    apiGetJsonCached<{ ok: true; weaponInstances?: SellWeaponRow[] }>("/api/me/state?scope=weapons", {
      ttlMs: API_CACHE_TTL.meStateWeapons,
    }),
    apiGetJsonCached<{ ok: true; armorInstances?: SellArmorRow[] }>("/api/me/state?scope=armor", {
      ttlMs: API_CACHE_TTL.meStateArmor,
    }),
    apiGetJsonCached<MeState>("/api/me/state?scope=market", { ttlMs: API_CACHE_TTL.meStateMarket }),
  ]);
  const sellable = <T extends SellWeaponRow>(rows: T[] | undefined) =>
    (rows ?? []).filter((r) => !r.userLocked && !r.equippedByMinion);
  return {
    ok: true as const,
    inventory: inv.inventory,
    weaponInstances: sellable(weapons.weaponInstances),
    armorInstances: sellable(armors.armorInstances),
    market: marketR.market,
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiPostJson<T>(url, body);
}

function fmtGold(n: number) {
  return n.toLocaleString();
}

function iconProps(row: Pick<SellInventoryRow, "itemId" | "icon" | "iconSrc">) {
  const itemId = row.itemId;
  const icon = row.icon ?? null;
  return { itemId, icon, iconSrc: row.iconSrc ?? itemIconSrc({ itemId, icon }) };
}

const CATEGORY_ALL = "전체";
const WEAPON_CATEGORY = "무기";
const ARMOR_CATEGORY = "방어구";

function sellEquipView(row: SellWeaponRow): MarketListingEquipmentView {
  return {
    id: row.id,
    baseItemId: row.baseItemId,
    name: row.name,
    enhanceLevel: row.enhanceLevel,
    grade: row.grade ?? 1,
    gradeLabel: row.gradeLabel ?? "",
    identified: row.identified ?? true,
    options: row.options,
  };
}

type Props = {
  userId: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onError: (e: unknown) => void;
  onListed: (message?: string) => void;
  onInventoryLoaded?: (inventory: SellInventoryRow[], weapons: SellWeaponRow[], armors: SellArmorRow[]) => void;
  searchQuery: string;
  categoryFilter: string;
};

export function MarketSellTab({ userId, busy, setBusy, onError, onListed, onInventoryLoaded, searchQuery, categoryFilter }: Props) {
  const [inventory, setInventory] = useState<SellInventoryRow[]>([]);
  const [weapons, setWeapons] = useState<SellWeaponRow[]>([]);
  const [armors, setArmors] = useState<SellArmorRow[]>([]);
  const [activeListingCount, setActiveListingCount] = useState(0);
  const [maxActiveListings, setMaxActiveListings] = useState(20);
  const [loadBusy, setLoadBusy] = useState(false);
  const [listNotice, setListNotice] = useState<string | null>(null);

  const [sellOpen, setSellOpen] = useState(false);
  const [sellItem, setSellItem] = useState<SellInventoryRow | null>(null);
  const [sellWeapon, setSellWeapon] = useState<SellWeaponRow | null>(null);
  const [sellArmor, setSellArmor] = useState<SellArmorRow | null>(null);
  const [sellQty, setSellQty] = useState(1);
  const [sellType, setSellType] = useState<"FIXED" | "AUCTION">("FIXED");
  const [sellPriceMode, setSellPriceMode] = useState<"UNIT" | "TOTAL">("UNIT");
  const [sellUnitPrice, setSellUnitPrice] = useState(10);
  const [sellTotalPrice, setSellTotalPrice] = useState(10);
  const [sellStartPrice, setSellStartPrice] = useState(10);
  const [suggestedUnit, setSuggestedUnit] = useState<number | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);

  const closeSellModal = useCallback(() => {
    setSellOpen(false);
    setSellItem(null);
    setSellWeapon(null);
    setSellArmor(null);
  }, []);
  useEscapeClose(sellOpen && !!(sellItem || sellWeapon || sellArmor), closeSellModal);

  const load = useCallback(async () => {
    setLoadBusy(true);
    onError(null);
    try {
      const r = await loadSellMeState();
      const inv = r.inventory ?? [];
      const w = r.weaponInstances ?? [];
      const a = r.armorInstances ?? [];
      setInventory(inv);
      setWeapons(w);
      setArmors(a);
      setActiveListingCount(r.market?.activeListingCount ?? 0);
      setMaxActiveListings(r.market?.maxActiveListings ?? 20);
      onInventoryLoaded?.(inv, w, a);
    } catch (e) {
      onError(e);
    } finally {
      setLoadBusy(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredInventory = useMemo(() => {
    const qq = searchQuery.trim().toLowerCase();
    return inventory.filter((it) => {
      if (categoryFilter !== CATEGORY_ALL && categoryFilter !== WEAPON_CATEGORY && categoryFilter !== ARMOR_CATEGORY && it.category !== categoryFilter) {
        return false;
      }
      if (categoryFilter === WEAPON_CATEGORY || categoryFilter === ARMOR_CATEGORY) return false;
      if (!qq) return true;
      return it.name.toLowerCase().includes(qq) || it.itemId.toLowerCase().includes(qq);
    });
  }, [inventory, searchQuery, categoryFilter]);

  const filteredWeapons = useMemo(() => {
    if (categoryFilter !== CATEGORY_ALL && categoryFilter !== WEAPON_CATEGORY) return [];
    const qq = searchQuery.trim().toLowerCase();
    return weapons.filter((w) => {
      if (!qq) return true;
      return w.name.toLowerCase().includes(qq) || w.baseItemId.toLowerCase().includes(qq);
    });
  }, [weapons, searchQuery, categoryFilter]);

  const filteredArmors = useMemo(() => {
    if (categoryFilter !== CATEGORY_ALL && categoryFilter !== ARMOR_CATEGORY) return [];
    const qq = searchQuery.trim().toLowerCase();
    return armors.filter((a) => {
      if (!qq) return true;
      return a.name.toLowerCase().includes(qq) || a.baseItemId.toLowerCase().includes(qq);
    });
  }, [armors, searchQuery, categoryFilter]);

  async function fetchSuggested(itemId: string) {
    setSuggestBusy(true);
    try {
      const r = await apiGetJson<MarketStatsSuggest>(`/api/market/stats?itemId=${encodeURIComponent(itemId)}&take=30`);
      const avg = typeof r?.summary?.avgUnitPrice === "number" ? r.summary.avgUnitPrice : null;
      const last = typeof r?.summary?.lastUnitPrice === "number" ? r.summary.lastUnitPrice : null;
      const ref = typeof r?.summary?.referenceGoldPerUnit === "number" ? r.summary.referenceGoldPerUnit : null;
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

  async function openSell(item: SellInventoryRow) {
    setSellItem(item);
    setSellWeapon(null);
    setSellArmor(null);
    setSellQty(1);
    setSellType("FIXED");
    setSellPriceMode("UNIT");
    setSuggestedUnit(null);
    const sug = await fetchSuggested(item.itemId);
    const unit = Math.max(1, sug ?? 10);
    setSellUnitPrice(unit);
    setSellTotalPrice(unit);
    setSellStartPrice(unit);
    setSellOpen(true);
  }

  async function openSellWeapon(w: SellWeaponRow) {
    setSellWeapon(w);
    setSellArmor(null);
    setSellItem(null);
    setSellQty(1);
    setSellType("FIXED");
    setSellPriceMode("UNIT");
    setSuggestedUnit(null);
    const sug = await fetchSuggested(w.baseItemId);
    const unit = Math.max(1, sug ?? 100);
    setSellUnitPrice(unit);
    setSellTotalPrice(unit);
    setSellStartPrice(unit);
    setSellOpen(true);
  }

  async function openSellArmor(a: SellArmorRow) {
    setSellArmor(a);
    setSellWeapon(null);
    setSellItem(null);
    setSellQty(1);
    setSellType("FIXED");
    setSellPriceMode("UNIT");
    setSuggestedUnit(null);
    const sug = await fetchSuggested(a.baseItemId);
    const unit = Math.max(1, sug ?? 100);
    setSellUnitPrice(unit);
    setSellTotalPrice(unit);
    setSellStartPrice(unit);
    setSellOpen(true);
  }

  async function submitSell() {
    const sellEquip = sellWeapon ?? sellArmor;
    if (!sellItem && !sellEquip) return;
    const isEquipment = !!sellEquip;
    const qty = isEquipment ? 1 : Math.max(1, Math.floor(sellQty));
    if (!isEquipment && sellItem && qty > sellItem.quantity) throw new Error("수량이 부족해.");

    const itemLabel = sellEquip ? sellEquip.name : sellItem!.name;
    const price =
      sellType === "FIXED"
        ? sellPriceMode === "UNIT"
          ? Math.max(1, Math.floor(sellUnitPrice)) * qty
          : Math.max(1, Math.floor(sellTotalPrice))
        : Math.max(1, Math.floor(sellStartPrice));

    if (sellType === "FIXED") {
      await postJson("/api/market/list", {
        ...(sellWeapon
          ? { weaponInstanceId: sellWeapon.id }
          : sellArmor
            ? { armorInstanceId: sellArmor.id }
            : { itemId: sellItem!.itemId, quantity: qty }),
        quantity: qty,
        saleType: "FIXED",
        ...(sellPriceMode === "UNIT"
          ? { fixedPricePerUnit: Math.max(1, Math.floor(sellUnitPrice)) }
          : { fixedPriceTotal: Math.max(1, Math.floor(sellTotalPrice)) }),
      });
    } else {
      await postJson("/api/market/list", {
        ...(sellWeapon
          ? { weaponInstanceId: sellWeapon.id }
          : sellArmor
            ? { armorInstanceId: sellArmor.id }
            : { itemId: sellItem!.itemId, quantity: qty }),
        saleType: "AUCTION",
        startPrice: Math.max(1, Math.floor(sellStartPrice)),
      });
    }

    closeSellModal();
    await load();
    const fee = Math.floor(price * 0.1);
    const notice = `✓ ${itemLabel} ${qty}개 · ${fmtGold(price)} G에 등록 (판매 시 순 +${fmtGold(price - fee)} G 예상)`;
    setListNotice(notice);
    onListed(notice);
  }

  function renderStackRow(it: SellInventoryRow) {
    const icon = iconProps(it);
    return (
      <div key={it.itemId} className="market-row market-row--sell">
        <div className="market-row__item market-row__item--static">
          <ItemIcon itemId={icon.itemId} icon={icon.icon} iconSrc={icon.iconSrc} size={44} className="market-row__icon item-icon" />
          <div className="market-row__info">
            <div className="market-row__name-line">
              <span className={`market-row__name ${itemGradeNameClassName(it.grade ?? 1)}`}>{it.name}</span>
            </div>
            <div className="market-row__meta">
              <span className="market-row__cat">{it.category}</span>
            </div>
          </div>
        </div>
        <div className="market-row__qty">
          <span className="market-row__col-label">보유</span>
          <span className="market-row__qty-val">{it.quantity.toLocaleString()}</span>
        </div>
        <div className="market-row__price market-row__price--muted">
          <span className="market-row__col-label">등록</span>
          <span className="market-row__price-sub">고정가 · 경매</span>
        </div>
        <div className="market-row__action">
          <button type="button" className="market-btn market-btn--buy" disabled={!!busy || !userId || atListingCap} onClick={() => void openSell(it)}>
            판매 등록
          </button>
        </div>
      </div>
    );
  }

  function renderWeaponRow(w: SellWeaponRow) {
    const icon = iconProps({ itemId: w.baseItemId, icon: w.icon, iconSrc: w.iconSrc });
    const view = sellEquipView(w);
    return (
      <div key={w.id} className="market-row market-row--sell">
        <MarketListingEquipmentHover weapon={view}>
          <div className="market-row__item market-row__item--static">
            <ItemIcon itemId={icon.itemId} icon={icon.icon} iconSrc={icon.iconSrc} size={44} className="market-row__icon item-icon" />
            <div className="market-row__info">
              <div className="market-row__name-line">
                <span className={`market-row__name ${itemGradeNameClassName(w.grade ?? 1)}`}>{w.name}</span>
                {w.enhanceLevel > 0 ? <span className="market-row__enh">+{w.enhanceLevel}</span> : null}
              </div>
              <div className="market-row__meta">
                <span className="market-row__badge market-row__badge--fixed">무기</span>
              </div>
            </div>
          </div>
        </MarketListingEquipmentHover>
        <div className="market-row__qty">
          <span className="market-row__col-label">수량</span>
          <span className="market-row__qty-val">1</span>
        </div>
        <div className="market-row__price market-row__price--muted">
          <span className="market-row__col-label">등록</span>
          <span className="market-row__price-sub">인스턴스 1개</span>
        </div>
        <div className="market-row__action">
          <button type="button" className="market-btn market-btn--buy" disabled={!!busy || !userId || atListingCap} onClick={() => void openSellWeapon(w)}>
            판매 등록
          </button>
        </div>
      </div>
    );
  }

  function renderArmorRow(a: SellArmorRow) {
    const icon = iconProps({ itemId: a.baseItemId, icon: a.icon, iconSrc: a.iconSrc });
    const view = sellEquipView(a);
    return (
      <div key={a.id} className="market-row market-row--sell">
        <MarketListingEquipmentHover armor={view}>
          <div className="market-row__item market-row__item--static">
            <ItemIcon itemId={icon.itemId} icon={icon.icon} iconSrc={icon.iconSrc} size={44} className="market-row__icon item-icon" />
            <div className="market-row__info">
              <div className="market-row__name-line">
                <span className={`market-row__name ${itemGradeNameClassName(a.grade ?? 1)}`}>{a.name}</span>
                {a.enhanceLevel > 0 ? <span className="market-row__enh">+{a.enhanceLevel}</span> : null}
              </div>
              <div className="market-row__meta">
                <span className="market-row__badge market-row__badge--fixed">방어구</span>
              </div>
            </div>
          </div>
        </MarketListingEquipmentHover>
        <div className="market-row__qty">
          <span className="market-row__col-label">수량</span>
          <span className="market-row__qty-val">1</span>
        </div>
        <div className="market-row__price market-row__price--muted">
          <span className="market-row__col-label">등록</span>
          <span className="market-row__price-sub">인스턴스 1개</span>
        </div>
        <div className="market-row__action">
          <button type="button" className="market-btn market-btn--buy" disabled={!!busy || !userId || atListingCap} onClick={() => void openSellArmor(a)}>
            판매 등록
          </button>
        </div>
      </div>
    );
  }

  if (loadBusy && inventory.length === 0 && weapons.length === 0 && armors.length === 0) {
    return <div className="market-empty">불러오는 중…</div>;
  }

  if (!userId) {
    return <div className="market-empty">판매 등록을 하려면 로그인(세션)이 필요합니다.</div>;
  }

  const atListingCap = activeListingCount >= maxActiveListings;

  if (filteredInventory.length === 0 && filteredWeapons.length === 0 && filteredArmors.length === 0) {
    return <div className="market-empty">판매할 수 있는 아이템이 없습니다.</div>;
  }

  return (
    <>
      {listNotice ? <p className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100">{listNotice}</p> : null}
      <p className="mb-3 text-xs text-[var(--game-muted)]">
        등록 매물 {activeListingCount}/{maxActiveListings} · 판매 기간 48시간 · 수수료 10%
        {atListingCap ? <span className="ml-2 text-amber-300">등록 한도에 도달했어요.</span> : null}
      </p>
      {filteredWeapons.map((w) => renderWeaponRow(w))}
      {filteredArmors.map((a) => renderArmorRow(a))}
      {filteredInventory.map((it) => renderStackRow(it))}

      {sellOpen && (sellItem || sellWeapon || sellArmor) ? (
        <div className="market-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeSellModal()}>
          <div className="market-modal market-modal--sell" role="dialog" aria-modal="true">
            <div className="market-modal__head">
              <h3 className="market-modal__title">판매 등록</h3>
              <button type="button" className="market-btn market-btn--ghost" onClick={closeSellModal}>
                닫기
              </button>
            </div>
            <p className="market-modal__item">
              {sellWeapon ? (
                <>
                  <span className={itemGradeNameClassName(sellWeapon.grade ?? 1)}>{sellWeapon.name}</span>
                  {sellWeapon.enhanceLevel > 0 ? ` +${sellWeapon.enhanceLevel}` : ""}
                </>
              ) : sellArmor ? (
                <>
                  <span className={itemGradeNameClassName(sellArmor.grade ?? 1)}>{sellArmor.name}</span>
                  {sellArmor.enhanceLevel > 0 ? ` +${sellArmor.enhanceLevel}` : ""}
                </>
              ) : (
                <>
                  <span className={itemGradeNameClassName(sellItem!.grade ?? 1)}>{sellItem!.name}</span>
                  <span className="market-modal__item-meta"> · 보유 {sellItem!.quantity.toLocaleString()}</span>
                </>
              )}
            </p>
            {suggestedUnit ? <p className="market-modal__hint">최근 시세(대략) 단가: {fmtGold(suggestedUnit)} G</p> : null}

            <div className="market-modal__form market-modal__form--grid">
              {!sellWeapon && !sellArmor ? (
                <label className="market-modal__label">
                  수량
                  <div className="market-modal__qty-row">
                    <input
                      type="number"
                      className="market-input"
                      min={1}
                      max={sellItem!.quantity}
                      value={sellQty}
                      onChange={(e) => {
                        const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                        const next = Math.min(v, sellItem!.quantity);
                        setSellQty(next);
                        if (sellPriceMode === "TOTAL") setSellUnitPrice(Math.max(1, Math.floor(sellTotalPrice / next)));
                        else setSellTotalPrice(Math.max(1, Math.floor(sellUnitPrice * next)));
                      }}
                    />
                    <button
                      type="button"
                      className="market-btn market-btn--ghost"
                      disabled={sellItem!.quantity <= 1}
                      onClick={() => {
                        const next = sellItem!.quantity;
                        setSellQty(next);
                        if (sellPriceMode === "TOTAL") setSellUnitPrice(Math.max(1, Math.floor(sellTotalPrice / next)));
                        else setSellTotalPrice(Math.max(1, Math.floor(sellUnitPrice * next)));
                      }}
                    >
                      최대
                    </button>
                  </div>
                </label>
              ) : null}

              <label className="market-modal__label">
                판매 방식
                <select className="market-input" value={sellType} onChange={(e) => setSellType(e.target.value as "FIXED" | "AUCTION")}>
                  <option value="FIXED">고정가</option>
                  <option value="AUCTION">경매</option>
                </select>
              </label>

              {sellType === "FIXED" ? (
                <>
                  <label className="market-modal__label">
                    가격 모드
                    <select className="market-input" value={sellPriceMode} onChange={(e) => setSellPriceMode(e.target.value as "UNIT" | "TOTAL")}>
                      <option value="UNIT">단가</option>
                      <option value="TOTAL">총액</option>
                    </select>
                  </label>
                  {sellPriceMode === "UNIT" ? (
                    <label className="market-modal__label">
                      단가 (G)
                      <input
                        type="number"
                        className="market-input"
                        min={1}
                        value={sellUnitPrice}
                        onChange={(e) => {
                          const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setSellUnitPrice(v);
                          setSellTotalPrice(Math.max(1, v * Math.max(1, Math.floor(sellQty))));
                        }}
                      />
                    </label>
                  ) : (
                    <label className="market-modal__label">
                      총액 (G)
                      <input
                        type="number"
                        className="market-input"
                        min={1}
                        value={sellTotalPrice}
                        onChange={(e) => {
                          const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setSellTotalPrice(v);
                          setSellUnitPrice(Math.max(1, Math.floor(v / Math.max(1, Math.floor(sellQty)))));
                        }}
                      />
                    </label>
                  )}
                  <p className="market-modal__calc">
                    계산 단가 {fmtGold(sellUnitPrice)} G · 총액 {fmtGold(sellUnitPrice * Math.max(1, Math.floor(sellQty)))} G
                    <button
                      type="button"
                      className="market-btn market-btn--ghost market-modal__suggest"
                      disabled={suggestBusy}
                      onClick={() =>
                        void fetchSuggested(sellWeapon?.baseItemId ?? sellArmor?.baseItemId ?? sellItem!.itemId).then(
                          (v) => v && setSellUnitPrice(v),
                        )
                      }
                    >
                      {suggestBusy ? "…" : "시세 맞추기"}
                    </button>
                  </p>
                </>
              ) : (
                <label className="market-modal__label">
                  시작가 (G)
                  <input
                    type="number"
                    className="market-input"
                    min={1}
                    value={sellStartPrice}
                    onChange={(e) => setSellStartPrice(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  />
                </label>
              )}
            </div>

            <div className="market-modal__actions">
              <GameBtn variant="ghost" onClick={closeSellModal}>
                취소
              </GameBtn>
              <GameBtn
                variant="gold"
                disabled={!!busy}
                onClick={() => {
                  setBusy(true);
                  onError(null);
                  void submitSell()
                    .catch((e) => onError(formatPanelError(e)))
                    .finally(() => setBusy(false));
                }}
              >
                등록
              </GameBtn>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export {
  CATEGORY_ALL as MARKET_SELL_CATEGORY_ALL,
  WEAPON_CATEGORY as MARKET_WEAPON_CATEGORY,
  ARMOR_CATEGORY as MARKET_ARMOR_CATEGORY,
};
