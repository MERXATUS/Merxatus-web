"use client";

import {
  formatLeaderboardPlayer,
  formatLeaderboardScore,
  type LeaderboardBoardView,
  type LeaderboardRankView,
  type LeaderboardRowView,
} from "@/shared/leaderboardView";

type Props = {
  board: LeaderboardBoardView;
  rows: LeaderboardRowView[];
  myRank?: LeaderboardRankView;
  highlightUserId?: string | null;
  loading?: boolean;
  emptyMessage?: string;
};

export function LeaderboardTable(props: Props) {
  const { board, rows, myRank, highlightUserId, loading } = props;

  return (
    <div className="leaderboard-table">
      {myRank ? (
        <div className="leaderboard-table__mine">
          <span className="leaderboard-table__mine-label">내 순위</span>
          <span className="leaderboard-table__mine-rank">#{myRank.rank}</span>
          <span className="leaderboard-table__mine-score">{formatLeaderboardScore(board, myRank.score)}</span>
        </div>
      ) : (
        <p className="leaderboard-table__unranked">아직 기록이 없어요. 도전해 보세요!</p>
      )}

      {loading && rows.length === 0 ? (
        <p className="leaderboard-table__loading">랭킹 불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="leaderboard-table__empty">{props.emptyMessage ?? "아직 랭킹 기록이 없어요."}</p>
      ) : (
        <ol className="leaderboard-table__list">
          {rows.map((row) => {
            const mine = highlightUserId != null && row.userId === highlightUserId;
            const top3 = row.rank <= 3;
            return (
              <li
                key={`${row.userId}-${row.rank}`}
                className={`leaderboard-table__row ${mine ? "leaderboard-table__row--mine" : ""} ${top3 ? `leaderboard-table__row--top${row.rank}` : ""}`.trim()}
              >
                <span className="leaderboard-table__pos">#{row.rank}</span>
                <span className="leaderboard-table__name">{formatLeaderboardPlayer(row)}</span>
                <span className="leaderboard-table__score">{formatLeaderboardScore(board, row.score)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
