import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";

async function feeBpsForSeller(userId: string) {
  // 명예 점수로 경매장 수수료 감면
  //  - 50k: 1%p 감면, 150k: 3%p 감면, 300k: 5%p 감면
  //  - 최저 수수료: 1% (100bps)
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "honorPoints" as honorPoints FROM "User" WHERE "id" = ? LIMIT 1`,
    userId,
  )) as any[];
  const honor = Math.max(0, Math.floor(rows?.[0]?.honorPoints ?? 0));
  const discountBps = honor >= 300_000 ? 500 : honor >= 150_000 ? 300 : honor >= 50_000 ? 100 : 0;
  const base = GAME_RULES.market.feeBps;
  return Math.max(100, base - discountBps);
}

function feeSplit(grossGold: number, feeBps: number) {
  const feeGold = Math.floor((grossGold * feeBps) / 10_000);
  const netGold = grossGold - feeGold;
  return { feeGold, netGold };
}

export async function buyFixedListing(input: { listingId: string; buyerId: string }) {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new Error("LISTING_NOT_FOUND");
    if (listing.status !== "ACTIVE") throw new Error("LISTING_NOT_ACTIVE");
    if (listing.saleType !== "FIXED") throw new Error("LISTING_NOT_FIXED");
    const hasTotal = listing.fixedPriceTotal != null && listing.fixedPriceTotal > 0;
    const hasUnit = listing.fixedPricePerUnit != null && listing.fixedPricePerUnit > 0;
    if (!hasTotal && !hasUnit) throw new Error("INVALID_PRICE");

    if (listing.sellerId === input.buyerId) throw new Error("CANNOT_BUY_OWN_LISTING");

    const buyerWallet = await tx.wallet.findUnique({ where: { userId: input.buyerId } });
    if (!buyerWallet) throw new Error("BUYER_WALLET_NOT_FOUND");
    // full buy by default (kept for backward-compat)
    const buyQty = listing.quantity;
    const grossGold = hasTotal ? listing.fixedPriceTotal! : listing.fixedPricePerUnit! * buyQty;
    if (buyerWallet.goldAvailable < grossGold) throw new Error("INSUFFICIENT_GOLD");

    const feeBps = await feeBpsForSeller(listing.sellerId);
    const { feeGold, netGold } = feeSplit(grossGold, feeBps);

    await tx.wallet.update({
      where: { userId: input.buyerId },
      data: { goldAvailable: { decrement: grossGold } },
    });

    await tx.wallet.upsert({
      where: { userId: listing.sellerId },
      create: { userId: listing.sellerId, goldAvailable: netGold, goldLocked: 0 },
      update: { goldAvailable: { increment: netGold } },
    });

    await tx.inventoryStack.upsert({
      where: { userId_itemId: { userId: input.buyerId, itemId: listing.itemId } },
      create: { userId: input.buyerId, itemId: listing.itemId, quantity: buyQty },
      update: { quantity: { increment: buyQty } },
    });

    await tx.listing.update({
      where: { id: listing.id },
      data: { status: "SOLD" },
    });

    await tx.transaction.create({
      data: {
        listingId: listing.id,
        buyerId: input.buyerId,
        sellerId: listing.sellerId,
        itemId: listing.itemId,
        quantity: buyQty,
        saleType: listing.saleType,
        grossGold,
        feeGold,
        netGold,
      },
    });

    return { ok: true as const };
  });
}

export async function buyFixedListingPartial(input: { listingId: string; buyerId: string; quantity: number }) {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new Error("LISTING_NOT_FOUND");
    if (listing.status !== "ACTIVE") throw new Error("LISTING_NOT_ACTIVE");
    if (listing.saleType !== "FIXED") throw new Error("LISTING_NOT_FIXED");
    const hasTotal = listing.fixedPriceTotal != null && listing.fixedPriceTotal > 0;
    const hasUnit = listing.fixedPricePerUnit != null && listing.fixedPricePerUnit > 0;
    if (!hasTotal && !hasUnit) throw new Error("INVALID_PRICE");
    if (listing.sellerId === input.buyerId) throw new Error("CANNOT_BUY_OWN_LISTING");

    const isWeapon = listing.weaponInstanceId != null;
    const buyQty = Math.floor(input.quantity);
    if (buyQty <= 0) throw new Error("INVALID_QUANTITY");
    if (buyQty > listing.quantity) throw new Error("INSUFFICIENT_LISTING_QTY");
    if (isWeapon) {
      if (listing.quantity !== 1) throw new Error("WEAPON_LISTING_QTY_INVALID");
      if (buyQty !== 1) throw new Error("MUST_BUY_ALL");
    } else {
      if (hasTotal && buyQty !== listing.quantity) throw new Error("MUST_BUY_ALL");
    }

    const buyerWallet = await tx.wallet.findUnique({ where: { userId: input.buyerId } });
    if (!buyerWallet) throw new Error("BUYER_WALLET_NOT_FOUND");

    const grossGold = hasTotal ? listing.fixedPriceTotal! : listing.fixedPricePerUnit! * buyQty;
    if (buyerWallet.goldAvailable < grossGold) throw new Error("INSUFFICIENT_GOLD");

    const feeBps = await feeBpsForSeller(listing.sellerId);
    const { feeGold, netGold } = feeSplit(grossGold, feeBps);

    await tx.wallet.update({
      where: { userId: input.buyerId },
      data: { goldAvailable: { decrement: grossGold } },
    });

    await tx.wallet.upsert({
      where: { userId: listing.sellerId },
      create: { userId: listing.sellerId, goldAvailable: netGold, goldLocked: 0 },
      update: { goldAvailable: { increment: netGold } },
    });

    if (isWeapon) {
      const inst = await tx.weaponInstance.findUnique({ where: { id: listing.weaponInstanceId! } });
      if (!inst) throw new Error("WEAPON_INSTANCE_NOT_FOUND");
      if (inst.userId !== listing.sellerId) throw new Error("WEAPON_OWNER_MISMATCH");
      if (inst.status !== "LISTED") throw new Error("WEAPON_NOT_LISTED");
      await tx.weaponInstance.update({
        where: { id: inst.id },
        data: { userId: input.buyerId, status: "OWNED" },
      });
    } else {
      await tx.inventoryStack.upsert({
        where: { userId_itemId: { userId: input.buyerId, itemId: listing.itemId } },
        create: { userId: input.buyerId, itemId: listing.itemId, quantity: buyQty },
        update: { quantity: { increment: buyQty } },
      });
    }

    const remaining = listing.quantity - buyQty;
    await tx.listing.update({
      where: { id: listing.id },
      data: {
        quantity: remaining,
        status: remaining === 0 ? "SOLD" : "ACTIVE",
      },
    });

    await tx.transaction.create({
      data: {
        listingId: listing.id,
        buyerId: input.buyerId,
        sellerId: listing.sellerId,
        itemId: listing.itemId,
        quantity: buyQty,
        saleType: listing.saleType,
        grossGold,
        feeGold,
        netGold,
      },
    });

    return { ok: true as const, bought: buyQty, remaining, grossGold, itemId: listing.itemId };
  });
}

export async function placeAuctionBid(input: { listingId: string; bidderId: string; amount: number }) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const listing = await tx.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new Error("LISTING_NOT_FOUND");
    if (listing.status !== "ACTIVE") throw new Error("LISTING_NOT_ACTIVE");
    if (listing.saleType !== "AUCTION") throw new Error("LISTING_NOT_AUCTION");
    if (!listing.endsAt) throw new Error("AUCTION_ENDS_AT_MISSING");
    if (!listing.startPrice || listing.startPrice <= 0) throw new Error("AUCTION_START_PRICE_INVALID");
    if (listing.endsAt.getTime() <= now.getTime()) throw new Error("AUCTION_ENDED");

    if (listing.sellerId === input.bidderId) throw new Error("CANNOT_BID_OWN_LISTING");

    const current = listing.highestBid ?? listing.startPrice;
    const minInc = Math.max(
      GAME_RULES.auction.minBid.fixedIncrement,
      Math.ceil(current * GAME_RULES.auction.minBid.percent),
    );
    const minBid = current + minInc;
    if (input.amount < minBid) throw new Error("BID_TOO_LOW");

    const bidderWallet = await tx.wallet.findUnique({ where: { userId: input.bidderId } });
    if (!bidderWallet) throw new Error("BIDDER_WALLET_NOT_FOUND");
    if (bidderWallet.goldAvailable < input.amount) throw new Error("INSUFFICIENT_GOLD");

    // Lock new bidder amount
    await tx.wallet.update({
      where: { userId: input.bidderId },
      data: {
        goldAvailable: { decrement: input.amount },
        goldLocked: { increment: input.amount },
      },
    });

    // Refund previous highest bidder
    if (listing.highestBidderId && listing.highestBid) {
      await tx.wallet.update({
        where: { userId: listing.highestBidderId },
        data: {
          goldAvailable: { increment: listing.highestBid },
          goldLocked: { decrement: listing.highestBid },
        },
      });
    }

    let newEndsAt = listing.endsAt;
    const msLeft = listing.endsAt.getTime() - now.getTime();
    if (msLeft <= GAME_RULES.auction.extendWindowSeconds * 1000) {
      newEndsAt = new Date(listing.endsAt.getTime() + GAME_RULES.auction.extendBySeconds * 1000);
    }

    await tx.listing.update({
      where: { id: listing.id },
      data: {
        highestBid: input.amount,
        highestBidderId: input.bidderId,
        endsAt: newEndsAt,
      },
    });

    await tx.bid.create({
      data: { listingId: listing.id, bidderId: input.bidderId, amount: input.amount },
    });

    return { ok: true as const, endsAt: newEndsAt };
  });
}

export async function settleAuctionListing(input: { listingId: string }) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const listing = await tx.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new Error("LISTING_NOT_FOUND");
    if (listing.saleType !== "AUCTION") throw new Error("LISTING_NOT_AUCTION");
    if (listing.status !== "ACTIVE") throw new Error("LISTING_NOT_ACTIVE");
    if (!listing.endsAt) throw new Error("AUCTION_ENDS_AT_MISSING");
    if (listing.endsAt.getTime() > now.getTime()) throw new Error("AUCTION_NOT_ENDED");

    const isWeapon = listing.weaponInstanceId != null;
    // No bids -> return item to seller (escrowed quantity)
    if (!listing.highestBidderId || !listing.highestBid) {
      if (isWeapon) {
        const inst = await tx.weaponInstance.findUnique({ where: { id: listing.weaponInstanceId! } });
        if (inst && inst.userId === listing.sellerId) {
          await tx.weaponInstance.update({ where: { id: inst.id }, data: { status: "OWNED" } });
        }
      } else {
        await tx.inventoryStack.upsert({
          where: { userId_itemId: { userId: listing.sellerId, itemId: listing.itemId } },
          create: { userId: listing.sellerId, itemId: listing.itemId, quantity: listing.quantity },
          update: { quantity: { increment: listing.quantity } },
        });
      }

      await tx.listing.update({ where: { id: listing.id }, data: { status: "EXPIRED" } });
      return { ok: true as const, status: "EXPIRED" as const };
    }

    if (listing.highestBidderId === listing.sellerId) throw new Error("CANNOT_SETTLE_SELLER_AS_WINNER");

    const bidderWallet = await tx.wallet.findUnique({ where: { userId: listing.highestBidderId } });
    if (!bidderWallet) throw new Error("BIDDER_WALLET_NOT_FOUND");
    if (bidderWallet.goldLocked < listing.highestBid) throw new Error("BID_LOCK_MISMATCH");

    const feeBps = await feeBpsForSeller(listing.sellerId);
    const { feeGold, netGold } = feeSplit(listing.highestBid, feeBps);

    // Consume locked gold (finalize payment)
    await tx.wallet.update({
      where: { userId: listing.highestBidderId },
      data: {
        goldLocked: { decrement: listing.highestBid },
      },
    });

    // Pay seller
    await tx.wallet.upsert({
      where: { userId: listing.sellerId },
      create: { userId: listing.sellerId, goldAvailable: netGold, goldLocked: 0 },
      update: { goldAvailable: { increment: netGold } },
    });

    // Give item to winner
    if (isWeapon) {
      const inst = await tx.weaponInstance.findUnique({ where: { id: listing.weaponInstanceId! } });
      if (!inst) throw new Error("WEAPON_INSTANCE_NOT_FOUND");
      if (inst.userId !== listing.sellerId) throw new Error("WEAPON_OWNER_MISMATCH");
      if (inst.status !== "LISTED") throw new Error("WEAPON_NOT_LISTED");
      await tx.weaponInstance.update({ where: { id: inst.id }, data: { userId: listing.highestBidderId, status: "OWNED" } });
    } else {
      await tx.inventoryStack.upsert({
        where: { userId_itemId: { userId: listing.highestBidderId, itemId: listing.itemId } },
        create: { userId: listing.highestBidderId, itemId: listing.itemId, quantity: listing.quantity },
        update: { quantity: { increment: listing.quantity } },
      });
    }

    await tx.listing.update({ where: { id: listing.id }, data: { status: "SOLD" } });

    await tx.transaction.create({
      data: {
        listingId: listing.id,
        buyerId: listing.highestBidderId,
        sellerId: listing.sellerId,
        itemId: listing.itemId,
        quantity: listing.quantity,
        saleType: listing.saleType,
        grossGold: listing.highestBid,
        feeGold,
        netGold,
      },
    });

    return { ok: true as const, status: "SOLD" as const, winnerId: listing.highestBidderId };
  });
}

export async function createListing(input: {
  sellerId: string;
  itemId: string;
  quantity: number;
  weaponInstanceId?: string;
  saleType: "FIXED" | "AUCTION";
  fixedPricePerUnit?: number;
  fixedPriceTotal?: number;
  startPrice?: number;
}) {
  return prisma.$transaction(async (tx) => {
    if (input.quantity <= 0) throw new Error("INVALID_QUANTITY");

    const item = await tx.item.findUnique({ where: { id: input.itemId } });
    if (!item) throw new Error("ITEM_NOT_FOUND");
    if (!item.tradable) throw new Error("ITEM_NOT_TRADABLE");

    const isWeapon = input.weaponInstanceId != null;
    if (isWeapon) {
      if (input.quantity !== 1) throw new Error("WEAPON_LISTING_QTY_INVALID");
      const inst = await tx.weaponInstance.findUnique({
        where: { id: input.weaponInstanceId! },
        include: { baseItem: true },
      });
      if (!inst) throw new Error("WEAPON_INSTANCE_NOT_FOUND");
      if (inst.userId !== input.sellerId) throw new Error("INSUFFICIENT_ITEM");
      if (inst.status !== "OWNED") throw new Error("WEAPON_NOT_OWNED");
      if (inst.baseItem.category !== "무기") throw new Error("NOT_A_WEAPON");
      const equipped = await tx.minion.findFirst({
        where: { userId: input.sellerId, equippedWeaponInstanceId: inst.id },
        select: { id: true },
      });
      if (equipped) throw new Error("WEAPON_EQUIPPED");
      // override itemId to baseItemId for stats/search
      input.itemId = inst.baseItemId;
    } else {
      const stack = await tx.inventoryStack.findUnique({
        where: { userId_itemId: { userId: input.sellerId, itemId: input.itemId } },
      });
      if (!stack || stack.quantity < input.quantity) throw new Error("INSUFFICIENT_ITEM");
    }

    if (input.saleType === "FIXED") {
      const hasTotal = input.fixedPriceTotal != null && input.fixedPriceTotal > 0;
      const hasUnit = input.fixedPricePerUnit != null && input.fixedPricePerUnit > 0;
      if (hasTotal === hasUnit) throw new Error("INVALID_PRICE_MODE");
    } else {
      if (!input.startPrice || input.startPrice <= 0) throw new Error("AUCTION_START_PRICE_INVALID");
    }

    // Escrow
    if (isWeapon) {
      await tx.weaponInstance.update({ where: { id: input.weaponInstanceId! }, data: { status: "LISTED" } });
    } else {
      await tx.inventoryStack.update({
        where: { userId_itemId: { userId: input.sellerId, itemId: input.itemId } },
        data: { quantity: { decrement: input.quantity } },
      });
    }

    const createdAt = new Date();
    const listing = await tx.listing.create({
      data: {
        saleType: input.saleType,
        status: "ACTIVE",
        sellerId: input.sellerId,
        itemId: input.itemId,
        quantity: input.quantity,
        weaponInstanceId: input.weaponInstanceId ?? null,
        fixedPricePerUnit:
          input.saleType === "FIXED" && input.fixedPricePerUnit != null && input.fixedPricePerUnit > 0
            ? input.fixedPricePerUnit
            : null,
        fixedPriceTotal:
          input.saleType === "FIXED" && input.fixedPriceTotal != null && input.fixedPriceTotal > 0
            ? input.fixedPriceTotal
            : null,
        startPrice: input.saleType === "AUCTION" ? input.startPrice! : null,
        endsAt:
          input.saleType === "AUCTION"
            ? new Date(createdAt.getTime() + GAME_RULES.auction.baseDurationSeconds * 1000)
            : null,
        highestBid: null,
        highestBidderId: null,
      },
    });

    return { ok: true as const, listingId: listing.id };
  });
}

export async function cancelListing(input: { listingId: string; sellerId: string }) {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new Error("LISTING_NOT_FOUND");
    if (listing.sellerId !== input.sellerId) throw new Error("FORBIDDEN");
    if (listing.status !== "ACTIVE") throw new Error("LISTING_NOT_ACTIVE");

    if (listing.saleType === "AUCTION" && listing.highestBidderId && listing.highestBid) {
      // Refund current highest bidder if any
      await tx.wallet.update({
        where: { userId: listing.highestBidderId },
        data: {
          goldAvailable: { increment: listing.highestBid },
          goldLocked: { decrement: listing.highestBid },
        },
      });
    }

    const isWeapon = listing.weaponInstanceId != null;
    // Return escrowed items to seller
    if (isWeapon) {
      const inst = await tx.weaponInstance.findUnique({ where: { id: listing.weaponInstanceId! } });
      if (inst && inst.userId === listing.sellerId) {
        await tx.weaponInstance.update({ where: { id: inst.id }, data: { status: "OWNED" } });
      }
    } else {
      await tx.inventoryStack.upsert({
        where: { userId_itemId: { userId: listing.sellerId, itemId: listing.itemId } },
        create: { userId: listing.sellerId, itemId: listing.itemId, quantity: listing.quantity },
        update: { quantity: { increment: listing.quantity } },
      });
    }

    await tx.listing.update({ where: { id: listing.id }, data: { status: "CANCELLED" } });
    return { ok: true as const };
  });
}

