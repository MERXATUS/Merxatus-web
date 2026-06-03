/**
 * items.json에 없는 스택·무기·방어구 인스턴스 DB 삭제
 *   node scripts/purge-orphan-inventory.mjs
 *   node scripts/purge-orphan-inventory.mjs --user <userId>
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function loadCatalogIds() {
  const p = path.join(process.cwd(), "data", "items.json");
  const items = JSON.parse(await readFile(p, "utf8"));
  return new Set(items.map((it) => String(it.id).trim().toLowerCase()));
}

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

async function main() {
  const catalog = await loadCatalogIds();
  const ids = [...catalog];
  const userId = getArg("--user");

  const userFilter = userId ? { userId } : {};
  const stackWhere = { ...userFilter, itemId: { notIn: ids } };
  const instUser = userId ? { userId } : {};
  const weaponWhere = { ...instUser, baseItemId: { notIn: ids } };
  const armorWhere = { ...instUser, baseItemId: { notIn: ids } };
  const listingWhere = userId
    ? { sellerId: userId, itemId: { notIn: ids } }
    : { itemId: { notIn: ids } };

  const stacks = await prisma.inventoryStack.deleteMany({ where: stackWhere });
  const weapons = await prisma.weaponInstance.deleteMany({ where: weaponWhere });
  const armors = await prisma.armorInstance.deleteMany({ where: armorWhere });
  const listings = await prisma.listing.deleteMany({ where: listingWhere });

  console.log(
    `OK: purged orphan inventory (catalog=${catalog.size} items${userId ? `, user=${userId}` : ", all users"})`,
  );
  console.log(
    `  stacks=${stacks.count} weapons=${weapons.count} armors=${armors.count} listings=${listings.count}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
