import { buildSimpleDropPoolSection } from "@/shared/contentDropTable";
import type { DungeonDropRowInput, DungeonDropTableSection } from "@/shared/dungeonDropTable";

export function buildRaidDropTableSections(
  phaseDrops: DungeonDropRowInput[],
  clearDrops: DungeonDropRowInput[],
): DungeonDropTableSection[] {
  const sections: DungeonDropTableSection[] = [];

  if (phaseDrops.length > 0) {
    const phase = buildSimpleDropPoolSection(phaseDrops, {
      id: "phase-clear",
      label: "페이즈 클리어",
      kind: "normal",
      floorLabel: "페이즈당 1회",
    });
    if (phase) sections.push(phase);
  }

  if (clearDrops.length > 0) {
    const clear = buildSimpleDropPoolSection(clearDrops, {
      id: "raid-clear",
      label: "레이드 클리어",
      kind: "boss",
      floorLabel: "클리어 시 2회 추첨",
    });
    if (clear) sections.push(clear);
  }

  return sections;
}
