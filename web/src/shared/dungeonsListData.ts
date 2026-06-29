import dungeonsJson from "../../data/dungeons.json";
import { attachDungeonStageMeta } from "@/shared/dungeonStageProgression";

export type DungeonListEntry = {
  id: string;
  name: string;
  mode: "AUTO_WAVES" | "PUSH_LUCK" | "IDLE";
  maxFloors: number;
  maxPartySize: number;
  baseWaveSeconds: number;
  stage?: ReturnType<typeof attachDungeonStageMeta>["stage"];
};

function slimDungeon(d: (typeof dungeonsJson)[number]): DungeonListEntry {
  const withStage = attachDungeonStageMeta(d);
  return {
    id: withStage.id,
    name: withStage.name,
    mode: (withStage.mode ?? "IDLE") as "AUTO_WAVES" | "PUSH_LUCK" | "IDLE",
    maxFloors: withStage.maxFloors ?? 20,
    maxPartySize: withStage.maxPartySize ?? 1,
    baseWaveSeconds: withStage.baseWaveSeconds ?? 8,
    stage: withStage.stage,
  };
}

export const DUNGEONS_LIST_LITE: DungeonListEntry[] = dungeonsJson.map(slimDungeon);

export function dungeonsListLite(): DungeonListEntry[] {
  return DUNGEONS_LIST_LITE;
}
