import { itemGradeLabel } from "@/server/itemGrade";
import { normalizeItemIdLower } from "@/shared/itemId";

export type DungeonRealm = "마계" | "천계" | "이계";

/** 기본 장비 5단계(일반~전설) 세트 메타 — 에셋 재질명 + 드랍·세트 보너스용 */
export type EquipmentSetDef = {
  id: string;
  /** 세트 이름 — 툴팁·세트 보너스 (재질과 동일) */
  name: string;
  grade: number;
  realm: DungeonRealm;
  /** 세계관 한 줄 (아이템명과 분리) */
  tagline: string;
  weaponIds: string[];
  armorItemIds: string[];
};

export const EQUIPMENT_SETS: EquipmentSetDef[] = [
  {
    id: "pioneer",
    name: "가죽",
    grade: 1,
    realm: "마계",
    tagline: "마계 균열에서 주워 온 가죽 장갑",
    weaponIds: ["weapon_wood_sword"],
    armorItemIds: [
      "armor_leather_helmet",
      "armor_leather_armor",
      "armor_leather_pants",
      "armor_leather_boots",
    ],
  },
  {
    id: "flint",
    name: "돌",
    grade: 1,
    realm: "마계",
    tagline: "날을 세운 돌 검",
    weaponIds: ["weapon_stone_sword"],
    armorItemIds: [],
  },
  {
    id: "escort",
    name: "사슬",
    grade: 1,
    realm: "마계",
    tagline: "쇠사슬로 엮은 방어구",
    weaponIds: [],
    armorItemIds: [
      "armor_chain_helmet",
      "armor_chain_armor",
      "armor_chain_pants",
      "armor_chain_boots",
    ],
  },
  {
    id: "dawn",
    name: "적빛",
    grade: 2,
    realm: "마계",
    tagline: "마염에 그을린 붉은 장비",
    weaponIds: ["weapon_red_gold_sword"],
    armorItemIds: [
      "armor_crimson_helmet",
      "armor_crimson_armor",
      "armor_crimson_pants",
      "armor_crimson_boots",
    ],
  },
  {
    id: "oath",
    name: "철",
    grade: 3,
    realm: "마계",
    tagline: "단조한 철 갑주와 검",
    weaponIds: ["weapon_steel_sword"],
    armorItemIds: [
      "armor_iron_helmet",
      "armor_iron_armor",
      "armor_iron_pants",
      "armor_iron_boots",
    ],
  },
  {
    id: "royal",
    name: "금",
    grade: 4,
    realm: "천계",
    tagline: "낙천자의 잔광이 깃든 금장비",
    weaponIds: ["weapon_gold_sword"],
    armorItemIds: [
      "armor_golden_helmet",
      "armor_golden_armor",
      "armor_golden_pants",
      "armor_golden_boots",
    ],
  },
  {
    id: "throne",
    name: "다이아",
    grade: 5,
    realm: "천계",
    tagline: "심판의 빛을 담은 다이아 장비",
    weaponIds: ["weapon_diamond_sword"],
    armorItemIds: [
      "armor_diamond_helmet",
      "armor_diamond_armor",
      "armor_diamond_pants",
      "armor_diamond_boots",
    ],
  },
];

const SET_BY_ITEM_ID = new Map<string, EquipmentSetDef>();
for (const set of EQUIPMENT_SETS) {
  for (const id of [...set.weaponIds, ...set.armorItemIds]) {
    SET_BY_ITEM_ID.set(normalizeItemIdLower(id), set);
  }
}

export function equipmentSetForItemId(itemId: string): EquipmentSetDef | null {
  return SET_BY_ITEM_ID.get(normalizeItemIdLower(itemId)) ?? null;
}

/** 툴팁·인벤 — `적빛 · 레어` */
export function equipmentSetSubtitle(itemId: string): string | null {
  const set = equipmentSetForItemId(itemId);
  if (!set) return null;
  return `${set.name} · ${itemGradeLabel(set.grade)}`;
}

/** 툴팁 — `마계 · 적빛` */
export function equipmentSetRealmLabel(itemId: string): string | null {
  const set = equipmentSetForItemId(itemId);
  if (!set) return null;
  return `${set.realm} · ${set.name}`;
}
