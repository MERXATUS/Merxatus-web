"use client";

import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn } from "@/app/_components/gameUi";
import type { DungeonSettlement } from "@/shared/dungeonSettlement";
import { itemGradeNameClassName } from "@/server/itemGrade";

type Props = {
  open: boolean;
  settlement: DungeonSettlement | null;
  onConfirm: () => void;
};

function LootList(props: { items: DungeonSettlement["loot"]; emptyLabel: string }) {
  if (props.items.length === 0) {
    return <p className="dungeon-settlement__empty">{props.emptyLabel}</p>;
  }
  return (
    <ul className="dungeon-settlement__loot-list dungeon-pending-loot__list dungeon-pending-loot__list--modal">
      {props.items.map((x) => (
        <li key={x.itemId} className="dungeon-settlement__loot-row">
          <ItemIcon itemId={x.itemId} size={36} className="dungeon-settlement__loot-icon" />
          <div className="min-w-0 flex-1">
            <span className={`block truncate text-sm font-semibold ${itemGradeNameClassName(x.grade)}`}>
              {x.name}
            </span>
          </div>
          <span className="dungeon-settlement__loot-qty">×{x.qty.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

export function DungeonRunSettlementModal(props: Props) {
  const { open, settlement, onConfirm } = props;
  if (!open || !settlement) return null;

  const totalXp = settlement.xpGrants.reduce((a, g) => a + g.xpGained, 0);
  const hasXp = settlement.xpGrants.some((g) => g.xpGained > 0 || g.levelsGained > 0);

  return (
    <div
      className="dungeon-settlement-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dungeon-settlement-title"
      onMouseDown={(e) => e.target === e.currentTarget && onConfirm()}
    >
      <div className="game-panel dungeon-settlement-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="dungeon-settlement-title" className="game-panel-title">
          {settlement.title}
        </h2>
        <div className="dungeon-settlement-modal__scroll">
        {settlement.subtitle ? (
          <p className="dungeon-settlement__subtitle">{settlement.subtitle}</p>
        ) : null}

        {(settlement.goldGained ?? 0) > 0 || (settlement.lootMultiplier ?? 0) > 1 ? (
          <p className="dungeon-settlement__bonus-line">
            {(settlement.lootMultiplier ?? 1) > 1 ? (
              <span className="mr-3 text-[var(--game-gold-bright)]">드랍 배수 ×{settlement.lootMultiplier}</span>
            ) : null}
            {(settlement.goldGained ?? 0) > 0 ? (
              <span className="text-[var(--game-gold-bright)]">+{settlement.goldGained!.toLocaleString()} G</span>
            ) : null}
          </p>
        ) : null}

        {hasXp ? (
          <section className="dungeon-settlement__section">
            <h3 className="dungeon-settlement__section-title">획득 경험치</h3>
            {totalXp > 0 ? (
              <p className="dungeon-settlement__xp-total">총 +{totalXp.toLocaleString()} EXP</p>
            ) : null}
            <ul className="dungeon-settlement__xp-list">
              {settlement.xpGrants.map((g) => (
                <li key={g.minionId} className="dungeon-settlement__xp-row">
                  <span className="truncate font-semibold">{g.label}</span>
                  <span className="shrink-0 text-right tabular-nums text-[var(--game-muted)]">
                    {g.xpGained > 0 ? `+${g.xpGained.toLocaleString()} EXP` : null}
                    {g.levelsGained > 0 ? (
                      <span className="block text-[11px] text-[var(--game-gold-bright)]">
                        Lv {g.level - g.levelsGained} → {g.level}
                        {g.statPointsGained > 0 ? ` · P +${g.statPointsGained}` : ""}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="dungeon-settlement__section">
          <h3 className="dungeon-settlement__section-title">
            {settlement.kind === "defeat" || settlement.kind === "abort" ? "수령 보상" : "정산 보상"}
          </h3>
          <LootList
            items={settlement.loot}
            emptyLabel={
              settlement.kind === "defeat" || settlement.kind === "abort"
                ? "수령한 보상이 없습니다."
                : "정산할 보상이 없었습니다."
            }
          />
        </section>

        {settlement.forfeitedLoot && settlement.forfeitedLoot.length > 0 ? (
          <section className="dungeon-settlement__section dungeon-settlement__section--forfeit">
            <h3 className="dungeon-settlement__section-title">소멸한 누적 보상</h3>
            <LootList items={settlement.forfeitedLoot} emptyLabel="" />
          </section>
        ) : null}
        </div>

        <GameBtn variant="gold" className="mt-4 h-10 w-full shrink-0 text-sm" onClick={onConfirm}>
          확인
        </GameBtn>
      </div>
    </div>
  );
}
