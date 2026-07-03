/** 천계(접두) · 마계(접미) — 표시용. 옵션 풀은 통합 깡스탯 체계 */
export type OptionRealm = "celestial" | "abyss" | "void";

export type BlessedOptionFields = {
  realm?: OptionRealm;
  affix?: string;
};

/** 무기 드랍·제작 옵션 풀 (깡스탯) */
export const WEAPON_OPTION_POOL_IDS = [
  "PHY_ATK_ADD",
  "PHY_ATK_PCT",
  "MAG_ATK_ADD",
  "MAG_ATK_PCT",
  "STAT_STR_ADD",
  "STAT_DEX_ADD",
  "STAT_INT_ADD",
  "STAT_END_ADD",
  "ATK_SPD_PCT",
  "FINAL_DMG_PCT",
] as const;

/** 방어구 드랍·제작 옵션 풀 — 무기와 동일 (깡스탯) */
export const ARMOR_OPTION_POOL_IDS = [
  "PHY_ATK_ADD",
  "PHY_ATK_PCT",
  "MAG_ATK_ADD",
  "MAG_ATK_PCT",
  "STAT_STR_ADD",
  "STAT_DEX_ADD",
  "STAT_INT_ADD",
  "STAT_END_ADD",
  "ATK_SPD_PCT",
  "FINAL_DMG_PCT",
] as const;

/** @deprecated — `WEAPON_OPTION_POOL_IDS` */
export const CELESTIAL_WEAPON_OPTION_IDS = WEAPON_OPTION_POOL_IDS;
/** @deprecated — `WEAPON_OPTION_POOL_IDS` */
export const ABYSS_WEAPON_OPTION_IDS = WEAPON_OPTION_POOL_IDS;
/** @deprecated — `ARMOR_OPTION_POOL_IDS` */
export const CELESTIAL_ARMOR_OPTION_IDS = ARMOR_OPTION_POOL_IDS;
/** @deprecated — `ARMOR_OPTION_POOL_IDS` */
export const ABYSS_ARMOR_OPTION_IDS = ARMOR_OPTION_POOL_IDS;

const CELESTIAL_AFFIXES = [
  "성광의",
  "천벌의",
  "섬광의",
  "신성한",
  "창세의",
  "고결한",
  "천계의",
] as const;

const ABYSS_AFFIXES = [
  "심연의",
  "마력의",
  "굶주린",
  "혼돈의",
  "저주받은",
  "마계의",
  "어둠의",
] as const;

export function realmLabelKo(realm: OptionRealm): string {
  if (realm === "celestial") return "천계";
  if (realm === "abyss") return "마계";
  return "공허";
}

export function defaultAffixForRealm(realm: OptionRealm): string {
  return realm === "celestial" ? "천계의" : "마계의";
}

export function rollBlessingAffix(realm: OptionRealm, rnd = Math.random): string {
  const list = realm === "celestial" ? CELESTIAL_AFFIXES : ABYSS_AFFIXES;
  return list[Math.floor(rnd() * list.length)] ?? defaultAffixForRealm(realm);
}

export function blessingOptionIdsForRealm(
  pool: "weapon" | "armor",
  _realm?: OptionRealm,
): string[] {
  if (pool === "weapon") return [...WEAPON_OPTION_POOL_IDS];
  return [...ARMOR_OPTION_POOL_IDS];
}

/** 드랍 슬롯마다 천계·마계 중 랜덤 (이름 장식용) */
export function rollLootRealmForSlot(rnd = Math.random): OptionRealm {
  return rnd() < 0.5 ? "celestial" : "abyss";
}

/** @deprecated — `rollLootRealmForSlot` per slot */
export function blessedSlotRealms(totalSlots: number): OptionRealm[] {
  return Array.from({ length: Math.max(1, Math.floor(totalSlots)) }, () => "celestial" as OptionRealm);
}

export function isBlessedOption(opt: BlessedOptionFields): boolean {
  return opt.realm === "celestial" || opt.realm === "abyss" || opt.realm === "void";
}

export function itemHasBlessedOptions(options: BlessedOptionFields[] | undefined | null): boolean {
  return (options ?? []).some(isBlessedOption);
}

type BlessingNameInput = {
  realm?: OptionRealm;
  affix?: string | null;
};

export function blessedEquipmentDisplayName(
  baseName: string,
  options: BlessingNameInput[] | undefined | null,
  enhanceLevel = 0,
): string {
  const first = (options ?? []).find((o) => o.realm === "celestial" || o.realm === "abyss");
  const affix = (first?.affix ?? "").trim();
  const lv = Math.max(0, Math.floor(enhanceLevel));
  const prefix = affix ? `${affix} ` : "";
  const suffix = lv > 0 ? ` +${lv}` : "";
  return `${prefix}${baseName}${suffix}`.trim();
}
