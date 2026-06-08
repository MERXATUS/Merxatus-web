/** 무기·방어구 인스턴스 합산 보유 상한 */
export const MAX_EQUIPMENT_OWNED = 100;

export function equipmentCapacityLabel(owned: number, max = MAX_EQUIPMENT_OWNED): string {
  return `장비 ${Math.max(0, Math.floor(owned))}/${max}`;
}
