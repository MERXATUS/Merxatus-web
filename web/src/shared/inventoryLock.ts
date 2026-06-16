/** 인벤 스택 — 잠금 제외 가용 수량 */
export function inventoryAvailableQty(stack: { quantity: number; lockedQuantity?: number | null }): number {
  const total = Math.max(0, Math.floor(stack.quantity));
  const locked = Math.max(0, Math.floor(stack.lockedQuantity ?? 0));
  return Math.max(0, total - locked);
}
