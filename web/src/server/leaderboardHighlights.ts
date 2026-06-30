import { getUserLeaderboardRank } from "@/server/leaderboard";
import { listLeaderboardBoardDefs, RAID_TOTAL_BOARD_KEY } from "@/server/leaderboardBoards";
import { PVP_BOARD_KEY, PVP_SEASON_KEY } from "@/server/pvpRun";
import { loadTowerConfig } from "@/server/towerData";
import { GAME_FEATURES } from "@/shared/gameFeatureFlags";
import { formatLeaderboardScore } from "@/shared/leaderboardView";
import type { MeDashboardLeaderboardHighlight } from "@/shared/meDashboard";

export async function buildLeaderboardHighlights(userId: string): Promise<MeDashboardLeaderboardHighlight[]> {
  const tasks: Promise<MeDashboardLeaderboardHighlight | null>[] = [];

  if (GAME_FEATURES.towerEnabled) {
    tasks.push(
      (async () => {
        const tower = await loadTowerConfig();
        const rank = await getUserLeaderboardRank({
          userId,
          boardKey: tower.leaderboardBoardKey,
          seasonKey: tower.seasonKey,
        });
        if (!rank) return null;
        const board = { scoreUnit: "층", kind: "tower" as const };
        return {
          boardKey: tower.leaderboardBoardKey,
          label: tower.name,
          rank: rank.rank,
          score: rank.score,
          scoreLabel: formatLeaderboardScore(board, rank.score),
        };
      })(),
    );
  }

  if (GAME_FEATURES.pvpEnabled) {
    tasks.push(
      (async () => {
        const rank = await getUserLeaderboardRank({
          userId,
          boardKey: PVP_BOARD_KEY,
          seasonKey: PVP_SEASON_KEY,
        });
        if (!rank) return null;
        return {
          boardKey: PVP_BOARD_KEY,
          label: "결투 승수",
          rank: rank.rank,
          score: rank.score,
          scoreLabel: formatLeaderboardScore({ scoreUnit: "승", kind: "pvp" }, rank.score),
        };
      })(),
    );
  }

  if (GAME_FEATURES.raidEnabled) {
    tasks.push(
      (async () => {
        const rank = await getUserLeaderboardRank({
          userId,
          boardKey: RAID_TOTAL_BOARD_KEY,
          seasonKey: "default",
        });
        if (!rank) return null;
        const board = { scoreUnit: "회", kind: "raid" as const };
        return {
          boardKey: RAID_TOTAL_BOARD_KEY,
          label: "레이드 클리어",
          rank: rank.rank,
          score: rank.score,
          scoreLabel: formatLeaderboardScore(board, rank.score),
        };
      })(),
    );
  }

  const results = await Promise.all(tasks);
  return results.filter((h): h is MeDashboardLeaderboardHighlight => h != null);
}

export async function defaultLeaderboardBoardKey(): Promise<string | null> {
  const boards = await listLeaderboardBoardDefs();
  return boards[0]?.boardKey ?? null;
}
