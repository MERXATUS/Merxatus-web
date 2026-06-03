import type { PrismaClient } from "@prisma/client";
import { loadCatalogItemIdSet } from "@/server/catalogItems";

/** 카탈로그(items.json)에 없는 스택·장비 인스턴스 제거 */
export async function purgeOrphanInventory(
  db: Pick<PrismaClient, "inventoryStack" | "weaponInstance" | "armorInstance" | "listing">,
  input?: { userId?: string },
) {
  const catalog = await loadCatalogItemIdSet();
  const ids = [...catalog];
  const userFilter = input?.userId ? { userId: input.userId } : {};

  const stackWhere = {
    ...userFilter,
    itemId: { notIn: ids },
  };
  const instUser = input?.userId ? { userId: input.userId } : {};
  const weaponWhere = {
    ...instUser,
    baseItemId: { notIn: ids },
  };
  const armorWhere = {
    ...instUser,
    baseItemId: { notIn: ids },
  };
  const listingWhere = input?.userId
    ? { sellerId: input.userId, itemId: { notIn: ids } }
    : { itemId: { notIn: ids } };

  const [stacks, weapons, armors, listings] = await Promise.all([
    db.inventoryStack.deleteMany({ where: stackWhere }),
    db.weaponInstance.deleteMany({ where: weaponWhere }),
    db.armorInstance.deleteMany({ where: armorWhere }),
    db.listing.deleteMany({ where: listingWhere }),
  ]);

  return {
    stacks: stacks.count,
    weapons: weapons.count,
    armors: armors.count,
    listings: listings.count,
  };
}
