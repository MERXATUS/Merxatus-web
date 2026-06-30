import type { Prisma } from "@prisma/client";
import { resolveDisplayItemGrade } from "@/server/itemGrade";
import { assertEquipmentNotUserLocked } from "@/server/inventoryEquipmentLock";
import { grantLootToUser } from "@/server/grantLootToUser";
import { MAX_SALVAGE_BATCH, mergeSalvageRows, previewSalvageLoot } from "@/shared/equipmentSalvage";

export { MAX_SALVAGE_BATCH };

type SalvageTx = Prisma.TransactionClient;
type EquipKind = "weapon" | "armor";

export type EquipmentSalvageResult = {
  ok: true;
  kind: EquipKind;
  instanceId: string;
  loot: Array<{ itemId: string; qty: number }>;
};

export type BatchSalvageTarget = { kind: EquipKind; instanceId: string };

export type BatchEquipmentSalvageResult = {
  ok: true;
  salvagedCount: number;
  loot: Array<{ itemId: string; qty: number }>;
};

type LoadedSalvageRow = {
  kind: EquipKind;
  grade: number;
  enhanceLevel: number;
  instanceId: string;
};

const ARMOR_EQUIP_FIELDS = [
  "equippedHelmetInstanceId",
  "equippedChestInstanceId",
  "equippedPantsInstanceId",
  "equippedBootsInstanceId",
] as const;

