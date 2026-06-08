/** 천계(접두) · 마계(접미) — 전투 루트 드랍 전용 */
export type OptionRealm = "celestial" | "abyss";

export type BlessedOptionFields = {
  realm?: OptionRealm;
  affix?: string;
};

export const CELESTIAL_WEAPON_OPTION_IDS = [
  "STAT_STR_ADD",
  "STAT_DEX_ADD",
  "STAT_INT_ADD",
  "STAT_END_ADD",
  "ALL_STAT_PCT",
  "PHY_ATK_ADD",
  "MAG_ATK_ADD",
  "PHY_ATK_PCT",
  "MAG_ATK_PCT",
] as const;

export const ABYSS_WEAPON_OPTION_IDS = [
  "ATK_SPD_PCT",
  "CRIT_CHANCE_PCT",
  "CRIT_DMG_PCT",
  "ARMOR_PEN_PCT",
  "FINAL_DMG_PCT",
  "LIFE_STEAL_PCT",
  "DMG_VS_BOSS_PCT",
  "DMG_VS_ANGEL_PCT",
  "DMG_VS_DEMON_PCT",
  "ITEM_RARITY_PCT",
] as const;

export const CELESTIAL_ARMOR_OPTION_IDS = [
  "HP_ADD",
  "DEF_ADD",
  "HP_PCT",
  "DEF_PCT",
  "STAT_STR_ADD",
  "STAT_DEX_ADD",
  "STAT_INT_ADD",
  "STAT_END_ADD",
] as const;

export const ABYSS_ARMOR_OPTION_IDS = ["DMG_RED_PCT", "BLOCK_PCT"] as const;

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
  return realm === "celestial" ? "천계" : "마계";
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
  realm: OptionRealm,
): string[] {
  if (pool === "weapon") {
    return [...(realm === "celestial" ? CELESTIAL_WEAPON_OPTION_IDS : ABYSS_WEAPON_OPTION_IDS)];
  }
  return [...(realm === "celestial" ? CELESTIAL_ARMOR_OPTION_IDS : ABYSS_ARMOR_OPTION_IDS)];
}

/** 드랍 슬롯 — 천계·마계 1개씩 고정 후 번갈아 추가 */
export function blessedSlotRealms(totalSlots: number): OptionRealm[] {
  const n = Math.max(2, Math.floor(totalSlots));
  const plan: OptionRealm[] = ["celestial", "abyss"];
  let next: OptionRealm = "celestial";
  for (let i = 2; i < n; i++) {
    plan.push(next);
    next = next === "celestial" ? "abyss" : "celestial";
  }
  return plan;
}

export function isBlessedOption(opt: BlessedOptionFields): boolean {
  return opt.realm === "celestial" || opt.realm === "abyss";
}

export function itemHasBlessedOptions(options: BlessedOptionFields[] | undefined | null): boolean {
  return (options ?? []).some(isBlessedOption);
}

type BlessingNameInput = {
  realm?: OptionRealm;
  affix?: string | null;
};

/** 성광의 [장검] · 심연의 */
export function blessedEquipmentDisplayName(
  baseName: string,
  options: BlessingNameInput[] | undefined,
  enhanceLevel = 0,
): string {
  const base = baseName.trim() || "장비";
  const plus = enhanceLevel > 0 ? ` +${enhanceLevel}` : "";
  const celestial = options?.find((o) => o.realm === "celestial");
  const abyss = options?.find((o) => o.realm === "abyss");
  const prefix = celestial ? (celestial.affix?.trim() || defaultAffixForRealm("celestial")) : "";
  const suffix = abyss ? (abyss.affix?.trim() || defaultAffixForRealm("abyss")) : "";

  if (prefix && suffix) return `${prefix} ${base}${plus} · ${suffix}`;
  if (prefix) return `${prefix} ${base}${plus}`;
  if (suffix) return `${base}${plus} · ${suffix}`;
  return `${base}${plus}`;
}
