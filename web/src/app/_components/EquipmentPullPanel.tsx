"use client";

import { useState } from "react";
import { ShopPullPanel } from "@/app/_components/ShopPullPanel";
import {
  GACHA_EQUIPMENT_POOL_ID,
  GACHA_ELITE_POOL_ID,
  GACHA_STARTER_POOL_ID,
  type GachaEquipmentPoolId,
} from "@/shared/gachaShop";

const EQUIP_POOL_TABS: {
  id: GachaEquipmentPoolId;
  label: string;
  short: string;
  rateHints: string[];
  loopHint: string;
  multiBadge?: string;
}[] = [
  {
    id: GACHA_STARTER_POOL_ID,
    label: "입문",
    short: "1~2등급",
    rateHints: ["나무·돌 검, 가죽·사슬 방어구", "적빛 방어구 일부"],
    loopHint: "튜토리얼·스테이지 1용. 250G로 빠르게 기본 장비를 확보하세요.",
    multiBadge: "10% 할인",
  },
  {
    id: GACHA_EQUIPMENT_POOL_ID,
    label: "장비",
    short: "2~3등급",
    rateHints: ["적빛·철 검", "적빛·철 방어구 (투구·갑옷·바지·신발)"],
    loopHint: "중반 성장용. 입문 상자로 기본을 채운 뒤 넘어가세요.",
    multiBadge: "10% 할인",
  },
  {
    id: GACHA_ELITE_POOL_ID,
    label: "정예",
    short: "3~4등급",
    rateHints: ["철·심판 검", "철·심판 방어구 · 10연차 3등급+ 보장"],
    loopHint: "스테이지 3 이상 던전 플레이 후 해금됩니다.",
    multiBadge: "3등급+ 보장",
  },
];

export function EquipmentPullPanel() {
  const [poolId, setPoolId] = useState<GachaEquipmentPoolId>(GACHA_STARTER_POOL_ID);
  const tab = EQUIP_POOL_TABS.find((t) => t.id === poolId) ?? EQUIP_POOL_TABS[0]!;

  return (
    <div className="equipment-pull-panel">
      <div className="equipment-pull-panel__tabs" role="tablist" aria-label="장비 뽑기 등급">
        {EQUIP_POOL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={poolId === t.id}
            className={`equipment-pull-panel__tab ${poolId === t.id ? "equipment-pull-panel__tab--active" : ""}`}
            onClick={() => setPoolId(t.id)}
          >
            <span className="equipment-pull-panel__tab-label">{t.label}</span>
            <span className="equipment-pull-panel__tab-sub">{t.short}</span>
          </button>
        ))}
      </div>

      <ShopPullPanel
        key={tab.id}
        poolId={tab.id}
        eyebrow={`상점 · ${tab.label} 장비`}
        rateHints={tab.rateHints}
        loopHint={tab.loopHint}
        multiBadge={tab.multiBadge}
      />
    </div>
  );
}
