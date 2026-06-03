"use client";

import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn } from "@/app/_components/gameUi";
import { itemGradeNameClassName } from "@/server/itemGrade";
import type { DungeonLootRow } from "@/shared/dungeonSettlement";
import { useEscapeClose } from "@/shared/useEscapeClose";

type Props = {
  open: boolean;
  loot: DungeonLootRow[];
  onClose: () => void;
};

/** 탐험 중 누적 보상 요약 (정산 전 확인용) */
export function PendingLootSummaryModal(props: Props) {
  const { open, loot, onClose } = props;
  useEscapeClose(open, onClose);
  if (!open) return null;

  const totalQty = loot.reduce((a, x) => a + x.qty, 0);

  return (
    <div
      className="dungeon-settlement-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pending-loot-summary-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="game-panel dungeon-pending-loot-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="pending-loot-summary-title" className="game-panel-title">
          정산 시 수령
        </h2>
        <p className="dungeon-settlement__subtitle">
          {loot.length > 0
            ? `${loot.length}종 · 총 ${totalQty.toLocaleString()}개 · 지금 정산하면 안전하게 가져갑니다.`
            : "아직 획득한 보상이 없습니다."}
        </p>
        <p className="dungeon-pending-loot__hint !mt-1">패배·보상 포기 시 누적 보상이 사라집니다.</p>
        <div className="dungeon-settlement-modal__scroll mt-2 min-h-0 flex-1">
          {loot.length > 0 ? (
            <ul className="dungeon-pending-loot__list dungeon-pending-loot__list--modal !mt-0 !max-h-none">
              {loot.map((x) => (
                <li key={x.itemId} className="dungeon-pending-loot__row">
                  <ItemIcon itemId={x.itemId} size={36} className="dungeon-pending-loot__icon" />
                  <div className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${itemGradeNameClassName(x.grade)}`}>
                      {x.name}
                    </span>
                  </div>
                  <span className="dungeon-pending-loot__qty">×{x.qty.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <GameBtn variant="gold" className="mt-4 h-10 w-full shrink-0 text-sm" onClick={onClose}>
          닫기
        </GameBtn>
      </div>
    </div>
  );
}
