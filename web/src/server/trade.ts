import type { Prisma } from "@prisma/client";
import { prisma, PRISMA_TX_OPTS } from "@/server/db";
import { assertCanGrantEquipment } from "@/server/equipmentCapacity";

export type TradeSide = "A" | "B";

export type TradeOfferItemInput =
  | { kind: "STACK"; itemId: string; quantity: number }
  | { kind: "WEAPON_INSTANCE"; weaponInstanceId: string }
  | { kind: "ARMOR_INSTANCE"; armorInstanceId: string };

function clampGold(n: unknown) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(2_000_000_000, x));
}

function clampQty(n: unknown) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1_000_000, x));
}

function isExpired(t: { expiresAt: Date }) {
  return t.expiresAt.getTime() <= Date.now();
}

export async function createTradeSession(input: { userId: string; counterpartyUsername: string }) {
  const me = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, username: true } });
  if (!me) throw new Error("USER_NOT_FOUND");
  const other = await prisma.user.findUnique({
    where: { username: input.counterpartyUsername.trim() },
    select: { id: true, username: true },
  });
  if (!other) throw new Error("TRADE_USER_NOT_FOUND");
  if (other.id === me.id) throw new Error("TRADE_CANNOT_SELF");

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const trade = await prisma.tradeSession.create({
    data: { userAId: me.id, userBId: other.id, expiresAt },
    select: { id: true },
  });
  return { ok: true as const, tradeId: trade.id, expiresAt: expiresAt.toISOString() };
}

export async function getTradeSessionForUser(input: { userId: string; tradeId: string }) {
  const t = await prisma.tradeSession.findUnique({
    where: { id: input.tradeId },
    include: {
      userA: { select: { id: true, username: true } },
      userB: { select: { id: true, username: true } },
      items: true,
      escrowStacks: true,
    },
  });
  if (!t) throw new Error("TRADE_NOT_FOUND");
  if (t.userAId !== input.userId && t.userBId !== input.userId) throw new Error("FORBIDDEN");
  return { ok: true as const, trade: t };
}

function sideForUser(t: { userAId: string; userBId: string }, userId: string): TradeSide {
  if (t.userAId === userId) return "A";
  if (t.userBId === userId) return "B";
  throw new Error("FORBIDDEN");
}

export async function updateTradeOffer(input: {
  userId: string;
  tradeId: string;
  offeredGold: number;
  items: TradeOfferItemInput[];
}) {
  const offeredGold = clampGold(input.offeredGold);
  const items = (input.items ?? []).slice(0, 40);

  return prisma.$transaction(async (tx) => {
    const t = await tx.tradeSession.findUnique({ where: { id: input.tradeId } });
    if (!t) throw new Error("TRADE_NOT_FOUND");
    if (t.status !== "PENDING") throw new Error("TRADE_NOT_EDITABLE");
    if (isExpired(t)) throw new Error("TRADE_EXPIRED");

    const side = sideForUser(t, input.userId);
    if ((side === "A" && t.lockedA) || (side === "B" && t.lockedB)) throw new Error("TRADE_LOCKED");

    // 상대 잠금 해제 (상대가 잠긴 상태면 변경으로 풀림)
    await tx.tradeSession.update({
      where: { id: t.id },
      data:
        side === "A"
          ? { offeredGoldA: offeredGold, lockedB: false, confirmedBAt: null }
          : { offeredGoldB: offeredGold, lockedA: false, confirmedAAt: null },
    });

    // 내 오퍼 아이템 초기화
    await tx.tradeOfferItem.deleteMany({ where: { tradeId: t.id, side } });

    // 아이템 추가 (기본 유효성만)
    for (const it of items) {
      if (it.kind === "STACK") {
        const q = clampQty(it.quantity);
        if (!it.itemId?.trim() || q <= 0) continue;
        await tx.tradeOfferItem.create({
          data: { tradeId: t.id, side, kind: "STACK", itemId: it.itemId.trim(), quantity: q },
        });
        continue;
      }
      if (it.kind === "WEAPON_INSTANCE") {
        await tx.tradeOfferItem.create({
          data: { tradeId: t.id, side, kind: "WEAPON_INSTANCE", weaponInstanceId: it.weaponInstanceId },
        });
        continue;
      }
      if (it.kind === "ARMOR_INSTANCE") {
        await tx.tradeOfferItem.create({
          data: { tradeId: t.id, side, kind: "ARMOR_INSTANCE", armorInstanceId: it.armorInstanceId },
        });
      }
    }

    return { ok: true as const };
  }, PRISMA_TX_OPTS);
}

