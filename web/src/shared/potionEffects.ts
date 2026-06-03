export type PotionEffectType = "HP_Recovery";

export type PotionEffectDef = {
  name: string;
  grade: number;
  effectType: PotionEffectType;
  effectValue: string;
};

/** `data/potion_effects.json`과 동기 — 클라이언트 표시용 */
export const RECOVERY_POTION_ITEM_IDS = [
  "item_lesser_recovery_potion",
  "item_recovery_potion",
  "item_greater_recovery_flask",
] as const;

export function parseHpRecoveryValue(effectValue: string, maxHp: number): number {
  const raw = effectValue.trim();
  if (raw.endsWith("%")) {
    const pct = Number(raw.slice(0, -1));
    if (!Number.isFinite(pct) || pct <= 0) return 0;
    return Math.max(1, Math.floor((maxHp * pct) / 100));
  }
  const flat = Number(raw);
  if (!Number.isFinite(flat) || flat <= 0) return 0;
  return Math.floor(flat);
}

export function computeHpRecoveryAmount(maxHp: number, effectValue: string): number {
  return parseHpRecoveryValue(effectValue, Math.max(1, maxHp));
}

export function formatPotionHealLabel(effectValue: string): string {
  const raw = effectValue.trim();
  if (raw.endsWith("%")) return `HP ${raw} 회복`;
  return `HP +${raw}`;
}

export function potionTooltipLine(effectValue: string): string {
  return `던전 탐험 중 파티 HP를 회복합니다. (${formatPotionHealLabel(effectValue)})`;
}

export type RecoveryPotionPick = {
  itemId: string;
  quantity: number;
  effectValue: string;
};

/** 남은 HP에 맞춰 낭비가 적은 물약 id 선택 (없으면 null) */
export function pickBestRecoveryPotion(
  missingHp: number,
  maxHp: number,
  potions: RecoveryPotionPick[],
): string | null {
  if (missingHp <= 0) return null;
  const available = potions.filter((p) => p.quantity > 0);
  if (!available.length) return null;

  const scored = available
    .map((p) => ({
      itemId: p.itemId,
      heal: computeHpRecoveryAmount(maxHp, p.effectValue),
    }))
    .filter((x) => x.heal > 0);
  if (!scored.length) return null;

  const sufficient = scored.filter((s) => s.heal >= missingHp).sort((a, b) => a.heal - b.heal);
  if (sufficient.length) return sufficient[0]!.itemId;
  return scored.sort((a, b) => b.heal - a.heal)[0]!.itemId;
}

export type HealableMember = { id: string; hp: number; maxHp: number; dead: boolean };

/** 회복이 필요한 파티원 중 HP 비율이 가장 낮은 id */
export function pickLowestHpMemberId(roster: HealableMember[]): string | null {
  const healable = roster.filter((m) => !m.dead && m.hp < m.maxHp);
  if (!healable.length) return null;
  return healable.sort((a, b) => a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp))[0]!.id;
}
