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

async function assertSalvageAllowed(tx: SalvageTx, userId: string, kind: EquipKind, instanceId: string) {
  if (kind === "weapon") {
    const w = await tx.weaponInstance.findUnique({
      where: { id: instanceId },
      include: { baseItem: true, listing: { select: { id: true } } },
    });
    if (!w) throw new Error("NOT_FOUND");
    if (w.userId !== userId) throw new Error("FORBIDDEN");
    if (w.status !== "OWNED" || w.listing) throw new Error("EQUIPMENT_LOCKED");
    assertEquipmentNotUserLocked(w);
    const equipped = await tx.minion.findFirst({
      where: { userId, equippedWeaponInstanceId: instanceId },
      select: { id: true },
    });
    if (equipped) throw new Error("EQUIPMENT_EQUIPPED");
    return {
      kind: "weapon" as const,
      grade: resolveDisplayItemGrade(w.baseItemId, w.baseItem.grade),
      enhanceLevel: w.enhanceLevel ?? 0,
      row: w,
    };
  }

  const a = await tx.armorInstance.findUnique({
    where: { id: instanceId },
    include: { baseItem: true },
  });
  if (!a) throw new Error("NOT_FOUND");
  if (a.userId !== userId) throw new Error("FORBIDDEN");
  if (a.status !== "OWNED") throw new Error("EQUIPMENT_LOCKED");
  assertEquipmentNotUserLocked(a);
  const equipped = await tx.minion.findFirst({
    where: {
      userId,
      OR: [
        { equippedHelmetInstanceId: instanceId },
        { equippedChestInstanceId: instanceId },
        { equippedPantsInstanceId: instanceId },
        { equippedBootsInstanceId: instanceId },
      ],
    },
    select: { id: true },
  });
  if (equipped) throw new Error("EQUIPMENT_EQUIPPED");
  return {
    kind: "armor" as const,
    grade: resolveDisplayItemGrade(a.baseItemId, a.baseItem.grade),
    enhanceLevel: a.enhanceLevel ?? 0,
    row: a,
  };
}

export function salvageLootForEquipment(grade: number, enhanceLevel: number, rnd = Math.random()) {
  return mergeSalvageRows(previewSalvageLoot({ grade, enhanceLevel, rnd }));
}

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

export async function attemptBatchEquipmentSalvage(
  tx: SalvageTx,
  input: { userId: string; targets: BatchSalvageTarget[] },
): Promise<BatchEquipmentSalvageResult> {
  const targets = dedupeSalvageTargets(input.targets);
  if (targets.length === 0) throw new Error("BAD_REQUEST");
  if (targets.length > MAX_SALVAGE_BATCH) throw new Error("SALVAGE_BATCH_TOO_LARGE");

  const loaded = await Promise.all(
    targets.map((t) => assertSalvageAllowed(tx, input.userId, t.kind, t.instanceId)),
  );

  const loot = mergeSalvageRows(
    loaded.flatMap((row) => salvageLootForEquipment(row.grade, row.enhanceLevel)),
  );

  for (const row of loaded) {
    if (row.kind === "weapon") {
      await tx.weaponInstance.delete({ where: { id: row.row.id } });
    } else {
      await tx.armorInstance.delete({ where: { id: row.row.id } });
    }
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