async function escrowStacksForSide(
  tx: Prisma.TransactionClient,
  input: { tradeId: string; userId: string; side: TradeSide },
) {
  const offerStacks = await tx.tradeOfferItem.findMany({
    where: { tradeId: input.tradeId, side: input.side, kind: "STACK" },
    select: { itemId: true, quantity: true },
    take: 100,
  });

  for (const s of offerStacks) {
    const itemId = (s.itemId ?? "").trim();
    const qty = Math.max(0, Math.floor(s.quantity ?? 0));
    if (!itemId || qty <= 0) continue;

    const stack = await tx.inventoryStack.findUnique({
      where: { userId_itemId: { userId: input.userId, itemId } },
    });
    if (!stack || stack.quantity < qty) throw new Error("INSUFFICIENT_ITEM");

    // decrement first, then record escrow
    if (stack.quantity === qty) {
      await tx.inventoryStack.delete({ where: { userId_itemId: { userId: input.userId, itemId } } });
    } else {
      await tx.inventoryStack.update({
        where: { userId_itemId: { userId: input.userId, itemId } },
        data: { quantity: { decrement: qty } },
      });
    }

    await tx.tradeEscrowStack.upsert({
      where: { tradeId_userId_itemId: { tradeId: input.tradeId, userId: input.userId, itemId } },
      create: { tradeId: input.tradeId, userId: input.userId, itemId, quantity: qty },
      update: { quantity: { increment: qty } },
    });
  }
}

async function lockInstancesForSide(
  tx: Prisma.TransactionClient,
  input: { tradeId: string; userId: string; side: TradeSide },
) {
  const items = await tx.tradeOfferItem.findMany({
    where: {
      tradeId: input.tradeId,
      side: input.side,
      kind: { in: ["WEAPON_INSTANCE", "ARMOR_INSTANCE"] },
    },
    select: { kind: true, weaponInstanceId: true, armorInstanceId: true },
    take: 100,
  });

  for (const it of items) {
    if (it.kind === "WEAPON_INSTANCE") {
      const id = it.weaponInstanceId;
      if (!id) continue;
      const w = await tx.weaponInstance.findUnique({ where: { id }, select: { id: true, userId: true, status: true } });
      if (!w || w.userId !== input.userId) throw new Error("WEAPON_INSTANCE_NOT_FOUND");
      if (w.status !== "OWNED") throw new Error("WEAPON_NOT_OWNED");
      continue;
    }
    if (it.kind === "ARMOR_INSTANCE") {
      const id = it.armorInstanceId;
      if (!id) continue;
      const a = await tx.armorInstance.findUnique({ where: { id }, select: { id: true, userId: true, status: true } });
      if (!a || a.userId !== input.userId) throw new Error("ARMOR_INSTANCE_NOT_FOUND");
      if (a.status !== "OWNED") throw new Error("ARMOR_INSTANCE_NOT_AVAILABLE");
    }
  }
}

