import type { Prisma } from "@prisma/client";
import { inventoryAvailableQty } from "@/shared/inventoryLock";

type StackTx = Pick<Prisma.TransactionClient, "inventoryStack">;

export function stackAvailableQty(stack: { quantity: number; lockedQuantity?: number | null }): number {
  return inventoryAvailableQty(stack);
}

/** 잠금 수량을 제외한 가용분만 차감 */
export async function takeAvailableFromStack(
  tx: StackTx,
  userId: string,
  itemId: string,
  qty: number,
): Promise<void> {
  const need = Math.max(0, Math.floor(qty));
  if (need <= 0) return;

  const stack = await tx.inventoryStack.findUnique({
    where: { userId_itemId: { userId, itemId } },
  });
  if (!stack || stack.quantity < need) throw new Error("INSUFFICIENT_ITEM");
  if (stackAvailableQty(stack) < need) throw new Error("ITEM_LOCKED");

  const nextQty = stack.quantity - need;
  if (nextQty <= 0) {
    await tx.inventoryStack.delete({ where: { userId_itemId: { userId, itemId } } });
    return;
  }

  const nextLocked = Math.min(Math.max(0, stack.lockedQuantity), nextQty);
  await tx.inventoryStack.update({
    where: { userId_itemId: { userId, itemId } },
    data: { quantity: nextQty, lockedQuantity: nextLocked },
  });
}

export async function adjustStackLockQuantity(
  tx: StackTx,
  userId: string,
  itemId: string,
  delta: number,
): Promise<{ quantity: number; lockedQuantity: number; availableQuantity: number }> {
  const change = Math.floor(delta);
  if (!Number.isFinite(change) || change === 0) throw new Error("BAD_REQUEST");

  const stack = await tx.inventoryStack.findUnique({
    where: { userId_itemId: { userId, itemId } },
  });
  if (!stack || stack.quantity <= 0) throw new Error("STACK_NOT_FOUND");

  const available = stackAvailableQty(stack);
  const locked = Math.max(0, stack.lockedQuantity);

  if (change > 0) {
    if (change > available) throw new Error("INSUFFICIENT_AVAILABLE");
  } else if (locked + change < 0) {
    throw new Error("INSUFFICIENT_LOCKED");
  }

  const nextLocked = locked + change;
  if (nextLocked > stack.quantity) throw new Error("BAD_LOCK_AMOUNT");

  const updated = await tx.inventoryStack.update({
    where: { userId_itemId: { userId, itemId } },
    data: { lockedQuantity: nextLocked },
    select: { quantity: true, lockedQuantity: true },
  });

  return {
    quantity: updated.quantity,
    lockedQuantity: updated.lockedQuantity,
    availableQuantity: stackAvailableQty(updated),
  };
}
