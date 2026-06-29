export type DungeonDropTableEntryView = {
  itemId: string;
  name: string;
  grade: number;
  gradeLabel: string;
  icon: string | null;
  iconSrc: string;
  chancePct: number;
  minQty: number;
  maxQty: number;
  floorLabel: string;
  category: "equipment" | "consumable" | "material" | "other";
};

export type DungeonDropTableSectionView = {
  id: string;
  label: string;
  kind: "normal" | "boss";
  floorMin: number;
  floorMax: number;
  rows: DungeonDropTableEntryView[];
};

export type DungeonDropTablePayloadView = {
  dungeonId: string;
  dungeonName: string;
  maxFloors: number;
  gearPlanNotes: string | null;
  sections: DungeonDropTableSectionView[];
};

export type DungeonDropTablesById = Record<string, DungeonDropTablePayloadView>;
