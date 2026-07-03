"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArmorTooltipHover } from "@/app/_components/ArmorTooltip";
import { ForgeEquippedByTag } from "@/app/_components/ForgeEquippedByTag";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { WeaponTooltipHover } from "@/app/_components/WeaponTooltip";
import { GameBtn } from "@/app/_components/gameUi";
import { GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { notifyTutorialRefresh } from "@/app/_components/TutorialPanel";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { armorDisplayName } from "@/shared/armorTooltip";
import { formatPanelError } from "@/shared/formatPanelError";
import { notifyGameFramePatch } from "@/shared/gameFramePatch";
import { apiGetJson, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
import { useWalletStore, selectGoldAvailable } from "@/shared/stores/walletStore";
import { usePlayerEquipmentStore } from "@/shared/stores/playerEquipmentStore";
import { useGameDataPatch } from "@/shared/useGameDataPatch";
import { weaponDisplayName } from "@/shared/weaponTooltip";
import {
  equipmentShopBuybackFormulaLabel,
  MAX_EQUIPMENT_SHOP_SELL_BATCH,
} from "@/shared/equipmentShopPricing";

type ShopKindFilter = "all" | "weapon" | "armor";

type ShopRow = {
  kind: "weapon" | "armor";
  instanceId: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  quality: number;
  itemLevel: number;
  grade: number;
  gradeLabel: string;
  identified: boolean;
  combatPower: number;
  buybackGold: number;
  sellable: boolean;
  blockedReason: string | null;
  equippedByMinion: { id: string; label: string } | null;
  options: Array<{
    kind: string;
    label: string;
    tier: number;
    tierLabel: string;
    displayValue: number;
    hidden?: boolean;
    locked?: boolean;
  }>;
  icon?: string | null;
  iconSrc?: string;
};

type ShopPayload = {
  ok: true;
  goldAvailable: number;
  goldPerCombatPower: number;
  enhanceBonusGold?: number;
  unenhancedScrapRatio?: number;
  buybackFormulaLabel?: string;
  items: ShopRow[];
};

function rowKey(row: ShopRow) {
  return `${row.kind}:${row.instanceId}`;
}

function fmtGold(n: number) {
  return n.toLocaleString();
}

function displayName(row: ShopRow) {
  if (row.kind === "weapon") {
    return weaponDisplayName({
      id: row.instanceId,
      baseItemId: row.baseItemId,
      name: row.name,
      enhanceLevel: row.enhanceLevel,
      options: row.options,
    });
  }
  return armorDisplayName({
    id: row.instanceId,
    baseItemId: row.baseItemId,
    name: row.name,
    enhanceLevel: row.enhanceLevel,
    options: row.options,
  });
}

function blockedLabel(reason: string | null) {
  if (!reason) return null;
  if (reason === "EQUIPMENT_EQUIPPED") return "착용 중";
  if (reason === "ITEM_USER_LOCKED") return "잠금";
  if (reason === "EQUIPMENT_LOCKED") return "거래 등록";
  return reason;
}

export function EquipmentShopPanel() {
  const { user, loading: sessionLoading } = useSessionUser();
  const userId = user?.id ?? "";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payload, setPayload] = useState<ShopPayload | null>(null);
  const [kindFilter, setKindFilter] = useState<ShopKindFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const goldAvailable = useWalletStore(selectGoldAvailable);
  const maxBatch = MAX_EQUIPMENT_SHOP_SELL_BATCH;

  const applySellOptimistic = useCallback((rows: ShopRow[]) => {
    const goldGain = rows.reduce((sum, row) => sum + row.buybackGold, 0);
    const rollbackGold = useWalletStore.getState().optimisticGoldDelta(goldGain);
    usePlayerEquipmentStore.getState().removeInstances(
      rows.map((row) => ({ kind: row.kind, instanceId: row.instanceId })),
    );
    const soldKeys = new Set(rows.map(rowKey));
    setPayload((prev) =>
      prev ? { ...prev, items: prev.items.filter((row) => !soldKeys.has(rowKey(row))) } : prev,
    );
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of soldKeys) next.delete(key);
      return next;
    });
    return rollbackGold;
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetJson<ShopPayload>("/api/shop/equipment");
      setPayload(data);
      setSelected(new Set());
    } catch (e) {
      if (!isUnauthorizedError(e)) setError(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!userId) {
      setLoading(false);
      return;
    }
    void load();
  }, [sessionLoading, userId, load]);

  const onDataPatch = useCallback(() => {
    void load();
  }, [load]);
  useGameDataPatch(["wallet", "weapons", "armor"], onDataPatch);

  const filtered = useMemo(() => {
    const items = payload?.items ?? [];
    if (kindFilter === "all") return items;
    return items.filter((row) => row.kind === kindFilter);
  }, [payload?.items, kindFilter]);

  const sellableFiltered = useMemo(() => filtered.filter((row) => row.sellable), [filtered]);

  const selectedRows = useMemo(() => {
    if (!payload) return [];
    return payload.items.filter((row) => selected.has(rowKey(row)) && row.sellable);
  }, [payload, selected]);

  const selectedGold = useMemo(
    () => selectedRows.reduce((sum, row) => sum + row.buybackGold, 0),
    [selectedRows],
  );

  const toggleSelect = useCallback((row: ShopRow) => {
    if (!row.sellable) return;
    const key = rowKey(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllSellable = useCallback(() => {
    const keys = sellableFiltered.slice(0, maxBatch).map(rowKey);
    setSelected(new Set(keys));
  }, [sellableFiltered, maxBatch]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const sellSelected = useCallback(async () => {
    if (!userId || selectedRows.length === 0 || busy) return;
    const rows = selectedRows;
    setBusy(true);
    setError(null);
    setNotice(null);
    const rollback = applySellOptimistic(rows);
    try {
      const result = await apiPostJson<{
        ok: true;
        soldCount: number;
        goldGained: number;
        honorDelta: number;
        tutorialAdvanced?: boolean;
      }>("/api/shop/equipment/sell", {
        targets: rows.map((row) => ({ kind: row.kind, instanceId: row.instanceId })),
      });
      const wallet = useWalletStore.getState();
      wallet.setWallet({ goldAvailable: wallet.goldAvailable + result.goldGained });
      setNotice(
        `${result.soldCount}개 매입 · +${fmtGold(result.goldGained)} G` +
          (result.honorDelta > 0 ? ` · 명예 +${result.honorDelta}` : ""),
      );
      if (result.tutorialAdvanced) notifyTutorialRefresh();
      notifyGameFramePatch(["wallet", "summary"]);
    } catch (e) {
      rollback();
      await load();
      if (!isUnauthorizedError(e)) setError(e);
    } finally {
      setBusy(false);
    }
  }, [userId, selectedRows, busy, applySellOptimistic, load]);

  const sellOne = useCallback(
    async (row: ShopRow) => {
      if (!userId || !row.sellable || busy) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      const rollback = applySellOptimistic([row]);
      try {
        const result = await apiPostJson<{
          ok: true;
          soldCount: number;
          goldGained: number;
          honorDelta: number;
          tutorialAdvanced?: boolean;
        }>("/api/shop/equipment/sell", {
          kind: row.kind,
          instanceId: row.instanceId,
        });
        const wallet = useWalletStore.getState();
        wallet.setWallet({ goldAvailable: wallet.goldAvailable + result.goldGained });
        setNotice(`매입 완료 · +${fmtGold(result.goldGained)} G`);
        if (result.tutorialAdvanced) notifyTutorialRefresh();
        notifyGameFramePatch(["wallet", "summary"]);
      } catch (e) {
        rollback();
        await load();
        if (!isUnauthorizedError(e)) setError(e);
      } finally {
        setBusy(false);
      }
    },
    [userId, busy, applySellOptimistic, load],
  );

  if (sessionLoading || loading) {
    return <GamePanelLoading label="장비 매입 상점 불러오는 중…" />;
  }

  if (!userId) {
    return <GamePanelInfo>로그인 후 이용할 수 있습니다.</GamePanelInfo>;
  }

  const buybackLabel =
    payload?.buybackFormulaLabel ??
    equipmentShopBuybackFormulaLabel();

  return (
    <div className="equipment-shop">
      <div className="equipment-shop__intro">
        <p>
          NPC 상인이 강화한 장비를 즉시 매입합니다.{" "}
          <strong>{buybackLabel}</strong>
          . 뽑기 → 강화 → 매입으로 골드를 굴리세요.
        </p>
      </div>

      {notice ? <p className="equipment-shop__notice">{notice}</p> : null}
      {error ? <div className="market-alert market-alert--error">{formatPanelError(error)}</div> : null}

      <div className="equipment-shop__toolbar">
        <div className="equipment-shop__filters" role="tablist" aria-label="장비 분류">
          {(
            [
              ["all", "전체"],
              ["weapon", "무기"],
              ["armor", "방어구"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={kindFilter === key}
              className={`equipment-shop__filter ${kindFilter === key ? "equipment-shop__filter--active" : ""}`}
              onClick={() => setKindFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="equipment-shop__batch">
          <button type="button" className="equipment-shop__link-btn" onClick={selectAllSellable} disabled={busy}>
            매입 가능 전체 선택
          </button>
          <button
            type="button"
            className="equipment-shop__link-btn"
            onClick={clearSelection}
            disabled={busy || selected.size === 0}
          >
            선택 해제
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <GamePanelInfo>매입할 장비가 없습니다.</GamePanelInfo>
      ) : (
        <ul className="equipment-shop__list">
          {filtered.map((row) => {
            const key = rowKey(row);
            const active = selected.has(key);
            const name = displayName(row);
            const icon = <ItemIcon itemId={row.baseItemId} size={36} className="item-icon" />;
            const iconSlot =
              row.kind === "weapon" ? (
                <WeaponTooltipHover
                  weapon={{
                    id: row.instanceId,
                    baseItemId: row.baseItemId,
                    name: row.name,
                    enhanceLevel: row.enhanceLevel,
                    quality: row.quality,
                    itemLevel: row.itemLevel,
                    grade: row.grade,
                    gradeLabel: row.gradeLabel,
                    identified: row.identified,
                    options: row.options,
                    equippedByMinion: row.equippedByMinion,
                  }}
                >
                  {icon}
                </WeaponTooltipHover>
              ) : (
                <ArmorTooltipHover
                  armor={{
                    id: row.instanceId,
                    baseItemId: row.baseItemId,
                    name: row.name,
                    enhanceLevel: row.enhanceLevel,
                    quality: row.quality,
                    itemLevel: row.itemLevel,
                    grade: row.grade,
                    gradeLabel: row.gradeLabel,
                    identified: row.identified,
                    options: row.options,
                    equippedByMinion: row.equippedByMinion,
                  }}
                >
                  {icon}
                </ArmorTooltipHover>
              );

            return (
              <li
                key={key}
                className={`equipment-shop__row ${!row.sellable ? "equipment-shop__row--blocked" : ""} ${active ? "equipment-shop__row--selected" : ""}`}
              >
                <button
                  type="button"
                  className="equipment-shop__select"
                  disabled={!row.sellable || busy}
                  aria-pressed={active}
                  onClick={() => toggleSelect(row)}
                  aria-label={row.sellable ? `${name} 선택` : `${name} 매입 불가`}
                >
                  <span className="equipment-shop__check" aria-hidden>
                    {active ? "✓" : ""}
                  </span>
                </button>
                <div className="equipment-shop__icon">{iconSlot}</div>
                <div className="equipment-shop__meta">
                  <p className={`equipment-shop__name ${itemGradeNameClassName(row.grade)}`}>{name}</p>
                  <p className="equipment-shop__stats">
                    CP {row.combatPower.toLocaleString()}
                    {row.enhanceLevel > 0 ? ` · +${row.enhanceLevel}` : ""}
                    {row.identified === false ? " · 미감정" : ""}
                  </p>
                  <ForgeEquippedByTag equippedByMinion={row.equippedByMinion} />
                  {!row.sellable && row.blockedReason ? (
                    <p className="equipment-shop__blocked">{blockedLabel(row.blockedReason)}</p>
                  ) : null}
                </div>
                <div className="equipment-shop__price">
                  <p className="equipment-shop__gold-label">{fmtGold(row.buybackGold)} G</p>
                  <GameBtn
                    type="button"
                    variant="ghost"
                    className="equipment-shop__sell-btn"
                    disabled={!row.sellable || busy}
                    onClick={() => void sellOne(row)}
                  >
                    매입
                  </GameBtn>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selectedRows.length > 0 ? (
        <div className="equipment-shop__footer">
          <p>
            {selectedRows.length}개 선택 · 합계 <strong>{fmtGold(selectedGold)} G</strong>
            {selectedRows.length > maxBatch ? ` (최대 ${maxBatch}개)` : ""}
          </p>
          <GameBtn
            type="button"
            disabled={busy || selectedRows.length === 0 || selectedRows.length > maxBatch}
            onClick={() => void sellSelected()}
          >
            선택 매입
          </GameBtn>
        </div>
      ) : null}
    </div>
  );
}
