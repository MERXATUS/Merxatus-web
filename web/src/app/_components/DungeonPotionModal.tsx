"use client";

import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn } from "@/app/_components/gameUi";
import type { PartyRosterRow, RecoveryPotion } from "@/app/_components/DungeonPartyHpList";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { pickBestRecoveryPotion } from "@/shared/potionEffects";
import { useEscapeClose } from "@/shared/useEscapeClose";

type Props = {
  open: boolean;
  roster: PartyRosterRow[];
  potions: RecoveryPotion[];
  busy: boolean;
  onClose: () => void;
  onUsePotion: (itemId: string, minionId: string) => void;
};

/** 물약 사용 — 파티원·물약 한 화면에서 선택 */
export function DungeonPotionModal(props: Props) {
  const { open, roster, potions, busy, onClose, onUsePotion } = props;
  useEscapeClose(open, onClose);
  if (!open) return null;

  const healable = roster.filter((m) => !m.dead && m.hp < m.maxHp);

  function useBest(m: PartyRosterRow) {
    const missing = Math.max(0, m.maxHp - m.hp);
    const itemId = pickBestRecoveryPotion(missing, m.maxHp, potions);
    if (itemId) onUsePotion(itemId, m.id);
  }

  return (
    <div
      className="dungeon-settlement-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dungeon-potion-modal-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="game-panel dungeon-pending-loot-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="dungeon-potion-modal-title" className="game-panel-title">
          물약 사용
        </h2>
        <p className="dungeon-settlement__subtitle">
          {potions.length === 0
            ? "인벤토리에 회복 물약이 없습니다."
            : "파티원을 고른 뒤 물약을 누르거나, 추천 회복을 사용하세요."}
        </p>
        <div className="dungeon-settlement-modal__scroll mt-2 min-h-0 flex-1">
          {healable.length === 0 ? (
            <p className="dungeon-settlement__empty">회복이 필요한 파티원이 없습니다.</p>
          ) : (
            <ul className="dungeon-potion-modal__party">
              {healable.map((m) => {
                const missing = Math.max(0, m.maxHp - m.hp);
                const bestId = pickBestRecoveryPotion(missing, m.maxHp, potions);
                return (
                  <li key={m.id} className="dungeon-potion-modal__member">
                    <div className="dungeon-potion-modal__member-head">
                      <span className="truncate text-sm font-semibold">{m.label}</span>
                      <span className="shrink-0 text-xs tabular-nums text-[var(--game-muted)]">
                        {m.hp}/{m.maxHp}
                      </span>
                    </div>
                    <div className="dungeon-hp-track mb-2" aria-hidden>
                      <div
                        className={`dungeon-hp-fill${m.pct <= 30 ? " dungeon-hp-fill--low" : ""}`.trim()}
                        style={{ width: `${m.pct}%` }}
                      />
                    </div>
                    {bestId ? (
                      <GameBtn
                        variant="gold"
                        className="mb-2 h-8 w-full text-xs"
                        disabled={busy}
                        onClick={() => useBest(m)}
                      >
                        추천 회복
                      </GameBtn>
                    ) : null}
                    <div className="dungeon-potion-modal__potions">
                      {potions.map((p) => (
                        <button
                          key={`${m.id}-${p.itemId}`}
                          type="button"
                          className="dungeon-potion-menu__item"
                          disabled={busy || p.quantity <= 0}
                          onClick={() => onUsePotion(p.itemId, m.id)}
                        >
                          <ItemIcon itemId={p.itemId} size={32} />
                          <span className="min-w-0 flex-1 text-left">
                            <span
                              className={`block truncate text-xs font-semibold ${itemGradeNameClassName(p.grade)}`}
                            >
                              {p.name}
                            </span>
                            <span className="block text-[10px] text-[var(--game-muted)]">{p.healLabel}</span>
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-[var(--game-muted)]">
                            ×{p.quantity}
                          </span>
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <GameBtn variant="ghost" className="mt-4 h-10 w-full shrink-0 text-sm" onClick={onClose}>
          닫기
        </GameBtn>
      </div>
    </div>
  );
}
