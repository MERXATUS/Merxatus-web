import type { Prisma, PrismaClient } from "@prisma/client";
import { weaponCombatBonusFromOptions } from "@/server/itemOptions";
import { assertEquipmentNotUserLocked } from "@/server/inventoryEquipmentLock";
import { attachIcons, getItemIconMap } from "@/server/itemCatalog";
import { itemGradeViewForItem } from "@/server/itemGrade";
import { invalidateUserCombatMetaCache } from "@/server/minionCombatBuild";
import {
  codexMilestoneDef,
  instanceMeetsCodexMilestone,
  EQUIPMENT_CODEX_MILESTONES,
} from "@/shared/equipmentCodexMilestones";
import {
  aggregateCodexBuffs,
  codexMilestoneBuffFromWeapon,
  codexWeaponCatalog,
  previewWeaponCodexMilestones,
  sumWeaponCodexBuffs,
  type WeaponCodexEntryView,
  type WeaponCodexTotals,
} from "@/shared/weaponCodex";
import { normalizeItemId } from "@/shared/itemId";

type CodexDb = Pick<PrismaClient, "weaponCodexEntry" | "weaponInstance" | "minion"> | Prisma.TransactionClient;

type CodexEntryRow = {
  baseItemId: string;
  milestoneId: string;
  bonusPower: number;
  bonusAtkMilli: number;
  bonusMagicMilli: number;
  registeredEnhanceLevel: number;
  registeredQuality: number;
  registeredItemLevel: number;
  registeredAt: Date;
};

export async function loadWeaponCodexTotals(db: CodexDb, userId: string): Promise<WeaponCodexTotals> {
  const entries = await db.weaponCodexEntry.findMany({
    where: { userId },
    select: { bonusPower: true, bonusAtkMilli: true, bonusMagicMilli: true },
  });
  return aggregateCodexBuffs(entries);
}

function groupWeaponEntries(entries: CodexEntryRow[]) {
  const byItem = new Map<string, CodexEntryRow[]>();
  for (const e of entries) {
    const list = byItem.get(e.baseItemId) ?? [];
    list.push(e);
    byItem.set(e.baseItemId, list);
  }
  return byItem;
}

export async function loadWeaponCodexPayload(userId: string) {
  const [entries, registerable, iconMap] = await Promise.all([
    prismaWeaponCodexEntries(userId),
    loadRegisterableWeaponClaims(userId),
    getItemIconMap(),
  ]);
  const byItem = groupWeaponEntries(entries);
  const totals = aggregateCodexBuffs(entries);
  const catalog: WeaponCodexEntryView[] = codexWeaponCatalog().map((w) => {
    const rows = byItem.get(w.id) ?? [];
    const registeredByMilestone = new Map(
      rows.map((r) => [
        r.milestoneId,
        {
          bonusPower: r.bonusPower,
          bonusAtkMilli: r.bonusAtkMilli,
          bonusMagicMilli: r.bonusMagicMilli,
          registeredEnhanceLevel: r.registeredEnhanceLevel,
          registeredQuality: r.registeredQuality,
          registeredItemLevel: r.registeredItemLevel,
          registeredAt: r.registeredAt.toISOString(),
        },
      ]),
    );
    const milestones = previewWeaponCodexMilestones(w.id, registeredByMilestone);
    const registeredMilestoneCount = milestones.filter((m) => m.registered).length;
    return {
      baseItemId: w.id,
      name: w.name,
      grade: w.grade,
      icon: w.icon,
      milestones,
      registeredMilestoneCount,
      totalMilestones: EQUIPMENT_CODEX_MILESTONES.length,
      buff: sumWeaponCodexBuffs(milestones.filter((m) => m.registered).map((m) => m.buff)),
    };
  });
  return {
    catalog: attachIcons(catalog, iconMap, "baseItemId"),
    totals,
    registerableWeapons: attachIcons(registerable, iconMap, "baseItemId"),
  };
}

async function prismaWeaponCodexEntries(userId: string): Promise<CodexEntryRow[]> {
  const { prisma } = await import("@/server/db");
  return prisma.weaponCodexEntry.findMany({
    where: { userId },
    select: {
      baseItemId: true,
      milestoneId: true,
      bonusPower: true,
      bonusAtkMilli: true,
      bonusMagicMilli: true,
      registeredEnhanceLevel: true,
      registeredQuality: true,
      registeredItemLevel: true,
      registeredAt: true,
    },
  });
}

