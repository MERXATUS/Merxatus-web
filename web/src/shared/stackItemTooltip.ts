import { clampItemGrade, itemGradeLabel } from "@/server/itemGrade";
import { accessoryModDescriptionLines, accessoryTooltipMeta, isAccessoryInventoryItem } from "@/shared/accessoryCatalog";
import { isMinionRecruitCategory, isMinionRecruitItemId } from "@/shared/minionRecruit";
import { isRaidEntryTicketItemId } from "@/shared/raidEntry";
import { getArmorStats, isArmorInventoryItem, armorSlotLabelKo } from "@/shared/armorStatsData";
import { isEquipmentCraftConsumableItemId } from "@/shared/equipmentCraftConsumables";
import { isEnhanceProtectScrollItemId, isBlessingGemItemId } from "@/shared/enhanceConsumables";
import { isForgeEnhanceMaterialItemId } from "@/shared/forgeWorkbench";
import { isOptionConsumableItemId } from "@/shared/optionConsumables";

export type StackItemTooltipData = {
  itemId: string;
  name: string;
  category: string;
  grade?: number;
  gradeLabel?: string;
  quantity?: number;
};

const POTION_DESCRIPTIONS: Record<string, string> = {
  item_minor_stamina_potion: "제작·작업 시 소모되는 피로도를 회복하는 소모품입니다.",
};

export function stackItemGradeIndex(it: StackItemTooltipData): number {
  return clampItemGrade(it.grade ?? 1);
}

export function stackItemGradeLabel(it: StackItemTooltipData): string {
  return it.gradeLabel ?? itemGradeLabel(it.grade ?? 1);
}

export function shouldShowStackItemTooltip(it: StackItemTooltipData): boolean {
  if (it.category === "물약") return true;
  if (isArmorInventoryItem(it)) return true;
  if (isAccessoryInventoryItem(it)) return true;
  if (isMinionRecruitCategory(it.category) || isMinionRecruitItemId(it.itemId)) return true;
  if (isRaidEntryTicketItemId(it.itemId) || it.category === "레이드입장권") return true;
  if (isOptionConsumableItemId(it.itemId)) return true;
  if (isEquipmentCraftConsumableItemId(it.itemId)) return true;
  if (isForgeEnhanceMaterialItemId(it.itemId)) return true;
  return false;
}

export function stackItemTooltipSubtitle(it: StackItemTooltipData): string {
  if (it.category === "물약") return `물약 · ${stackItemGradeLabel(it)}`;
  if (isArmorInventoryItem(it)) {
    const stats = getArmorStats(it.itemId);
    const slot = stats ? armorSlotLabelKo(stats.slot) : "방어구";
    return `${slot} · ${stackItemGradeLabel(it)}`;
  }
  if (isAccessoryInventoryItem(it)) {
    const meta = accessoryTooltipMeta(it.itemId);
    if (meta) return `${meta.slotLabel} · ${meta.factionLabel} · ${stackItemGradeLabel(it)}`;
    return `악세서리 · ${stackItemGradeLabel(it)}`;
  }
  if (isMinionRecruitItemId(it.itemId) || isMinionRecruitCategory(it.category)) {
    return `미니언 고용권 · ${stackItemGradeLabel(it)}`;
  }
  if (isRaidEntryTicketItemId(it.itemId) || it.category === "레이드입장권") {
    return `레이드 입장권 · ${stackItemGradeLabel(it)}`;
  }
  if (isOptionConsumableItemId(it.itemId)) return `장비 옵션 · ${stackItemGradeLabel(it)}`;
  return `${it.category} · ${stackItemGradeLabel(it)}`;
}

