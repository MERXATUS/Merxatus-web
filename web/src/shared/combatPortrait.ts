import type { MinionCombatClass } from "@/shared/minionDerivedClass";
import { normalizeMinionCombatClass } from "@/shared/minionDerivedClass";
import { itemIconSrc } from "@/shared/itemIcon";

export type CombatPortraitView = {
  /** item = public/Items PNG, glyph = 이모지/문자 폴백 */
  kind: "item" | "glyph";
  itemId?: string;
  icon?: string | null;
  src?: string;
  glyph?: string;
  /** CSS color — glyph·테두리용 */
  tint?: string;
};

const CLASS_DEFAULT_WEAPON: Record<MinionCombatClass, string> = {
  ADVENTURER: "weapon_wood_sword",
  SWORDSMAN: "weapon_steel_sword",
  WARRIOR: "weapon_gold_sword",
  WIND_BLADE: "weapon_red_gold_sword",
  MAGIC_BLADE: "weapon_steel_sword",
  SHIELD_BLADE: "weapon_stone_sword",
  BERSERKER: "weapon_gold_sword",
  SWORD_MASTER: "weapon_red_gold_sword",
  ARCANE_BLADE: "weapon_steel_sword",
  CRUSADER: "weapon_stone_sword",
};

const CLASS_TINT: Record<MinionCombatClass, string> = {
  ADVENTURER: "#94a3b8",
  SWORDSMAN: "#60a5fa",
  WARRIOR: "#f87171",
  WIND_BLADE: "#34d399",
  MAGIC_BLADE: "#a78bfa",
  SHIELD_BLADE: "#fbbf24",
  BERSERKER: "#dc2626",
  SWORD_MASTER: "#2dd4bf",
  ARCANE_BLADE: "#8b5cf6",
  CRUSADER: "#fde047",
};

const MONSTER_NAME_TO_ID: Record<string, string> = {
  "\uC2AC\uB77C\uC784": "slime",
  "\uACE0\uBE14\uB9B0": "goblin",
  "\uC2AC\uB77C\uC784\uD0B9": "slime_king",
  "\uACE0\uBE14\uB9B0 \uC6B0\uB450\uBA38\uB9AC": "goblin_chieftain",
};

const MONSTER_GLYPH: Record<string, { glyph: string; tint: string }> = {
  slime: { glyph: "\uD83D\uDCA7", tint: "#4ade80" },
  goblin: { glyph: "\uD83D\uDC7A", tint: "#a3e635" },
  slime_king: { glyph: "\uD83D\uDC51", tint: "#22c55e" },
  goblin_chieftain: { glyph: "\u2694", tint: "#eab308" },
};

export const MONSTER_ICON_PUBLIC_DIR = "/Monsters";

export function monsterIdFromDisplayName(displayName: string): string {
  const stripped = displayName.replace(/^\[|\]$/g, "").trim();
  return MONSTER_NAME_TO_ID[stripped] ?? stripped.toLowerCase().replace(/\s+/g, "_");
}

function pascalMonsterIconStem(monsterId: string) {
  return `Icon_Monster_${monsterId
    .split("_")
    .map((s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ""))
    .join("_")}`;
}

export function minionPortraitView(input: {
  combatClass?: MinionCombatClass | string | null;
  weaponBaseItemId?: string | null;
}): CombatPortraitView {
  const combatClass = normalizeMinionCombatClass(String(input.combatClass ?? "ADVENTURER"));
  const itemId = input.weaponBaseItemId?.trim() || CLASS_DEFAULT_WEAPON[combatClass];
  return {
    kind: "item",
    itemId,
    src: itemIconSrc({ itemId }),
    tint: CLASS_TINT[combatClass],
  };
}

export function monsterPortraitView(input: {
  monsterId: string;
  icon?: string | null;
}): CombatPortraitView {
  const id = input.monsterId.trim().toLowerCase();
  const stem = input.icon?.trim() || pascalMonsterIconStem(id);
  const glyph = MONSTER_GLYPH[id];
  return {
    kind: "glyph",
    icon: stem,
    src: `${MONSTER_ICON_PUBLIC_DIR}/${stem.replace(/\.png$/i, "")}.png`,
    glyph: glyph?.glyph ?? id.slice(0, 1).toUpperCase(),
    tint: glyph?.tint ?? "#fb7185",
  };
}
