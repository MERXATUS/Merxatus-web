"use client";

import { useEffect, useState } from "react";
import { EquipmentShopPanel } from "@/app/_components/EquipmentShopPanel";
import { GachaShopPanel } from "@/app/_components/GachaShopPanel";
import { GamePanel } from "@/app/_components/gameUi";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";

type ShopSubTab = "GACHA" | "EQUIPMENT";

function readSubTabFromUrl(): ShopSubTab {
  if (typeof window === "undefined") return "GACHA";
  const sub = new URLSearchParams(window.location.search).get("sub");
  if (sub === "equipment") return "EQUIPMENT";
  if (sub === "gacha") return "GACHA";
  return "GACHA";
}

export function ShopPanel({ embedded = false }: EmbeddedPanelProps = {}) {
  const [tab, setTab] = useState<ShopSubTab>("GACHA");

  useEffect(() => {
    setTab(readSubTabFromUrl());
  }, []);

  return (
    <GamePanel className={`shop-panel market-board ${embedded ? "market-board--fit" : ""}`}>
      <div className="market-board__header">
        {!embedded ? (
          <div>
            <p className="game-label">상점</p>
            <h2 className="market-board__title">메르카투스 상점</h2>
            <p className="mt-1 text-xs text-[var(--game-muted)]">가챠 · 장비 매입</p>
          </div>
        ) : null}
        <div className="market-board__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "GACHA"}
            className={`market-board__tab ${tab === "GACHA" ? "market-board__tab--active" : ""}`}
            onClick={() => setTab("GACHA")}
          >
            가챠
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "EQUIPMENT"}
            className={`market-board__tab ${tab === "EQUIPMENT" ? "market-board__tab--active" : ""}`}
            onClick={() => setTab("EQUIPMENT")}
          >
            장비 매입
          </button>
        </div>
      </div>

      {tab === "GACHA" ? <GachaShopPanel /> : null}
      {tab === "EQUIPMENT" ? <EquipmentShopPanel /> : null}
    </GamePanel>
  );
}
