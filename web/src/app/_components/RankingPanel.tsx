"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LeaderboardTable } from "@/app/_components/LeaderboardTable";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { API_CACHE_TTL } from "@/shared/apiCache";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import { formatPanelError } from "@/shared/formatPanelError";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";
import {
  type LeaderboardBoardView,
  type LeaderboardRankView,
  type LeaderboardRowView,
} from "@/shared/leaderboardView";
import { LEADERBOARD_BOARD_DEFS } from "@/shared/leaderboardBoardsData";
import { apiGetJsonCached } from "@/shared/sessionClient";

type BoardsResponse = { ok: true; boards: LeaderboardBoardView[] };
type LeaderboardResponse = {
  ok: true;
  board: LeaderboardBoardView;
  seasonKey: string;
  rank: LeaderboardRankView;
  leaderboard: LeaderboardRowView[];
};

export function RankingPanel({ embedded = false }: EmbeddedPanelProps = {}) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [boards, setBoards] = useState<LeaderboardBoardView[]>(LEADERBOARD_BOARD_DEFS);
  const [boardKey, setBoardKey] = useState<string | null>(null);
  const [rank, setRank] = useState<LeaderboardRankView>(null);
  const [rows, setRows] = useState<LeaderboardRowView[]>([]);
  const [activeBoard, setActiveBoard] = useState<LeaderboardBoardView | null>(null);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [boardLoading, setBoardLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBoards = useCallback(async (force = false) => {
    setBoardsLoading(false);
    setBoards(LEADERBOARD_BOARD_DEFS);
    setBoardKey((prev) => {
      if (prev && LEADERBOARD_BOARD_DEFS.some((b) => b.boardKey === prev)) return prev;
      return LEADERBOARD_BOARD_DEFS[0]?.boardKey ?? null;
    });
    void force;
  }, []);

  const loadBoard = useCallback(
    async (key: string, force = false) => {
      setBoardLoading(true);
      setError(null);
      try {
        const r = await apiGetJsonCached<LeaderboardResponse>(
          `/api/leaderboard?boardKey=${encodeURIComponent(key)}&limit=20`,
          { ttlMs: API_CACHE_TTL.leaderboard, force },
        );
        setActiveBoard(r.board);
        setRank(r.rank);
        setRows(r.leaderboard);
      } catch (e) {
        setError(formatPanelError(e));
      } finally {
        setBoardLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!user) {
      setBoards([]);
      setBoardKey(null);
      setBoardsLoading(false);
      return;
    }
    void loadBoards();
  }, [user, loadBoards]);

  useEffect(() => {
    if (!boardKey || !user) return;
    void loadBoard(boardKey);
  }, [boardKey, user, loadBoard]);

  useEffect(() => {
    if (!embedded || !user) return;
    const onRefresh = () => {
      void loadBoards(true);
      if (boardKey) void loadBoard(boardKey, true);
    };
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
  }, [embedded, user, boardKey, loadBoards, loadBoard]);

  const towerBoards = useMemo(() => boards.filter((b) => b.kind === "tower"), [boards]);
  const pvpBoards = useMemo(() => boards.filter((b) => b.kind === "pvp"), [boards]);
  const raidBoards = useMemo(() => boards.filter((b) => b.kind === "raid"), [boards]);

  if (!embedded && sessionLoading) {
    return <GamePanelLoading label="세션 확인 중…" />;
  }
  if (!embedded && !user) {
    return <GamePanelInfo>로그인이 필요합니다.</GamePanelInfo>;
  }

  return (
    <GamePanel className={`ranking-panel ${embedded ? "ranking-panel--fit panel-fit" : ""}`}>
      <header className="ranking-panel__head">
        <div>
          <p className="game-label">경쟁</p>
          <h2 className="game-title text-lg">랭킹</h2>
          <p className="mt-1 text-xs text-[var(--game-muted)]">
            탑 · 결투 · 레이드 순위
          </p>
        </div>
        {!embedded ? (
          <GameBtn
            variant="ghost"
            className="h-8 text-xs"
            disabled={boardsLoading || boardLoading}
            onClick={() => {
              void loadBoards(true);
              if (boardKey) void loadBoard(boardKey, true);
            }}
          >
            새로고침
          </GameBtn>
        ) : null}
      </header>

      {error ? <GamePanelError className="mt-3" error={error} /> : null}

      {boardsLoading && boards.length === 0 ? (
        <GamePanelLoading label="랭킹 보드 불러오는 중…" />
      ) : boards.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--game-muted)]">표시할 랭킹이 없어요.</p>
      ) : (
        <>
          <div className="ranking-panel__board-pick">
            {towerBoards.length > 0 ? (
              <div className="ranking-panel__board-group">
                <p className="ranking-panel__board-group-label">삼계의 탑</p>
                <div className="ranking-panel__board-tabs">
                  {towerBoards.map((b) => (
                    <button
                      key={b.boardKey}
                      type="button"
                      className={`ranking-panel__board-tab ${boardKey === b.boardKey ? "ranking-panel__board-tab--active" : ""}`}
                      onClick={() => setBoardKey(b.boardKey)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {pvpBoards.length > 0 ? (
              <div className="ranking-panel__board-group">
                <p className="ranking-panel__board-group-label">결투</p>
                <div className="ranking-panel__board-tabs">
                  {pvpBoards.map((b) => (
                    <button
                      key={b.boardKey}
                      type="button"
                      className={`ranking-panel__board-tab ${boardKey === b.boardKey ? "ranking-panel__board-tab--active" : ""}`}
                      onClick={() => setBoardKey(b.boardKey)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {raidBoards.length > 0 ? (
              <div className="ranking-panel__board-group">
                <p className="ranking-panel__board-group-label">레이드</p>
                <select
                  className="market-input market-input--select ranking-panel__board-select"
                  value={raidBoards.some((b) => b.boardKey === boardKey) ? boardKey ?? "" : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setBoardKey(v);
                  }}
                >
                  <option value="" disabled>
                    레이드 보드 선택
                  </option>
                  {raidBoards.map((b) => (
                    <option key={b.boardKey} value={b.boardKey}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {activeBoard ? (
            <div className="ranking-panel__body">
              <div className="ranking-panel__board-meta">
                <h3 className="ranking-panel__board-title">{activeBoard.label}</h3>
                <p className="ranking-panel__board-desc">{activeBoard.description}</p>
              </div>
              <LeaderboardTable
                board={activeBoard}
                rows={rows}
                myRank={rank}
                highlightUserId={user?.id}
                loading={boardLoading}
              />
            </div>
          ) : null}
        </>
      )}
    </GamePanel>
  );
}
