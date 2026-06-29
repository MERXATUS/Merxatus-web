import towerJson from "../../data/tower.json";

export const TOWER_CONFIG_LITE = {
  name: towerJson.name,
  seasonKey: towerJson.seasonKey,
  leaderboardBoardKey: towerJson.leaderboardBoardKey ?? "tower",
};