export function stackItemTooltipBodyLines(it: StackItemTooltipData): string[] {
  const lines: string[] = [];

  if (it.category === "물약") {
    const desc = POTION_DESCRIPTIONS[it.itemId] ?? "소모 시 효과가 적용되는 물약입니다.";
    lines.push(desc);
    return lines;
  }

  if (isArmorInventoryItem(it)) {
    const stats = getArmorStats(it.itemId);
    if (stats) {
      lines.push(`HP +${stats.hp} · DEF +${stats.def}`);
      lines.push("장비 → 장비 착용에서 슬롯에 장착할 수 있습니다.");
    } else {
      lines.push("미니언 장비로 착용할 수 있는 방어구입니다.");
    }
    return lines;
  }

  if (isAccessoryInventoryItem(it)) {
    const meta = accessoryTooltipMeta(it.itemId);
    const modLines = accessoryModDescriptionLines(it.itemId);
    if (meta) lines.push(`${meta.setLabel} 세트 (${meta.factionLabel})`);
    for (const line of modLines) lines.push(line);
    lines.push("장비 → 장비 착용에서 악세서리 슬롯에 장착할 수 있습니다.");
    lines.push("세트 보너스: 2/4/7피스 착용 시 추가 효과 (천사/악마 혼용 불가)");
    return lines;
  }

  if (isMinionRecruitItemId(it.itemId) || isMinionRecruitCategory(it.category)) {
    lines.push("미니언 후보 중 1명을 선택해 고용합니다. (고용권 1개 소모)");
    lines.push("사용 시 수집·전투 중 한 종류의 후보 직업이 무작위로 제시됩니다.");
    return lines;
  }

  if (isRaidEntryTicketItemId(it.itemId) || it.category === "레이드입장권") {
    lines.push("레이드 시작 시 소모됩니다. (노말 1장 · 하드 2장)");
    lines.push("던전 탐험·보스 처치 시 드랍됩니다.");
    return lines;
  }

  if (it.itemId === "item_craft_quality_stone") {
    lines.push("장비 품질을 1단계 올립니다. 장비당 최대 10회 사용할 수 있습니다.");
    lines.push("대장간 → 장비 가공에서 대상 장비를 고른 뒤 사용하세요.");
    return lines;
  }
  if (it.itemId === "item_craft_level_tier1") {
    lines.push("아이템 레벨을 Lv10~50 구간(5레벨 단위)으로 설정합니다.");
    return lines;
  }
  if (it.itemId === "item_craft_level_tier2") {
    lines.push("아이템 레벨을 Lv55~95 구간(5레벨 단위)으로 설정합니다.");
    return lines;
  }
  if (it.itemId === "item_craft_level_tier3") {
    lines.push("아이템 레벨을 Lv100~140 구간(5레벨 단위)으로 설정합니다.");
    return lines;
  }

  if (it.itemId === "item_appraisal_scroll") {
    lines.push("감정 시스템이 제거되어 더 이상 사용할 수 없습니다.");
    lines.push("장비는 획득 시 옵션이 바로 표시됩니다.");
    return lines;
  }
  if (it.itemId === "item_gem_destruction") {
    lines.push("장비의 옵션 중 봉인되지 않은 1개를 무작위로 제거합니다.");
    return lines;
  }
  if (it.itemId === "item_gem_chaos") {
    lines.push("장비의 모든 옵션 종류를 변경합니다. 티어(T)는 유지됩니다.");
    lines.push("봉인된 옵션은 변경되지 않습니다.");
    return lines;
  }
  if (it.itemId === "item_gem_seal") {
    lines.push("장비의 옵션 중 1개를 봉인합니다. (장비당 최대 1개)");
    lines.push("봉인된 옵션은 소멸·혼돈의 영향을 받지 않습니다.");
    return lines;
  }
  if (it.itemId === "item_tome_celestial") {
    lines.push("무기·방어구의 모든 옵션을 천계 옵션으로 바꿉니다.");
    lines.push("옵션 티어(T)는 유지되고, 종류·천계 접두는 다시 정해집니다.");
    lines.push("대장간 → 장비 가공에서 대상 장비를 고른 뒤 사용하세요.");
    return lines;
  }
  if (it.itemId === "item_tome_abyss") {
    lines.push("무기·방어구의 모든 옵션을 마계 옵션으로 바꿉니다.");
    lines.push("옵션 티어(T)는 유지되고, 종류·마계 접미는 다시 정해집니다.");
    lines.push("대장간 → 장비 가공에서 대상 장비를 고른 뒤 사용하세요.");
    return lines;
  }
  if (it.itemId === "item_gem_ascension") {
    lines.push("장비의 옵션 중 1개 티어(T)를 1단계 올립니다.");
    return lines;
  }
  if (it.itemId === "item_gem_primordial") {
    lines.push("장비의 모든 옵션과 봉인을 제거합니다.");
    return lines;
  }
  if (it.itemId === "item_gem_void") {
    lines.push("옵션 1개를 공허 특수 옵션으로 바꿉니다. (스킬 피해 등)");
    return lines;
  }
  if (it.itemId === "item_gem_transfer") {
    lines.push("원본 장비의 옵션·봉인을 같은 등급·부위의 다른 장비로 옮깁니다.");
    return lines;
  }
  if (it.itemId === "item_gem_expansion") {
    lines.push("빈 옵션 슬롯 1개를 등급별 최대치까지 무작위로 채웁니다.");
    return lines;
  }
  if (it.itemId === "item_gem_metamorph") {
    lines.push("장비의 모든 옵션 종류와 티어(T)를 다시 정합니다.");
    lines.push("최소 티어 보장 없음 · 봉인된 옵션은 변경되지 않습니다.");
    return lines;
  }
  if (it.itemId === "item_gem_metamorph_3") {
    lines.push("장비의 모든 옵션 종류와 티어(T)를 다시 정합니다.");
    lines.push("각 옵션은 최소 T3 · 봉인된 옵션은 변경되지 않습니다.");
    return lines;
  }
  if (it.itemId === "item_gem_metamorph_6") {
    lines.push("장비의 모든 옵션 종류와 티어(T)를 다시 정합니다.");
    lines.push("각 옵션은 최소 T6 · 봉인된 옵션은 변경되지 않습니다.");
    return lines;
  }
  if (it.itemId === "item_gem_metamorph_8") {
    lines.push("장비의 모든 옵션 종류와 티어(T)를 다시 정합니다.");
    lines.push("각 옵션은 최소 T8 · 봉인된 옵션은 변경되지 않습니다.");
    return lines;
  }
  if (it.itemId === "item_gem_blessing") {
    lines.push("강화 성공 시 +2 상승. 대신 성공 확률이 크게 감소합니다.");
    lines.push("대장간 → 강화 탭에서 체크 후 강화하세요.");
    return lines;
  }

  if (isEnhanceProtectScrollItemId(it.itemId)) {
    lines.push("강화 실패 시 골드와 사용한 재료를 돌려받습니다. (주문서 1장은 소모)");
    lines.push("대장간 → 강화 탭에서 체크 후 강화하세요.");
    return lines;
  }

  if (it.itemId === "item_lesser_mana_stone") {
    lines.push("강화 보조 재료 — 선택 시 1개 소모, 성공률 +3%");
    lines.push("대장간 → 강화에서 선택해 사용합니다.");
    return lines;
  }
  if (it.itemId === "item_mana_stone") {
    lines.push("강화 보조 재료 — 선택 시 1개 소모, 성공률 +6%");
    lines.push("대장간 → 강화에서 선택해 사용합니다.");
    return lines;
  }
  if (it.itemId === "item_greater_mana_stone") {
    lines.push("강화 보조 재료 — 선택 시 1개 소모, 성공률 +10%");
    lines.push("대장간 → 강화에서 선택해 사용합니다.");
    return lines;
  }

  return lines;
}