async function loadRegisterableWeaponClaims(userId: string) {
  const { prisma } = await import("@/server/db");
  const [rows, entries, equippedIds] = await Promise.all([
    prisma.weaponInstance.findMany({
      where: { userId, status: "OWNED" },
      include: { baseItem: true, listing: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prismaWeaponCodexEntries(userId),
    prisma.minion
      .findMany({
        where: { userId, equippedWeaponInstanceId: { not: null } },
        select: { equippedWeaponInstanceId: true },
      })
      .then((ms) => new Set(ms.map((m) => m.equippedWeaponInstanceId).filter(Boolean) as string[])),
  ]);

  const claimed = new Set(entries.map((e) => `${e.baseItemId}:${e.milestoneId}`));
  const out: Array<{
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    quality: number;
    itemLevel: number;
    milestoneId: string;
    milestoneLabel: string;
    previewBuff: ReturnType<typeof codexMilestoneBuffFromWeapon>;
    grade?: number;
    gradeLabel?: string;
  }> = [];

  for (const w of rows) {
    if (w.userLocked || w.listing || equippedIds.has(w.id)) continue;
    const baseItemId = normalizeItemId(w.baseItemId);
    if (!baseItemId) continue;
    const snapshot = {
      enhanceLevel: w.enhanceLevel,
      quality: w.quality,
      itemLevel: w.itemLevel,
    };
    const optionBonus = weaponCombatBonusFromOptions(w.optionsJson);
    for (const milestone of EQUIPMENT_CODEX_MILESTONES) {
      if (claimed.has(`${baseItemId}:${milestone.id}`)) continue;
      if (!instanceMeetsCodexMilestone(snapshot, milestone)) continue;
      out.push({
        id: w.id,
        baseItemId,
        name: w.baseItem.name,
        enhanceLevel: w.enhanceLevel,
        quality: w.quality,
        itemLevel: w.itemLevel,
        milestoneId: milestone.id,
        milestoneLabel: milestone.label,
        previewBuff: codexMilestoneBuffFromWeapon({
          baseItemId,
          milestoneId: milestone.id,
          enhanceLevel: w.enhanceLevel,
          optionPowerBonus: optionBonus,
        }),
        ...itemGradeViewForItem(w.baseItemId, w.baseItem.grade),
      });
    }
  }
  return out;
}

export async function registerWeaponToCodex(
  userId: string,
  weaponInstanceId: string,
  milestoneId: string,
) {
  const milestone = codexMilestoneDef(milestoneId);
  if (!milestone) throw new Error("CODEX_MILESTONE_INVALID");

  const { prisma } = await import("@/server/db");
  const result = await prisma.$transaction(async (tx) => {
    const w = await tx.weaponInstance.findUnique({
      where: { id: weaponInstanceId },
      include: { baseItem: true, listing: { select: { id: true } } },
    });
    if (!w) throw new Error("NOT_FOUND");
    if (w.userId !== userId) throw new Error("FORBIDDEN");
    if (w.status !== "OWNED" || w.listing) throw new Error("EQUIPMENT_LOCKED");
    assertEquipmentNotUserLocked(w);
    const baseItemId = normalizeItemId(w.baseItemId);
    if (!baseItemId) throw new Error("BAD_REQUEST");

    const equipped = await tx.minion.findFirst({
      where: { userId, equippedWeaponInstanceId: weaponInstanceId },
      select: { id: true },
    });
    if (equipped) throw new Error("EQUIPMENT_EQUIPPED");

    const snapshot = {
      enhanceLevel: w.enhanceLevel,
      quality: w.quality,
      itemLevel: w.itemLevel,
    };
    if (!instanceMeetsCodexMilestone(snapshot, milestone)) {
      throw new Error("CODEX_MILESTONE_NOT_MET");
    }

    const existing = await tx.weaponCodexEntry.findUnique({
      where: {
        userId_baseItemId_milestoneId: { userId, baseItemId, milestoneId: milestone.id },
      },
    });
    if (existing) throw new Error("CODEX_MILESTONE_ALREADY");

    const buff = codexMilestoneBuffFromWeapon({
      baseItemId,
      milestoneId: milestone.id,
      enhanceLevel: w.enhanceLevel,
      optionPowerBonus: weaponCombatBonusFromOptions(w.optionsJson),
    });

    await tx.weaponCodexEntry.create({
      data: {
        userId,
        baseItemId,
        milestoneId: milestone.id,
        bonusPower: buff.bonusPower,
        bonusAtkMilli: buff.bonusAtkMilli,
        bonusMagicMilli: buff.bonusMagicMilli,
        registeredEnhanceLevel: w.enhanceLevel,
        registeredQuality: w.quality,
        registeredItemLevel: w.itemLevel,
      },
    });

    await tx.weaponInstance.delete({ where: { id: weaponInstanceId } });

    const entries = await tx.weaponCodexEntry.findMany({
      where: { userId },
      select: { bonusPower: true, bonusAtkMilli: true, bonusMagicMilli: true },
    });
    return {
      baseItemId,
      milestoneId: milestone.id,
      milestoneLabel: milestone.label,
      name: w.baseItem.name,
      buff,
      totals: aggregateCodexBuffs(entries),
    };
  });

  invalidateUserCombatMetaCache(userId);
  return result;
}
