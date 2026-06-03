"use client";

import { GameBtn } from "@/app/_components/gameUi";
import type { DungeonLootRow } from "@/shared/dungeonSettlement";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { itemGradeNameClassName } from "@/server/itemGrade";

type Props = {
  open: boolean;
  loot: DungeonLootRow[];
  onConfirm: () => void;
  onCancel: () => void;
  /** 누적 보상을 포기하고 탐험만 종료 */
  onForfeit?: () => void;
};

export function DungeonCashoutConfirmModal(props: Props) {
  if (!props.open) return null;

  return (
    <div
      className="dungeon-settlement-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cashout-confirm-title"
      onMouseDown={(e) => e.target === e.currentTarget && props.onCancel()}
    >
      <div className="game-panel dungeon-cashout-confirm" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="cashout-confirm-title" className="game-panel-title">
          탐험을 마칠까요?
        </h2>
        <p className="dungeon-settlement__subtitle">
          보상 수령으로 안전하게 나가거나, 한 층 더 도전할 수 있습니다. 패배하면 누적 보상이 사라집니다.
        </p>
        <div className="dungeon-settlement-modal__scroll mt-1 min-h-0 flex-1">
          {props.loot.length > 0 ? (
            <ul className="dungeon-settlement__loot-list dungeon-pending-loot__list dungeon-pending-loot__list--modal">
              {props.loot.map((x) => (
                <li key={x.itemId} className="dungeon-settlement__loot-row">
                  <ItemIcon itemId={x.itemId} size={32} />
                  <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${itemGradeNameClassName(x.grade)}`}>
                    {x.name}
                  </span>
                  <span className="dungeon-settlement__loot-qty">×{x.qty}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dungeon-settlement__empty">아직 누적 보상이 없습니다.</p>
          )}
        </div>
        <div className="mt-4 flex shrink-0 gap-2">
          <GameBtn variant="ghost" className="h-10 flex-1" onClick={props.onCancel}>
            한 층 더
          </GameBtn>
          <GameBtn variant="gold" className="h-10 flex-1" onClick={props.onConfirm}>
            보상 수령
          </GameBtn>
        </div>
        {props.loot.length > 0 && props.onForfeit ? (
          <button
            type="button"
            className="dungeon-cashout-forfeit mt-2 w-full"
            onClick={props.onForfeit}
          >
            보상 포기하고 나가기
          </button>
        ) : null}
      </div>
    </div>
  );
}
