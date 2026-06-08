import { loadRaids } from "@/server/raidData";
import { loadTowerConfig } from "@/server/towerData";
import { PVP_BOARD_KEY, PVP_SEASON_KEY } from "@/server/pvpRun";
import { GAME_FEATURES } from "@/shared/gameFeatureFlags";
import type { LeaderboardBoardView } from "@/shared/leaderboardView";

export const RAID_TOTAL_BOARD_KEY = "raid:total";

export async function listLeaderboardBoardDefs(): Promise<LeaderboardBoardView[]> {
  const boards: LeaderboardBoardView[] = [];

  if (GAME_FEATURES.towerEnabled) {
    const tower = await loadTowerConfig();
    boards.push({
      boardKey: tower.leaderboardBoardKey,
      seasonKey: tower.seasonKey,
      label: tower.name,
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

    const { raids } = await loadRaids();
    for (const raid of raids) {
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

export async function resolveLeaderboardBoard(boardKey: string): Promise<LeaderboardBoardView | null> {
  const boards = await listLeaderboardBoardDefs();
  return boards.find((b) => b.boardKey === boardKey) ?? null;
}
