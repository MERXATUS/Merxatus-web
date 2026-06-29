"use client";

import { createPortal } from "react-dom";
import { useEffect } from "react";
import { MinionEquipDoll } from "@/app/_components/MinionEquipDoll";
import { GameBtn, GamePanelTitle } from "@/app/_components/gameUi";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { useEscapeClose } from "@/shared/useEscapeClose";

export type PartyPickMinionRow = {
  id: string;
  level: number;
  combatClassLabel: string;
  displayName?: string;
  nickname?: string | null;
  combatStats?: { combatPower: number };
  equippedWeapon?: {
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    grade: number;
  } | null;
};

type DungeonPartyPickModalProps = {
  open: boolean;
  maxParty: number;
  partyIds: Set<string>;
  minions: PartyPickMinionRow[];
  loading?: boolean;
  emptyLabel?: string;
  onClose: () => void;
  onToggle: (id: string, on: boolean) => void;
  onConfirm: () => void;
};

export function DungeonPartyPickModal({
  open,
  maxParty,
  partyIds,
  minions,
  loading = false,
  emptyLabel = "미니언이 없습니다.",
  onClose,
  onToggle,
  onConfirm,
}: DungeonPartyPickModalProps) {
  useEscapeClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="dungeon-party-pick-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dungeon-party-pick-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="game-panel dungeon-party-pick-panel w-full max-w-3xl p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GamePanelTitle id="dungeon-party-pick-title">파티 편성 · 최대 {maxParty}명</GamePanelTitle>
        <p className="mt-1 text-xs text-[var(--game-muted)]">
          카드를 눌러 파티에 넣으세요. 장비 슬롯에 아이콘이 보이면 착용 중입니다.
        </p>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--game-muted)]">불러오는 중…</p>
        ) : minions.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--game-muted)]">{emptyLabel}</p>
        ) : (
          <div className="dungeon-party-pick-grid mt-3">
            {minions.map((m) => {
              const on = partyIds.has(m.id);
              const cap = maxParty > 1 && partyIds.size >= maxParty && !on;
              const disabled = cap;
              const weapon = m.equippedWeapon;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  className={[
                    "dungeon-party-pick-card",
                    on ? "dungeon-party-pick-card--selected" : "",
                    disabled && !on ? "dungeon-party-pick-card--disabled" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (disabled) return;
                    onToggle(m.id, !on);
                  }}
                >
                  <div className="dungeon-party-pick-card__head">
                    <span className="dungeon-party-pick-card__job">{m.displayName ?? m.combatClassLabel}</span>
                    <span className="dungeon-party-pick-card__level">Lv{m.level}</span>
                    {m.combatStats ? (
                      <span className="text-[10px] font-semibold text-[var(--game-gold-bright)]">
                        CP {m.combatStats.combatPower}
                      </span>
                    ) : null}
                  </div>
                  <div className="dungeon-party-pick-card__doll">
                    <MinionEquipDoll
                      compact
                      equipment={{
                        weapon: weapon
                          ? {
                              baseItemId: weapon.baseItemId,
                              name: weapon.name,
                              enhanceLevel: weapon.enhanceLevel,
                              grade: weapon.grade,
                            }
                          : null,
                      }}
                    />
                  </div>
                  <p className="dungeon-party-pick-card__weapon-line">
                    {weapon ? (
                      <span className={itemGradeNameClassName(weapon.grade ?? 1)}>
                        {weapon.name}
                        {weapon.enhanceLevel > 0 ? ` +${weapon.enhanceLevel}` : ""}
                      </span>
                    ) : (
                      <span className="dungeon-party-pick-card__weapon-line--empty">무기 미착용</span>
                    )}
                  </p>
                  {on ? (
                    <span className="dungeon-party-pick-card__tag dungeon-party-pick-card__tag--pick">파티</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <GameBtn variant="ghost" className="h-10 flex-1" onClick={onClose}>
            취소
          </GameBtn>
          <GameBtn variant="primary" className="h-10 flex-1" onClick={onConfirm}>
            완료 ({partyIds.size}/{maxParty})
          </GameBtn>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function partyPickChips(minions: PartyPickMinionRow[], partyIds: Iterable<string>) {
  const out: Array<{ id: string; label: string }> = [];
  for (const id of partyIds) {
    const m = minions.find((x) => x.id === id);
    if (!m) continue;
    out.push({ id, label: `${m.displayName ?? m.combatClassLabel} Lv${m.level}` });
  }
  return out;
}
