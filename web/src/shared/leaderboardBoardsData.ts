import raidsJson from "../../data/raids.json";
import towerJson from "../../data/tower.json";
import { GAME_FEATURES } from "@/shared/gameFeatureFlags";
import type { LeaderboardBoardView } from "@/shared/leaderboardView";

export const RAID_TOTAL_BOARD_KEY = "raid:total";
export const PVP_BOARD_KEY = "pvp";
export const PVP_SEASON_KEY = "default";

export function leaderboardBoardDefs(): LeaderboardBoardView[] {
  const boards: LeaderboardBoardView[] = [];

  if (GAME_FEATURES.towerEnabled) {
    boards.push({
      boardKey: towerJson.leaderboardBoardKey ?? "tower",
      seasonKey: towerJson.seasonKey,
      label: towerJson.name,
      description: "최고 클리어 층 기준 · 정산·패배 시 기록",
      scoreUnit: "층",
      kind: "tower",
    });
  }

  if (GAME_FEATURES.pvpEnabled) {
    boards.push({
      boardKey: PVP_BOARD_KEY,
      seasonKey: PVP_SEASON_KEY,
      label: "결투 승수",
      description: "대표 미니언 결투 승리 횟수",
      scoreUnit: "승",
      kind: "pvp",
    });
  }

  if (GAME_FEATURES.raidEnabled) {
    boards.push({
      boardKey: RAID_TOTAL_BOARD_KEY,
      seasonKey: "default",
      label: "레이드 총 클리어",
      description: "모든 레이드 클리어 합산",
      scoreUnit: "회",
      kind: "raid",
    });

    for (const raid of raidsJson) {
      boards.push({
        boardKey: `raid:${raid.id}`,
        seasonKey: "default",
        label: raid.name,
        description: `${raid.name} 클리어 횟수`,
        scoreUnit: "회",
        kind: "raid",
      });
    }
  }

  return boards;
}

export const LEADERBOARD_BOARD_DEFS = leaderboardBoardDefs();
