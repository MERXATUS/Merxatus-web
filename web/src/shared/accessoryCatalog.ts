import accessoryCatalogJson from "../../data/accessory_catalog.json";
import {
  emptyCombatModifiers,
  mergeCombatModifiers,
  type EquipmentCombatModifiers,
} from "@/shared/equipmentCombatModifiers";
import { normalizeItemIdLower } from "@/shared/itemId";
import type { MinionAccessorySlotId } from "@/shared/minionEquipSlots";

export type AccessoryCatalogEntry = {
  id: string;
  name: string;
  faction: "demon" | "angel";
  setId: string;
  slot: MinionAccessorySlotId;
  slotKind: "ring" | "necklace" | "relic";
  bossKey: string;
  bossOrder: number;
  isJin: boolean;
  grade: number;
  raidId: string;
  mods: Partial<EquipmentCombatModifiers>;
};

export type AccessorySetDef = {
  id: string;
  faction: "demon" | "angel";
  label: string;
  bonuses: Array<{ count: number; mods: Partial<EquipmentCombatModifiers> }>;
};

const catalog = accessoryCatalogJson as { items: AccessoryCatalogEntry[]; sets: AccessorySetDef[] };

const byId = new Map(catalog.items.map((e) => [normalizeItemIdLower(e.id), e]));

export function getAccessoryCatalogEntry(itemId: string): AccessoryCatalogEntry | null {
  return byId.get(normalizeItemIdLower(itemId)) ?? null;
}

export function accessoryMatchesSlot(itemId: string, slotId: MinionAccessorySlotId): boolean {
  const entry = getAccessoryCatalogEntry(itemId);
  return !!entry && entry.slot === slotId;
}

export function accessoryModsForItem(itemId: string): EquipmentCombatModifiers {
  const entry = getAccessoryCatalogEntry(itemId);
  if (!entry) return emptyCombatModifiers();
  return mergeCombatModifiers(emptyCombatModifiers(), entry.mods as EquipmentCombatModifiers);
}

export function computeAccessorySetBonuses(equippedItemIds: string[]): EquipmentCombatModifiers {
  const entries = equippedItemIds
    .map((id) => getAccessoryCatalogEntry(id))
    .filter((e): e is AccessoryCatalogEntry => !!e);

  if (!entries.length) return emptyCombatModifiers();

  const factions = new Set(entries.map((e) => e.faction));
  if (factions.size !== 1) return emptyCombatModifiers();

  const faction = entries[0]!.faction;
  const setId = faction === "demon" ? "demon_raid" : "angel_raid";
  const count = entries.filter((e) => e.setId === setId).length;
  const setDef = catalog.sets.find((s) => s.id === setId);
  if (!setDef) return emptyCombatModifiers();

  let out = emptyCombatModifiers();
  for (const bonus of [...setDef.bonuses].sort((a, b) => a.count - b.count)) {
    if (count >= bonus.count) {
      out = mergeCombatModifiers(out, bonus.mods as EquipmentCombatModifiers);
    }
  }
  return out;
}

export function accessoryCombatModifiersForSlots(slots: Partial<Record<MinionAccessorySlotId, string | null>>) {
  const ids = Object.values(slots).filter((id): id is string => !!id);
  let out = emptyCombatModifiers();
  for (const id of ids) {
    out = mergeCombatModifiers(out, accessoryModsForItem(id));
  }
  out = mergeCombatModifiers(out, computeAccessorySetBonuses(ids));
  return out;
}

export const ACCESSORY_SET_DEFS = catalog.sets;

const MOD_LABELS: Partial<Record<keyof EquipmentCombatModifiers, string>> = {
  critChancePct: "치명타 확률",
  critDmgPct: "치명타 피해",
  atkSpdPct: "공격 속도",
  armorPenPct: "방어 관통",
  finalDmgPct: "최종 피해",
  lifeStealPct: "생명력 흡수",
  dmgVsBossPct: "보스 대상 피해",
  dmgVsAngelPct: "천사 대상 피해",
  dmgVsDemonPct: "악마 대상 피해",
  blockPct: "막기",
  dmgReducePct: "받는 피해 감소",
  evasionPct: "회피",
  critResistPct: "치명타 저항",
  thornPct: "가시",
  regenHpPerRound: "턴당 HP 회복",
};

const SLOT_KIND_LABEL: Record<AccessoryCatalogEntry["slotKind"], string> = {
  ring: "반지",
  necklace: "목걸이",
  relic: "유물",
};

export function isAccessoryInventoryItem(it: { itemId: string; category?: string }): boolean {
  const id = normalizeItemIdLower(it.itemId);
  const cat = (it.category ?? "").trim();
  return cat === "악세서리" || id.startsWith("acc_");
}

export function accessoryModDescriptionLines(itemId: string): string[] {
  const entry = getAccessoryCatalogEntry(itemId);
  if (!entry) return [];
  const lines: string[] = [];
  for (const [key, raw] of Object.entries(entry.mods) as Array<[keyof EquipmentCombatModifiers, number]>) {
    const v = Number(raw);
    if (!v) continue;
    const label = MOD_LABELS[key] ?? key;
    lines.push(key === "regenHpPerRound" ? `${label} +${v}` : `${label} +${v}%`);
  }
  return lines;
}

export function accessoryTooltipMeta(itemId: string): { slotLabel: string; factionLabel: string; setLabel: string } | null {
  const entry = getAccessoryCatalogEntry(itemId);
  if (!entry) return null;
  const setDef = catalog.sets.find((s) => s.id === entry.setId);
  return {
    slotLabel: SLOT_KIND_LABEL[entry.slotKind],
    factionLabel: entry.faction === "demon" ? "악마" : "천사",
    setLabel: setDef?.label ?? entry.setId,
  };
}
