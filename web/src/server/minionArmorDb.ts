import type { Prisma, PrismaClient } from "@prisma/client";
import type { MinionArmorDbField } from "@/shared/minionEquipSlots";

type ArmorReadDb = Pick<PrismaClient, "$queryRaw"> | Prisma.TransactionClient;
type ArmorWriteDb = Pick<PrismaClient, "$queryRaw" | "$executeRaw"> | Prisma.TransactionClient;

export type MinionArmorIds = {
  equippedHelmetItemId: string | null;
  equippedChestItemId: string | null;
  equippedPantsItemId: string | null;
  equippedBootsItemId: string | null;
};

export type MinionArmorIdsRow = { id: string } & MinionArmorIds;

/** Prisma client 재생성 전에도 동작하도록 raw SQL 사용 */
export async function loadMinionArmorIdsForUser(tx: ArmorReadDb, userId: string): Promise<Map<string, MinionArmorIds>> {
  try {
    const rows = await tx.$queryRaw<MinionArmorIdsRow[]>`
      SELECT
        "id",
        "equippedHelmetItemId",
        "equippedChestItemId",
        "equippedPantsItemId",
        "equippedBootsItemId"
      FROM "Minion"
      WHERE "userId" = ${userId}
    `;
    return new Map(rows.map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

export async function loadMinionArmorIds(tx: ArmorReadDb, minionId: string): Promise<MinionArmorIds | null> {
  try {
    const rows = await tx.$queryRaw<MinionArmorIds[]>`
      SELECT
        "equippedHelmetItemId",
        "equippedChestItemId",
        "equippedPantsItemId",
        "equippedBootsItemId"
      FROM "Minion"
      WHERE "id" = ${minionId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function setMinionArmorSlot(
  tx: ArmorWriteDb,
  minionId: string,
  field: MinionArmorDbField,
  itemId: string | null,
) {
  switch (field) {
    case "equippedHelmetItemId":
      await tx.$executeRaw`
        UPDATE "Minion" SET "equippedHelmetItemId" = ${itemId} WHERE "id" = ${minionId}
      `;
      break;
    case "equippedChestItemId":
      await tx.$executeRaw`
        UPDATE "Minion" SET "equippedChestItemId" = ${itemId} WHERE "id" = ${minionId}
      `;
      break;
    case "equippedPantsItemId":
      await tx.$executeRaw`
        UPDATE "Minion" SET "equippedPantsItemId" = ${itemId} WHERE "id" = ${minionId}
      `;
      break;
    case "equippedBootsItemId":
      await tx.$executeRaw`
        UPDATE "Minion" SET "equippedBootsItemId" = ${itemId} WHERE "id" = ${minionId}
      `;
      break;
  }
}

export function armorIdsFromRow(row: MinionArmorIds | undefined | null) {
  return {
    equippedHelmetItemId: row?.equippedHelmetItemId ?? null,
    equippedChestItemId: row?.equippedChestItemId ?? null,
    equippedPantsItemId: row?.equippedPantsItemId ?? null,
    equippedBootsItemId: row?.equippedBootsItemId ?? null,
  };
}

export function getArmorFieldValue(row: MinionArmorIds, field: MinionArmorDbField): string | null {
  return row[field];
}
