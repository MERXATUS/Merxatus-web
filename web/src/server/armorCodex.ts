import type { Prisma, PrismaClient } from "@prisma/client";
import { assertEquipmentNotUserLocked } from "@/server/inventoryEquipmentLock";
import { attachIcons, getItemIconMap } from "@/server/itemCatalog";
import { formatEquipmentOptionDisplay } from "@/server/equipmentOptions";
import { itemGradeViewForItem } from "@/server/itemGrade";
import { invalidateUserCombatMetaCache } from "@/server/minionCombatBuild";
import {
  codexMilestoneDef,
  codexMilestonesForPool,
  instanceMeetsCodexMilestone,
} from "@/shared/equipmentCodexMilestones";
import {
  aggregateArmorCodexBuffs,
  codexArmorCatalog,
  codexMilestoneBuffFromArmor,
  previewArmorCodexMilestones,
  sumArmorCodexBuffs,
  type ArmorCodexEntryView,
  type ArmorCodexTotals,
} from "@/shared/armorCodex";
import { armorSlotLabelKo } from "@/shared/armorStatsData";
import { normalizeItemId } from "@/shared/itemId";

type CodexDb =
  | Pick<PrismaClient, "armorCodexEntry" | "armorInstance" | "minion">
  | Prisma.TransactionClient;

type CodexEntryRow = {
  baseItemId: string;
  milestoneId: string;
  bonusPower: number;
  bonusHpMilli: number;
  bonusDefMilli: number;
  registeredEnhanceLevel: number;
  registeredQuality: number;
  registeredItemLevel: number;
  registeredAt: Date;
};

export async function loadArmorCodexTotals(db: CodexDb, userId: string): Promise<ArmorCodexTotals> {
  const entries = await db.armorCodexEntry.findMany({
    where: { userId },
    select: { bonusPower: true, bonusHpMilli: true, bonusDefMilli: true },
  });
  return aggregateArmorCodexBuffs(entries);
}

function groupArmorEntries(entries: CodexEntryRow[]) {
  const byItem = new Map<string, CodexEntryRow[]>();
  for (const e of entries) {
    const list = byItem.get(e.baseItemId) ?? [];
    list.push(e);
    byItem.set(e.baseItemId, list);
  }
  return byItem;
}

export async function loadArmorCodexPayload(userId: string) {
  const [entries, registerable, iconMap] = await Promise.all([
    prismaArmorCodexEntries(userId),
    loadRegisterableArmorClaims(userId),
    getItemIconMap(),
  ]);
  const byItem = groupArmorEntries(entries);
  const totals = aggregateArmorCodexBuffs(entries);
  const catalog: ArmorCodexEntryView[] = codexArmorCatalog().map((a) => {
    const rows = byItem.get(a.id) ?? [];
    const registeredByMilestone = new Map(
      rows.map((r) => [
        r.milestoneId,
        {
          bonusPower: r.bonusPower,
          bonusHpMilli: r.bonusHpMilli,
          bonusDefMilli: r.bonusDefMilli,
          registeredEnhanceLevel: r.registeredEnhanceLevel,
          registeredQuality: r.registeredQuality,
          registeredItemLevel: r.registeredItemLevel,
          registeredAt: r.registeredAt.toISOString(),
        },
      ]),
    );
    const milestones = previewArmorCodexMilestones(a.id, registeredByMilestone);
    const registeredMilestoneCount = milestones.filter((m) => m.registered).length;
    return {
      baseItemId: a.id,
      name: a.name,
      slot: a.slot,
      slotLabel: armorSlotLabelKo(a.slot),
      grade: a.grade,
      icon: a.icon,
      milestones,
      registeredMilestoneCount,
      totalMilestones: codexMilestonesForPool("armor").length,
      buff: sumArmorCodexBuffs(milestones.filter((m) => m.registered).map((m) => m.buff)),
    };
  });
  return {
    catalog: attachIcons(catalog, iconMap, "baseItemId"),
    totals,
    registerableArmors: attachIcons(registerable, iconMap, "baseItemId"),
  };
}

async function prismaArmorCodexEntries(userId: string): Promise<CodexEntryRow[]> {
  const { prisma } = await import("@/server/db");
  return prisma.armorCodexEntry.findMany({
    where: { userId },
    select: {
      baseItemId: true,
      milestoneId: true,
      bonusPower: true,
      bonusHpMilli: true,
      bonusDefMilli: true,
      registeredEnhanceLevel: true,
      registeredQuality: true,
      registeredItemLevel: true,
      registeredAt: true,
    },
  });
}

function armorOptionsFromJson(optionsJson: string, baseItemId: string) {
  return formatEquipmentOptionDisplay(optionsJson, "armor", baseItemId);
}