function dedupeSalvageTargets(targets: BatchSalvageTarget[]): BatchSalvageTarget[] {
  const seen = new Set<string>();
  const out: BatchSalvageTarget[] = [];
  for (const t of targets) {
    const key = `${t.kind}:${t.instanceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

async function loadEquippedInstanceIds(
  tx: SalvageTx,
  userId: string,
  weaponIds: string[],
  armorIds: string[],
) {
  const equippedWeaponIds = new Set<string>();
  const equippedArmorIds = new Set<string>();

  if (weaponIds.length > 0) {
    const rows = await tx.minion.findMany({
      where: { userId, equippedWeaponInstanceId: { in: weaponIds } },
      select: { equippedWeaponInstanceId: true },
    });
    for (const row of rows) {
      if (row.equippedWeaponInstanceId) equippedWeaponIds.add(row.equippedWeaponInstanceId);
    }
  }

  if (armorIds.length > 0) {
    const rows = await tx.minion.findMany({
      where: {
        userId,
        OR: [
          { equippedHelmetInstanceId: { in: armorIds } },
          { equippedChestInstanceId: { in: armorIds } },
          { equippedPantsInstanceId: { in: armorIds } },
          { equippedBootsInstanceId: { in: armorIds } },
        ],
      },
      select: {
        equippedHelmetInstanceId: true,
        equippedChestInstanceId: true,
        equippedPantsInstanceId: true,
        equippedBootsInstanceId: true,
      },
    });
    const armorIdSet = new Set(armorIds);
    for (const row of rows) {
      for (const field of ARMOR_EQUIP_FIELDS) {
        const id = row[field];
        if (id && armorIdSet.has(id)) equippedArmorIds.add(id);
      }
    }
  }

  return { equippedWeaponIds, equippedArmorIds };
}

/** N건 분해도 DB 왕복은 고정(무기·방어구 일괄 조회 + 착용 확인 + deleteMany) */
async function loadAndValidateSalvageTargets(
  tx: SalvageTx,
  userId: string,
  targets: BatchSalvageTarget[],
): Promise<LoadedSalvageRow[]> {
  const weaponIds = targets.filter((t) => t.kind === "weapon").map((t) => t.instanceId);
  const armorIds = targets.filter((t) => t.kind === "armor").map((t) => t.instanceId);

  const weapons =
    weaponIds.length > 0
      ? await tx.weaponInstance.findMany({
          where: { id: { in: weaponIds }, userId },
          include: { baseItem: true, listing: { select: { id: true } } },
        })
      : [];
  const armors =
    armorIds.length > 0
      ? await tx.armorInstance.findMany({
          where: { id: { in: armorIds }, userId },
          include: { baseItem: true },
        })
      : [];

  const weaponById = new Map(weapons.map((w) => [w.id, w]));
  const armorById = new Map(armors.map((a) => [a.id, a]));

  const { equippedWeaponIds, equippedArmorIds } = await loadEquippedInstanceIds(
    tx,
    userId,
    weaponIds,
    armorIds,
  );

  const loaded: LoadedSalvageRow[] = [];
  for (const t of targets) {
    if (t.kind === "weapon") {
      const w = weaponById.get(t.instanceId);
      if (!w) throw new Error("NOT_FOUND");
      if (w.status !== "OWNED" || w.listing) throw new Error("EQUIPMENT_LOCKED");
      assertEquipmentNotUserLocked(w);
      if (equippedWeaponIds.has(t.instanceId)) throw new Error("EQUIPMENT_EQUIPPED");
      loaded.push({
        kind: "weapon",
        grade: resolveDisplayItemGrade(w.baseItemId, w.baseItem.grade),
        enhanceLevel: w.enhanceLevel ?? 0,
        instanceId: w.id,
      });
      continue;
    }

    const a = armorById.get(t.instanceId);
    if (!a) throw new Error("NOT_FOUND");
    if (a.status !== "OWNED") throw new Error("EQUIPMENT_LOCKED");
    assertEquipmentNotUserLocked(a);
    if (equippedArmorIds.has(t.instanceId)) throw new Error("EQUIPMENT_EQUIPPED");
    loaded.push({
      kind: "armor",
      grade: resolveDisplayItemGrade(a.baseItemId, a.baseItem.grade),
      enhanceLevel: a.enhanceLevel ?? 0,
      instanceId: a.id,
    });
  }

  return loaded;
}

export function salvageLootForEquipment(grade: number, enhanceLevel: number, rnd = Math.random()) {
  return mergeSalvageRows(previewSalvageLoot({ grade, enhanceLevel, rnd }));
}

export async function attemptBatchEquipmentSalvage(
  tx: SalvageTx,
  input: { userId: string; targets: BatchSalvageTarget[] },
): Promise<BatchEquipmentSalvageResult> {
  const targets = dedupeSalvageTargets(input.targets);
  if (targets.length === 0) throw new Error("BAD_REQUEST");
  if (targets.length > MAX_SALVAGE_BATCH) throw new Error("SALVAGE_BATCH_TOO_LARGE");

  const loaded = await loadAndValidateSalvageTargets(tx, input.userId, targets);

  const loot = mergeSalvageRows(
    loaded.flatMap((row) => salvageLootForEquipment(row.grade, row.enhanceLevel)),
  );

  const weaponIds = loaded.filter((r) => r.kind === "weapon").map((r) => r.instanceId);
  const armorIds = loaded.filter((r) => r.kind === "armor").map((r) => r.instanceId);

  if (weaponIds.length > 0) {
    await tx.weaponInstance.deleteMany({
      where: { id: { in: weaponIds }, userId: input.userId },
    });
  }
  if (armorIds.length > 0) {
    await tx.armorInstance.deleteMany({
      where: { id: { in: armorIds }, userId: input.userId },
    });
  }

  await grantLootToUser(tx, input.userId, loot);

  return { ok: true, salvagedCount: loaded.length, loot };
}

export async function attemptEquipmentSalvage(
  tx: SalvageTx,
  input: { userId: string; kind: EquipKind; instanceId: string },
): Promise<EquipmentSalvageResult> {
  const batch = await attemptBatchEquipmentSalvage(tx, {
    userId: input.userId,
    targets: [{ kind: input.kind, instanceId: input.instanceId }],
  });
  return {
    ok: true,
    kind: input.kind,
    instanceId: input.instanceId,
    loot: batch.loot,
  };
}
