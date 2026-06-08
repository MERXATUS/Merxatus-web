export type LeaderboardRowView = {
  rank: number;
  userId: string;
  username: string;
  score: number;
  displayName: string | null;
  honorTitle: string | null;
};

export type LeaderboardRankView = {
  rank: number;
  score: number;
} | null;

export type LeaderboardBoardKind = "tower" | "raid" | "pvp";

export type LeaderboardBoardView = {
  boardKey: string;
  seasonKey: string;
  label: string;
  description: string;
  scoreUnit: string;
  kind: LeaderboardBoardKind;
};

export function formatLeaderboardPlayer(row: Pick<LeaderboardRowView, "username" | "honorTitle" | "displayName">) {
  const name = row.displayName?.trim() || row.username;
  return row.honorTitle?.trim() ? `${row.honorTitle} ${name}` : name;
}

export function formatLeaderboardScore(board: Pick<LeaderboardBoardView, "scoreUnit" | "kind">, score: number) {
  const n = Math.max(0, Math.floor(score));
  if (board.kind === "tower") return `${n}${board.scoreUnit}`;
  return `${n.toLocaleString()}${board.scoreUnit}`;
}
