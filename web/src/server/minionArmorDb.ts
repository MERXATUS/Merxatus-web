import type { Prisma, PrismaClient } from "@prisma/client";
import type { MinionArmorDbField } from "@/shared/minionEquipSlots";
import type { MinionArmorLoadout } from "@/shared/minionCombatStats";

type ArmorReadDb = Pick<PrismaClient, "$queryRaw"> | Prisma.TransactionClient;
type ArmorWriteDb = Pick<PrismaClient, "$queryRaw" | "$executeRaw"> | Prisma.TransactionClient;

export type MinionArmorIds = {
  equippedHelmetItemId: string | null;
  equippedChestItemId: string | null;
  equippedPantsItemId: string | null;
  equippedBootsItemId: string | null;
  equippedHelmetInstanceId: string | null;
  equippedChestInstanceId: string | null;
  equippedPantsInstanceId: string | null;
  equippedBootsInstanceId: string | null;
};

export type MinionArmorIdsRow = { id: string } & MinionArmorIds;

export async function loadMinionArmorIdsForUser(tx: ArmorReadDb, userId: string): Promise<Map<string, MinionArmorIds>> {
  try {
    const rows = await tx.$queryRaw<MinionArmorIdsRow[]>`
      SELECT
        "id",
        "equippedHelmetItemId",
        "equippedChestItemId",
        "equippedPantsItemId",
        "equippedBootsItemId",
        "equippedHelmetInstanceId",
        "equippedChestInstanceId",
        "equippedPantsInstanceId",
        "equippedBootsInstanceId"
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
        "equippedBootsItemId",
        "equippedHelmetInstanceId",
        "equippedChestInstanceId",
        "equippedPantsInstanceId",
        "equippedBootsInstanceId"
      FROM "Minion"
      WHERE "id" = ${minionId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export function instanceFieldForArmorSlot(field: MinionArmorDbField): keyof MinionArmorIds {
  switch (field) {
    case "equippedHelmetItemId":
      return "equippedHelmetInstanceId";
    case "equippedChestItemId":
      return "equippedChestInstanceId";
    case "equippedPantsItemId":
      return "equippedPantsInstanceId";
    case "equippedBootsItemId":
      return "equippedBootsInstanceId";
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
        UPDATE "Minion" SET "equippedHelmetItemId" = ${itemId}, "equippedHelmetInstanceId" = NULL WHERE "id" = ${minionId}
      `;
      break;
    case "equippedChestItemId":
      await tx.$executeRaw`
        UPDATE "Minion" SET "equippedChestItemId" = ${itemId}, "equippedChestInstanceId" = NULL WHERE "id" = ${minionId}
      `;
      break;
    case "equippedPantsItemId":
      await tx.$executeRaw`
        UPDATE "Minion" SET "equippedPantsItemId" = ${itemId}, "equippedPantsInstanceId" = NULL WHERE "id" = ${minionId}
      `;
      break;
    case "equippedBootsItemId":
      await tx.$executeRaw`
        UPDATE "Minion" SET "equippedBootsItemId" = ${itemId}, "equippedBootsInstanceId" = NULL WHERE "id" = ${minionId}
      `;
      break;
  }
}

export async function setMinionArmorInstanceSlot(
  tx: ArmorWriteDb,
  minionId: string,
  field: MinionArmorDbField,
  instanceId: string | null,
) {
  switch (field) {
    case "equippedHelmetItemId":
      await tx.$executeRaw`
        UPDATE "Minion" SET "equippedHelmetInstanceId" = ${instanceId}, "equippedHelmetItemId" = NULL WHERE "id" = ${minionId}
      `;
      break;
    case "equippedChestItemId":
      await tx.$executeRaw`
        UPDATE "Minion" SET "equippedChestInstanceId" = ${instanceId}, "equippedChestItemId" = NULL WHERE "id" = ${minionId}
      `;
      break;
    case "equippedPantsItemId":
      await tx.$executeRaw`
        UPDATE "Minion" SET "equippedPantsInstanceId" = ${instanceId}, "equippedPantsItemId" = NULL WHERE "id" = ${minionId}
      `;
      break;
    case "equippedBootsItemId":
      await tx.$executeRaw`
        UPDATE "Minion" SET "equippedBootsInstanceId" = ${instanceId}, "equippedBootsItemId" = NULL WHERE "id" = ${minionId}
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
    equippedHelmetInstanceId: row?.equippedHelmetInstanceId ?? null,
    equippedChestInstanceId: row?.equippedChestInstanceId ?? null,
    equippedPantsInstanceId: row?.equippedPantsInstanceId ?? null,
    equippedBootsInstanceId: row?.equippedBootsInstanceId ?? null,
  };
}

export function getArmorFieldValue(row: MinionArmorIds, field: MinionArmorDbField): string | null {
  return row[field];
}

export function getArmorInstanceFieldValue(row: MinionArmorIds, field: MinionArmorDbField): string | null {
  const instField = instanceFieldForArmorSlot(field);
  return row[instField];
}

export function buildArmorLoadoutFromIds(
  armorIds: MinionArmorIds,
  instancesById: Map<string, { baseItemId: string; optionsJson: string }>,
): MinionArmorLoadout {
  const slotMap: Array<["helmet" | "armor" | "pants" | "shoes", keyof MinionArmorIds, keyof MinionArmorIds]> = [
    ["helmet", "equippedHelmetInstanceId", "equippedHelmetItemId"],
    ["armor", "equippedChestInstanceId", "equippedChestItemId"],
    ["pants", "equippedPantsInstanceId", "equippedPantsItemId"],
    ["shoes", "equippedBootsInstanceId", "equippedBootsItemId"],
  ];
  const out: MinionArmorLoadout = {};
  for (const [slot, instField, itemField] of slotMap) {
    const instId = armorIds[instField];
    if (instId) {
      const inst = instancesById.get(instId);
      if (inst) {
        out[slot] = { itemId: inst.baseItemId, optionsJson: inst.optionsJson };
        continue;
      }
    }
    const itemId = armorIds[itemField];
    out[slot] = itemId ? { itemId } : null;
  }
  return out;
}

type ArmorInstanceCombatRow = { baseItemId: string; optionsJson: string };

export async function loadArmorInstanceMapForIds(
  tx: Pick<PrismaClient, "armorInstance">,
  userId: string,
  armorIds: MinionArmorIds,
): Promise<Map<string, ArmorInstanceCombatRow>> {
  const ids = [
    armorIds.equippedHelmetInstanceId,
    armorIds.equippedChestInstanceId,
    armorIds.equippedPantsInstanceId,
    armorIds.equippedBootsInstanceId,
  ].filter((id): id is string => !!id);
  if (!ids.length) return new Map();
  const rows = await tx.armorInstance.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, baseItemId: true, optionsJson: true },
    take: 20,
  });
  return new Map(rows.map((r) => [r.id, { baseItemId: r.baseItemId, optionsJson: r.optionsJson }]));
}