async function loadRegisterableArmorClaims(userId: string) {
  const { prisma } = await import("@/server/db");
  const [rows, entries, equippedRows] = await Promise.all([
    prisma.armorInstance.findMany({
      where: { userId, status: "OWNED" },
      include: { baseItem: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prismaArmorCodexEntries(userId),
    prisma.minion.findMany({
      where: { userId },
      select: {
        equippedHelmetInstanceId: true,
        equippedChestInstanceId: true,
        equippedPantsInstanceId: true,
        equippedBootsInstanceId: true,
      },
    }),
  ]);

  const equippedIds = new Set<string>();
  for (const m of equippedRows) {
    for (const id of [
      m.equippedHelmetInstanceId,
      m.equippedChestInstanceId,
      m.equippedPantsInstanceId,
      m.equippedBootsInstanceId,
    ]) {
      if (id) equippedIds.add(id);
    }
  }

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
    previewBuff: ReturnType<typeof codexMilestoneBuffFromArmor>;
    grade?: number;
    gradeLabel?: string;
  }> = [];

  for (const a of rows) {
    if (a.userLocked || equippedIds.has(a.id)) continue;
    const baseItemId = normalizeItemId(a.baseItemId);
    if (!baseItemId) continue;
    const options = armorOptionsFromJson(a.optionsJson, baseItemId);
    const snapshot = {
      enhanceLevel: a.enhanceLevel,
      quality: a.quality,
      itemLevel: a.itemLevel,
      optionsJson: a.optionsJson,
      optionPool: "armor" as const,
    };
    for (const milestone of codexMilestonesForPool("armor")) {
      if (claimed.has(`${baseItemId}:${milestone.id}`)) continue;
      if (!instanceMeetsCodexMilestone(snapshot, milestone)) continue;
      out.push({
        id: a.id,
        baseItemId,
        name: a.baseItem.name,
        enhanceLevel: a.enhanceLevel,
        quality: a.quality,
        itemLevel: a.itemLevel,
        milestoneId: milestone.id,
        milestoneLabel: milestone.label,
        previewBuff: codexMilestoneBuffFromArmor({
          baseItemId,
          milestoneId: milestone.id,
          enhanceLevel: a.enhanceLevel,
          options,
        }),
        ...itemGradeViewForItem(a.baseItemId, a.baseItem.grade),
      });
    }
  }
  return out;
}

export async function registerArmorToCodex(
  userId: string,
  armorInstanceId: string,
  milestoneId: string,
) {
  const milestone = codexMilestoneDef(milestoneId);
  if (!milestone) throw new Error("CODEX_MILESTONE_INVALID");

  const { prisma } = await import("@/server/db");
  const result = await prisma.$transaction(async (tx) => {
    const a = await tx.armorInstance.findUnique({
      where: { id: armorInstanceId },
      include: { baseItem: true },
    });
    if (!a) throw new Error("NOT_FOUND");
    if (a.userId !== userId) throw new Error("FORBIDDEN");
    if (a.status !== "OWNED") throw new Error("EQUIPMENT_LOCKED");
    assertEquipmentNotUserLocked(a);
    const baseItemId = normalizeItemId(a.baseItemId);
    if (!baseItemId) throw new Error("BAD_REQUEST");

    const equipped = await tx.minion.findFirst({
      where: {
        userId,
        OR: [
          { equippedHelmetInstanceId: armorInstanceId },
          { equippedChestInstanceId: armorInstanceId },
          { equippedPantsInstanceId: armorInstanceId },
          { equippedBootsInstanceId: armorInstanceId },
        ],
      },
      select: { id: true },
    });
    if (equipped) throw new Error("EQUIPMENT_EQUIPPED");

    const options = armorOptionsFromJson(a.optionsJson, baseItemId);
    const snapshot = {
      enhanceLevel: a.enhanceLevel,
      quality: a.quality,
      itemLevel: a.itemLevel,
      optionsJson: a.optionsJson,
      optionPool: "armor" as const,
    };
    if (!instanceMeetsCodexMilestone(snapshot, milestone)) {
      throw new Error("CODEX_MILESTONE_NOT_MET");
    }

    const existing = await tx.armorCodexEntry.findUnique({
      where: {
        userId_baseItemId_milestoneId: { userId, baseItemId, milestoneId: milestone.id },
      },
    });
    if (existing) throw new Error("CODEX_MILESTONE_ALREADY");

    const buff = codexMilestoneBuffFromArmor({
      baseItemId,
      milestoneId: milestone.id,
      enhanceLevel: a.enhanceLevel,
      options,
    });

    await tx.armorCodexEntry.create({
      data: {
        userId,
        baseItemId,
        milestoneId: milestone.id,
        bonusPower: buff.bonusPower,
        bonusHpMilli: buff.bonusHpMilli,
        bonusDefMilli: buff.bonusDefMilli,
        registeredEnhanceLevel: a.enhanceLevel,
        registeredQuality: a.quality,
        registeredItemLevel: a.itemLevel,
      },
    });

    await tx.armorInstance.delete({ where: { id: armorInstanceId } });

    const entries = await tx.armorCodexEntry.findMany({
      where: { userId },
      select: { bonusPower: true, bonusHpMilli: true, bonusDefMilli: true },
    });
    return {
      baseItemId,
      milestoneId: milestone.id,
      milestoneLabel: milestone.label,
      name: a.baseItem.name,
      buff,
      totals: aggregateArmorCodexBuffs(entries),
    };
  });

  invalidateUserCombatMetaCache(userId);
  return result;
}
