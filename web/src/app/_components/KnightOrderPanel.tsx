"use client";

import type { KnightOrderView } from "@/shared/meDashboard";
import { KNIGHT_ORDER_LEVEL_STEP } from "@/shared/knightOrder";

function fmtPct(n: number) {
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function KnightOrderPanel(props: {
  knightOrder: KnightOrderView;
  compact?: boolean;
  className?: string;
}) {
  const ko = props.knightOrder;
  const rows = [
    { label: "공격력", value: ko.atkPct },
    { label: "마력", value: ko.magicPct },
    { label: "최종 데미지", value: ko.finalDamagePct },
    { label: "보스 데미지", value: ko.bossDamagePct },
  ];

  return (
    <div className={`knight-order-panel ${props.compact ? "knight-order-panel--compact" : ""} ${props.className ?? ""}`}>
      <div className="knight-order-panel__head">
        <div>
          <p className="knight-order-panel__title">기사단 레벨</p>
          <p className="knight-order-panel__lv">
            Lv <span className="tabular-nums">{ko.orderLevel}</span>
          </p>
        </div>
        <div className="knight-order-panel__meta">
          <span className="tabular-nums">
            총 레벨 {ko.totalLevel.toLocaleString()}
          </span>
          <span className="knight-order-panel__meta-sub">
            미니언 {ko.minionCount}명 · {KNIGHT_ORDER_LEVEL_STEP}레벨마다 기사단 +1
          </span>
        </div>
      </div>

      {ko.levelsToNextOrderLevel > 0 ? (
        <p className="knight-order-panel__next tabular-nums">
          다음 기사단 Lv까지 총 레벨 +{ko.levelsToNextOrderLevel}
        </p>
      ) : (
        <p className="knight-order-panel__next">기사단 레벨 상승 조건 충족</p>
      )}

      <ul className="knight-order-panel__stats">
        {rows.map((r) => (
          <li key={r.label} className="knight-order-panel__stat">
            <span className="knight-order-panel__stat-label">{r.label}</span>
            <span className="knight-order-panel__stat-val tabular-nums">+{fmtPct(r.value)}%</span>
          </li>
        ))}
      </ul>

      <p className="knight-order-panel__foot">
        던전·레이드·무탑 파티 전투력 ×{(Math.round(ko.partyPowerMult * 1000) / 1000).toFixed(3)} · 전투 피해에
        최종/보스 보너스 적용
      </p>
    </div>
  );
}
