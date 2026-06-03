import type { PrismaClient } from "@prisma/client";
import { readItemsJson } from "@/server/adminData";
import { invalidateCatalogItemCache } from "@/server/catalogItems";
import { clampItemGrade, defaultItemGradeForItemId } from "@/server/itemGrade";
import { rollOptionsForLootDrop, serializeOptions } from "@/server/itemOptions";

type ItemDb = Pick<
  PrismaClient,
  "item" | "inventoryStack" | "weaponInstance" | "armorInstance"
>;

type LootEntry = { itemId: string; qty: number };

let itemDefById: Map<
  string,
  { id: string; name: string; category: string; tradable: boolean; grade?: number }
> | null = null;

async function loadItemDefMap() {
  if (itemDefById) return itemDefById;
  const { data } = await readItemsJson();
  itemDefById = new Map(data.map((it) => [it.id, it]));
  return itemDefById;
}

export function invalidateItemDefCache() {
  itemDefById = null;
  invalidateCatalogItemCache();
}

function equipmentCategory(itemId: string, category: string): "weapon" | "armor" | null {
  const id = itemId.trim().toLowerCase();
  const cat = category.trim();
  if (cat === "무기" || id.startsWith("weapon_")) return "weapon";
  if (cat === "방어구" || id.startsWith("armor_")) return "armor";
  return null;
}

function lootOptionsJson(category: "weapon" | "armor", grade: number) {
  const catLabel = category === "weapon" ? "무기" : "방어구";
  const opts = rollOptionsForLootDrop({ category: catLabel, itemGrade: grade });
  return serializeOptions(opts);
}

/** items.json 정의를 DB Item 행으로 보장 (시드 없이 JSON만 추가된 경우) */
export async function ensureItemInDb(db: Pick<PrismaClient, "item">, itemId: string) {
  const existing = await db.item.findUnique({ where: { id: itemId }, select: { id: true } });
  if (existing) return;

  const def = (await loadItemDefMap()).get(itemId);
  if (!def) throw new Error(`UNKNOWN_ITEM:${itemId}`);

  const grade = clampItemGrade(def.grade ?? defaultItemGradeForItemId(def.id));
  await db.item.upsert({
    where: { id: def.id },
    create: {
      id: def.id,
      name: def.name,
      category: def.category,
      tradable: def.tradable,
      grade,
    },
    update: {
      name: def.name,
      category: def.category,
      tradable: def.tradable,
      grade,
    },
  });
}

/** 인벤/장비 인스턴스 지급 — Item FK 없으면 items.json에서 자동 upsert */
export async function grantLootToUser(db: ItemDb, userId: string, loot: LootEntry[]) {
  const defs = await loadItemDefMap();

  for (const x of loot) {
    if (x.qty <= 0) continue;
    await ensureItemInDb(db, x.itemId);

    const item =
      (await db.item.findUnique({ where: { id: x.itemId } })) ??
      defs.get(x.itemId);
    if (!item) continue;

    const grade = clampItemGrade(item.grade ?? defaultItemGradeForItemId(x.itemId));
    const equip = equipmentCategory(x.itemId, item.category);

    if (equip === "weapon") {
      for (let i = 0; i < x.qty; i++) {
        await db.weaponInstance.create({
          data: {
            userId,
            baseItemId: x.itemId,
            enhanceLevel: 0,
            optionsJson: lootOptionsJson("weapon", grade),
          },
        });
      }
      continue;
    }

    if (equip === "armor") {
      for (let i = 0; i < x.qty; i++) {
        await db.armorInstance.create({
          data: {
            userId,
            baseItemId: x.itemId,
            optionsJson: lootOptionsJson("armor", grade),
          },
        });
      }
      continue;
    }

    await db.inventoryStack.upsert({
      where: { userId_itemId: { userId, itemId: x.itemId } },
      create: { userId, itemId: x.itemId, quantity: x.qty },
      update: { quantity: { increment: x.qty } },
    });
  }
}
