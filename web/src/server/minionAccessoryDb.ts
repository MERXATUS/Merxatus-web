import type { Prisma, PrismaClient } from "@prisma/client";
import type { MinionAccessoryDbField, MinionAccessorySlotId } from "@/shared/minionEquipSlots";
import { accessorySlotToDbField } from "@/shared/minionEquipSlots";

type AccessoryReadDb = Pick<PrismaClient, "$queryRaw"> | Prisma.TransactionClient;
type AccessoryWriteDb = Pick<PrismaClient, "$executeRaw"> | Prisma.TransactionClient;

export type MinionAccessoryIds = Record<MinionAccessoryDbField, string | null>;

export type MinionAccessoryIdsRow = { id: string } & MinionAccessoryIds;

const ACCESSORY_FIELDS: MinionAccessoryDbField[] = [
  "equippedRing1ItemId",
  "equippedRing2ItemId",
  "equippedNecklaceItemId",
  "equippedNecklace2ItemId",
  "equippedRelicItemId",
  "equippedRelic2ItemId",
  "equippedRelic3ItemId",
];

export const EMPTY_ACCESSORY_IDS: MinionAccessoryIds = {
  equippedRing1ItemId: null,
  equippedRing2ItemId: null,
  equippedNecklaceItemId: null,
  equippedNecklace2ItemId: null,
  equippedRelicItemId: null,
  equippedRelic2ItemId: null,
  equippedRelic3ItemId: null,
};

export function accessoryIdsFromRow(row: Partial<MinionAccessoryIds> | null | undefined): MinionAccessoryIds {
  return {
    equippedRing1ItemId: row?.equippedRing1ItemId ?? null,
    equippedRing2ItemId: row?.equippedRing2ItemId ?? null,
    equippedNecklaceItemId: row?.equippedNecklaceItemId ?? null,
    equippedNecklace2ItemId: row?.equippedNecklace2ItemId ?? null,
    equippedRelicItemId: row?.equippedRelicItemId ?? null,
    equippedRelic2ItemId: row?.equippedRelic2ItemId ?? null,
    equippedRelic3ItemId: row?.equippedRelic3ItemId ?? null,
  };
}

export function accessorySlotsFromIds(row: MinionAccessoryIds): Partial<Record<MinionAccessorySlotId, string | null>> {
  return {
    ring1: row.equippedRing1ItemId,
    ring2: row.equippedRing2ItemId,
    necklace: row.equippedNecklaceItemId,
    necklace2: row.equippedNecklace2ItemId,
    relic: row.equippedRelicItemId,
    relic2: row.equippedRelic2ItemId,
    relic3: row.equippedRelic3ItemId,
  };
}

export async function loadMinionAccessoryIds(tx: AccessoryReadDb, minionId: string): Promise<MinionAccessoryIds | null> {
  try {
    const rows = await tx.$queryRaw<MinionAccessoryIds[]>`
      SELECT
        "equippedRing1ItemId",
        "equippedRing2ItemId",
        "equippedNecklaceItemId",
        "equippedNecklace2ItemId",
        "equippedRelicItemId",
        "equippedRelic2ItemId",
        "equippedRelic3ItemId"
      FROM "Minion"
      WHERE "id" = ${minionId}
      LIMIT 1
    `;
    return rows[0] ? accessoryIdsFromRow(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function loadMinionAccessoryIdsForUser(
  tx: AccessoryReadDb,
  userId: string,
): Promise<Map<string, MinionAccessoryIds>> {
  try {
    const rows = await tx.$queryRaw<MinionAccessoryIdsRow[]>`
      SELECT
        "id",
        "equippedRing1ItemId",
        "equippedRing2ItemId",
        "equippedNecklaceItemId",
        "equippedNecklace2ItemId",
        "equippedRelicItemId",
        "equippedRelic2ItemId",
        "equippedRelic3ItemId"
      FROM "Minion"
      WHERE "userId" = ${userId}
    `;
    return new Map(rows.map((r) => [r.id, accessoryIdsFromRow(r)]));
  } catch {
    return new Map();
  }
}

export async function setMinionAccessorySlot(
  tx: AccessoryWriteDb,
  minionId: string,
  field: MinionAccessoryDbField,
  itemId: string | null,
) {
  switch (field) {
    case "equippedRing1ItemId":
      await tx.$executeRaw`UPDATE "Minion" SET "equippedRing1ItemId" = ${itemId} WHERE "id" = ${minionId}`;
      break;
    case "equippedRing2ItemId":
      await tx.$executeRaw`UPDATE "Minion" SET "equippedRing2ItemId" = ${itemId} WHERE "id" = ${minionId}`;
      break;
    case "equippedNecklaceItemId":
      await tx.$executeRaw`UPDATE "Minion" SET "equippedNecklaceItemId" = ${itemId} WHERE "id" = ${minionId}`;
      break;
    case "equippedNecklace2ItemId":
      await tx.$executeRaw`UPDATE "Minion" SET "equippedNecklace2ItemId" = ${itemId} WHERE "id" = ${minionId}`;
      break;
    case "equippedRelicItemId":
      await tx.$executeRaw`UPDATE "Minion" SET "equippedRelicItemId" = ${itemId} WHERE "id" = ${minionId}`;
      break;
    case "equippedRelic2ItemId":
      await tx.$executeRaw`UPDATE "Minion" SET "equippedRelic2ItemId" = ${itemId} WHERE "id" = ${minionId}`;
      break;
    case "equippedRelic3ItemId":
      await tx.$executeRaw`UPDATE "Minion" SET "equippedRelic3ItemId" = ${itemId} WHERE "id" = ${minionId}`;
      break;
  }
}

export function getAccessoryFieldValue(row: MinionAccessoryIds, slotId: MinionAccessorySlotId): string | null {
  const field = accessorySlotToDbField(slotId);
  return row[field];
}

export { ACCESSORY_FIELDS };