export async function lockTradeSide(input: { userId: string; tradeId: string }) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.tradeSession.findUnique({ where: { id: input.tradeId } });
    if (!t) throw new Error("TRADE_NOT_FOUND");
    if (t.status !== "PENDING") throw new Error("TRADE_NOT_EDITABLE");
    if (isExpired(t)) throw new Error("TRADE_EXPIRED");

    const side = sideForUser(t, input.userId);
    if ((side === "A" && t.lockedA) || (side === "B" && t.lockedB)) return { ok: true as const };

    const offeredGold = side === "A" ? t.offeredGoldA : t.offeredGoldB;
    const wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
    if (!wallet) throw new Error("WALLET_NOT_FOUND");
    if (wallet.goldAvailable < offeredGold) throw new Error("INSUFFICIENT_GOLD");

    // lock items validity and escrow stacks
    await lockInstancesForSide(tx, { tradeId: t.id, userId: input.userId, side });
    await escrowStacksForSide(tx, { tradeId: t.id, userId: input.userId, side });

    if (offeredGold > 0) {
      await tx.wallet.update({
        where: { userId: input.userId },
        data: { goldAvailable: { decrement: offeredGold }, goldLocked: { increment: offeredGold } },
      });
    }

    await tx.tradeSession.update({
      where: { id: t.id },
      data:
        side === "A"
          ? { lockedA: true, lockedGoldA: offeredGold, confirmedAAt: null }
          : { lockedB: true, lockedGoldB: offeredGold, confirmedBAt: null },
    });

    const after = await tx.tradeSession.findUnique({ where: { id: t.id } });
    if (after?.lockedA && after.lockedB) {
      await tx.tradeSession.update({ where: { id: t.id }, data: { status: "LOCKED" } });
    }

    return { ok: true as const };
  }, PRISMA_TX_OPTS);
}

async function refundEscrowForSide(tx: Prisma.TransactionClient, input: { tradeId: string; userId: string; side: TradeSide }) {
  const gold = input.side === "A" ? "lockedGoldA" : "lockedGoldB";
  const t = await tx.tradeSession.findUnique({ where: { id: input.tradeId } });
  if (!t) return;
  const lockedGold = gold === "lockedGoldA" ? t.lockedGoldA : t.lockedGoldB;
  if (lockedGold > 0) {
    await tx.wallet.update({
      where: { userId: input.userId },
      data: { goldLocked: { decrement: lockedGold }, goldAvailable: { increment: lockedGold } },
    });
  }

  const esc = await tx.tradeEscrowStack.findMany({
    where: { tradeId: input.tradeId, userId: input.userId },
    select: { itemId: true, quantity: true },
    take: 200,
  });
  for (const row of esc) {
    const qty = Math.max(0, Math.floor(row.quantity ?? 0));
    if (!row.itemId || qty <= 0) continue;
    await tx.inventoryStack.upsert({
      where: { userId_itemId: { userId: input.userId, itemId: row.itemId } },
      create: { userId: input.userId, itemId: row.itemId, quantity: qty },
      update: { quantity: { increment: qty } },
    });
  }
  await tx.tradeEscrowStack.deleteMany({ where: { tradeId: input.tradeId, userId: input.userId } });
}

export async function cancelTrade(input: { userId: string; tradeId: string }) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.tradeSession.findUnique({ where: { id: input.tradeId } });
    if (!t) throw new Error("TRADE_NOT_FOUND");
    if (t.userAId !== input.userId && t.userBId !== input.userId) throw new Error("FORBIDDEN");
    if (t.status === "COMPLETED") throw new Error("TRADE_ALREADY_COMPLETED");

    const sideA = { tradeId: t.id, userId: t.userAId, side: "A" as const };
    const sideB = { tradeId: t.id, userId: t.userBId, side: "B" as const };
    await refundEscrowForSide(tx, sideA);
    await refundEscrowForSide(tx, sideB);

    await tx.tradeOfferItem.deleteMany({ where: { tradeId: t.id } });
    await tx.tradeSession.update({ where: { id: t.id }, data: { status: "CANCELLED" } });
    return { ok: true as const };
  }, PRISMA_TX_OPTS);
}

