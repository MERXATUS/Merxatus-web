import { prisma } from "@/server/db";

export async function upsertLeaderboardScore(input: {
  userId: string;
  boardKey: string;
  seasonKey: string;
  score: number;
  displayName?: string | null;
}) {
  const score = Math.max(0, Math.floor(input.score));
  const existing = await prisma.leaderboardEntry.findUnique({
    where: {
      boardKey_seasonKey_userId: {
        boardKey: input.boardKey,
        seasonKey: input.seasonKey,
        userId: input.userId,
      },
    },
  });
  const nextScore = Math.max(score, existing?.score ?? 0);
  return prisma.leaderboardEntry.upsert({
    where: {
      boardKey_seasonKey_userId: {
        boardKey: input.boardKey,
        seasonKey: input.seasonKey,
        userId: input.userId,
      },
    },
    create: {
      boardKey: input.boardKey,
      seasonKey: input.seasonKey,
      userId: input.userId,
      score: nextScore,
      displayName: input.displayName ?? null,
    },
    update: {
      score: nextScore,
      ...(input.displayName != null ? { displayName: input.displayName } : {}),
    },
  });
}

export async function listLeaderboard(input: {
  boardKey: string;
  seasonKey?: string;
  limit?: number;
}) {
  const seasonKey = input.seasonKey ?? "default";
  const limit = Math.min(50, Math.max(1, input.limit ?? 20));
  const rows = await prisma.leaderboardEntry.findMany({
    where: { boardKey: input.boardKey, seasonKey },
    orderBy: [{ score: "desc" }, { updatedAt: "asc" }],
    take: limit,
    include: { user: { select: { username: true, honorTitle: true } } },
  });
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    username: r.user.username,
    score: r.score,
    displayName: r.displayName,
    honorTitle: r.user.honorTitle,
  }));
}

export async function incrementLeaderboardScore(input: {
  userId: string;
  boardKey: string;
  seasonKey: string;
  delta?: number;
  displayName?: string | null;
}) {
  const delta = Math.max(1, Math.floor(input.delta ?? 1));
  const existing = await prisma.leaderboardEntry.findUnique({
    where: {
      boardKey_seasonKey_userId: {
        boardKey: input.boardKey,
        seasonKey: input.seasonKey,
        userId: input.userId,
      },
    },
  });
  if (existing) {
    return prisma.leaderboardEntry.update({
      where: {
        boardKey_seasonKey_userId: {
          boardKey: input.boardKey,
          seasonKey: input.seasonKey,
          userId: input.userId,
        },
      },
      data: {
        score: existing.score + delta,
        ...(input.displayName != null ? { displayName: input.displayName } : {}),
      },
    });
  }
  return prisma.leaderboardEntry.create({
    data: {
      boardKey: input.boardKey,
      seasonKey: input.seasonKey,
      userId: input.userId,
      score: delta,
      displayName: input.displayName ?? null,
    },
  });
}

export async function getUserLeaderboardRank(input: {
  userId: string;
  boardKey: string;
  seasonKey?: string;
}) {
  const seasonKey = input.seasonKey ?? "default";
  const row = await prisma.leaderboardEntry.findUnique({
    where: {
      boardKey_seasonKey_userId: {
        boardKey: input.boardKey,
        seasonKey,
        userId: input.userId,
      },
    },
  });
  if (!row) return null;
  const higher = await prisma.leaderboardEntry.count({
    where: { boardKey: input.boardKey, seasonKey, score: { gt: row.score } },
  });
  return { rank: higher + 1, score: row.score };
}
