"use client";

import { useCallback, useEffect, useState } from "react";
import { EquipmentShopPanel } from "@/app/_components/EquipmentShopPanel";
import { EquipmentPullPanel } from "@/app/_components/EquipmentPullPanel";
import { ShopPullPanel } from "@/app/_components/ShopPullPanel";
import { GamePanel } from "@/app/_components/gameUi";
import {
  GACHA_MATERIALS_POOL_ID,
} from "@/shared/gachaShop";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";
import {
  readStoredShopSubTab,
  SHOP_SUB_TAB_EVENT,
  shopSubTabFromStorage,
  type ShopSubTab,
} from "@/shared/shopSubTab";

type ShopTabKey = "EQUIPMENT_PULL" | "MATERIALS" | "EQUIPMENT_SELL";

function toPanelTab(sub: ShopSubTab): ShopTabKey {
  if (sub === "materials") return "MATERIALS";
  if (sub === "equipment") return "EQUIPMENT_SELL";
  return "EQUIPMENT_PULL";
}

function readTabFromUrl(): ShopTabKey {
  if (typeof window === "undefined") return "EQUIPMENT_PULL";
  const sub = new URLSearchParams(window.location.search).get("sub");
  const fromUrl = shopSubTabFromStorage(sub);
  if (fromUrl) return toPanelTab(fromUrl);
  const stored = readStoredShopSubTab();
  if (stored) return toPanelTab(stored);
  return "EQUIPMENT_PULL";
}

export function ShopPanel({ embedded = false }: EmbeddedPanelProps = {}) {
  const [tab, setTab] = useState<ShopTabKey>("EQUIPMENT_PULL");

  const applySub = useCallback((sub: ShopSubTab) => {
    setTab(toPanelTab(sub));
  }, []);

  useEffect(() => {
    setTab(readTabFromUrl());
  }, []);

  useEffect(() => {
    const onSubTab = (event: Event) => {
      const detail = (event as CustomEvent<ShopSubTab>).detail;
      if (
        detail === "equipment_pull" ||
        detail === "materials" ||
        detail === "equipment"
      ) {
        applySub(detail);
      }
    };
    window.addEventListener(SHOP_SUB_TAB_EVENT, onSubTab);
    return () => window.removeEventListener(SHOP_SUB_TAB_EVENT, onSubTab);
  }, [applySub]);

  return (
    <GamePanel className={`shop-panel market-board ${embedded ? "market-board--fit" : ""}`}>
      <div className="market-board__header">
        {!embedded ? (
          <div>
            <p className="game-label">상점</p>
            <h2 className="market-board__title">메르카투스 상점</h2>
            <p className="mt-1 text-xs text-[var(--game-muted)]">장비 · 재료 · 장비 매입</p>
          </div>
        ) : null}
        <div className="market-board__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "EQUIPMENT_PULL"}
            className={`market-board__tab ${tab === "EQUIPMENT_PULL" ? "market-board__tab--active" : ""}`}
            onClick={() => setTab("EQUIPMENT_PULL")}
          >
            장비
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "MATERIALS"}
            className={`market-board__tab ${tab === "MATERIALS" ? "market-board__tab--active" : ""}`}
            onClick={() => setTab("MATERIALS")}
          >
            재료
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "EQUIPMENT_SELL"}
            className={`market-board__tab ${tab === "EQUIPMENT_SELL" ? "market-board__tab--active" : ""}`}
            onClick={() => setTab("EQUIPMENT_SELL")}
          >
            장비 매입
          </button>
        </div>
      </div>

      {tab === "EQUIPMENT_PULL" ? <EquipmentPullPanel /> : null}
      {tab === "MATERIALS" ? (
        <ShopPullPanel
          poolId={GACHA_MATERIALS_POOL_ID}
          eyebrow="상점 · 재료"
          rateHints={[
            "하급·중급 마석, 강화 보호 주문서",
            "골드 — 60~520 G (일부 환급)",
          ]}
          loopHint="재료는 대장간 강화·가공에 사용합니다."
          multiBadge="10% 할인"
        />
      ) : null}
      {tab === "EQUIPMENT_SELL" ? <EquipmentShopPanel /> : null}
    </GamePanel>
  );
}
