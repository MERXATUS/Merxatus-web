"use client";

import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn } from "@/app/_components/gameUi";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { pickBestRecoveryPotion } from "@/shared/potionEffects";

export type RecoveryPotion = {
  itemId: string;
  name: string;
  quantity: number;
  grade: number;
  healLabel: string;
  effectValue: string;
};

export type PartyRosterRow = {
  id: string;
  label: string;
  hp: number;
  maxHp: number;
  pct: number;
  dead: boolean;
};

type Props = {
  roster: PartyRosterRow[];
  potions: RecoveryPotion[];
  onUsePotion: (itemId: string, minionId: string) => void;
  busy: boolean;
  compact?: boolean;
};

export function DungeonPartyHpList(props: Props) {
  const { roster, potions, onUsePotion, busy, compact } = props;
  const canUsePotions = potions.length > 0;

  return (
    <ul className={`dungeon-party-hp-list ${compact ? "mt-1.5" : "mt-2"}`.trim()}>
      {roster.map((m) => {
        const healable = !m.dead && m.hp < m.maxHp;
        const missingHp = Math.max(0, m.maxHp - m.hp);
        const bestId = healable
          ? pickBestRecoveryPotion(missingHp, m.maxHp, potions)
          : null;

        return (
          <li key={m.id} className={`dungeon-party-hp-row${m.dead ? " dungeon-party-hp-row--dead" : ""}`.trim()}>
            <div className="dungeon-party-hp-head">
              <span className={`truncate font-semibold ${compact ? "text-[10px]" : "text-xs"}`}>{m.label}</span>
              <span
                className={`shrink-0 tabular-nums text-[var(--game-muted)] ${compact ? "text-[10px]" : "text-[11px]"}`}
              >
                {m.dead ? "전투불가" : `${m.hp}/${m.maxHp}`}
              </span>
            </div>
            <div className="dungeon-party-hp-actions">
              <div className="dungeon-hp-track flex-1" aria-hidden={m.dead}>
                <div
                  className={`dungeon-hp-fill${m.pct <= 30 ? " dungeon-hp-fill--low" : ""}`.trim()}
                  style={{ width: `${m.pct}%` }}
                />
              </div>
              {canUsePotions && healable ? (
                <div className="dungeon-potion-quick">
                  {bestId ? (
                    <GameBtn
                      variant="gold"
                      className={`dungeon-potion-quick__heal ${compact ? "h-6 px-1.5 text-[9px]" : "h-7 px-2 text-[10px]"}`}
                      disabled={busy}
                      onClick={() => onUsePotion(bestId, m.id)}
                    >
                      회복
                    </GameBtn>
                  ) : null}
                  {potions.map((p) => (
                    <button
                      key={p.itemId}
                      type="button"
                      className="dungeon-potion-quick__icon"
                      disabled={busy || p.quantity <= 0}
                      aria-label={`${p.name} ${p.healLabel}, ${p.quantity}개`}
                      onClick={() => onUsePotion(p.itemId, m.id)}
                    >
                      <ItemIcon itemId={p.itemId} size={compact ? 22 : 26} />
                      <span className="dungeon-potion-quick__qty">{p.quantity}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