export async function confirmTrade(input: { userId: string; tradeId: string }) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.tradeSession.findUnique({ where: { id: input.tradeId } });
    if (!t) throw new Error("TRADE_NOT_FOUND");
    if (t.status !== "LOCKED") throw new Error("TRADE_NOT_LOCKED");
    if (isExpired(t)) throw new Error("TRADE_EXPIRED");
    const side = sideForUser(t, input.userId);
    if (!(side === "A" ? t.lockedA : t.lockedB)) throw new Error("TRADE_NOT_LOCKED");

    const now = new Date();
    await tx.tradeSession.update({
      where: { id: t.id },
      data: side === "A" ? { confirmedAAt: now } : { confirmedBAt: now },
    });

    const after = await tx.tradeSession.findUnique({ where: { id: t.id } });
    if (!after?.confirmedAAt || !after.confirmedBAt) return { ok: true as const, completed: false as const };

    // settle
    const grossA = after.lockedGoldA;
    const grossB = after.lockedGoldB;

    const feeBps = 500; // fixed 5%
    const feeA = feeSplit(grossA, feeBps).feeGold;
    const feeB = feeSplit(grossB, feeBps).feeGold;
    const netA = grossA - feeA;
    const netB = grossB - feeB;

    // move gold: A paid grossA into locked. It goes to B available netA, feeA burned. Same for B->A.
    if (grossA > 0) {
      await tx.wallet.update({ where: { userId: after.userAId }, data: { goldLocked: { decrement: grossA } } });
      await tx.wallet.upsert({
        where: { userId: after.userBId },
        create: { userId: after.userBId, goldAvailable: netA, goldLocked: 0 },
        update: { goldAvailable: { increment: netA } },
      });
    }
    if (grossB > 0) {
      await tx.wallet.update({ where: { userId: after.userBId }, data: { goldLocked: { decrement: grossB } } });
      await tx.wallet.upsert({
        where: { userId: after.userAId },
        create: { userId: after.userAId, goldAvailable: netB, goldLocked: 0 },
        update: { goldAvailable: { increment: netB } },
      });
    }

    // escrow stacks: transfer ownership by moving inventory quantities to counterparty
    const esc = await tx.tradeEscrowStack.findMany({
      where: { tradeId: after.id },
      select: { userId: true, itemId: true, quantity: true },
      take: 500,
    });
    for (const row of esc) {
      const qty = Math.max(0, Math.floor(row.quantity ?? 0));
      if (!row.itemId || qty <= 0) continue;
      const toUser = row.userId === after.userAId ? after.userBId : after.userAId;
      await tx.inventoryStack.upsert({
        where: { userId_itemId: { userId: toUser, itemId: row.itemId } },
        create: { userId: toUser, itemId: row.itemId, quantity: qty },
        update: { quantity: { increment: qty } },
      });
    }
    await tx.tradeEscrowStack.deleteMany({ where: { tradeId: after.id } });

    // transfer instances: simply change userId
    const items = await tx.tradeOfferItem.findMany({
      where: { tradeId: after.id, kind: { in: ["WEAPON_INSTANCE", "ARMOR_INSTANCE"] } },
      select: { side: true, kind: true, weaponInstanceId: true, armorInstanceId: true },
      take: 200,
    });
    const incomingEquipment = new Map<string, number>();
    for (const it of items) {
      const toUser = it.side === "A" ? after.userBId : after.userAId;
      if (it.kind === "WEAPON_INSTANCE" && it.weaponInstanceId) {
        incomingEquipment.set(toUser, (incomingEquipment.get(toUser) ?? 0) + 1);
      } else if (it.kind === "ARMOR_INSTANCE" && it.armorInstanceId) {
        incomingEquipment.set(toUser, (incomingEquipment.get(toUser) ?? 0) + 1);
      }
    }
    for (const [toUser, add] of incomingEquipment) {
      await assertCanGrantEquipment(tx, toUser, add);
    }
    for (const it of items) {
      const fromUser = it.side === "A" ? after.userAId : after.userBId;
      const toUser = it.side === "A" ? after.userBId : after.userAId;
      if (it.kind === "WEAPON_INSTANCE" && it.weaponInstanceId) {
        await tx.weaponInstance.update({ where: { id: it.weaponInstanceId }, data: { userId: toUser } });
        continue;
      }
      if (it.kind === "ARMOR_INSTANCE" && it.armorInstanceId) {
        await tx.armorInstance.update({ where: { id: it.armorInstanceId }, data: { userId: toUser } });
      }
      void fromUser;
    }

    await tx.tradeOfferItem.deleteMany({ where: { tradeId: after.id } });
    await tx.tradeSession.update({ where: { id: after.id }, data: { status: "COMPLETED" } });

    return {
      ok: true as const,
      completed: true as const,
      fees: { feeA, feeB },
    };
  }, PRISMA_TX_OPTS);
}

function feeSplit(grossGold: number, feeBps: number) {
  const feeGold = Math.floor((grossGold * feeBps) / 10_000);
  const netGold = grossGold - feeGold;
  return { feeGold, netGold };
}

