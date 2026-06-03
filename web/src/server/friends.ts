import { prisma } from "@/server/db";

export async function findUserByUsername(username: string) {
  const trimmed = username.trim();
  if (!trimmed) return null;
  return prisma.user.findUnique({
    where: { username: trimmed },
    select: { id: true, username: true },
  });
}

export async function sendFriendRequest(input: { userId: string; targetUsername: string }) {
  const { userId, targetUsername } = input;
  const target = await findUserByUsername(targetUsername);
  if (!target) throw new Error("FRIEND_USER_NOT_FOUND");
  if (target.id === userId) throw new Error("CANNOT_FRIEND_SELF");

  const reverse = await prisma.friendship.findUnique({
    where: { requesterId_addresseeId: { requesterId: target.id, addresseeId: userId } },
  });
  if (reverse?.status === "PENDING") {
    return acceptFriendRequest({ userId, requestId: reverse.id });
  }
  if (reverse?.status === "ACCEPTED") throw new Error("ALREADY_FRIENDS");

  const existing = await prisma.friendship.findUnique({
    where: { requesterId_addresseeId: { requesterId: userId, addresseeId: target.id } },
  });
  if (existing) {
    if (existing.status === "ACCEPTED") throw new Error("ALREADY_FRIENDS");
    if (existing.status === "PENDING") throw new Error("REQUEST_ALREADY_SENT");
    if (existing.status === "REJECTED") {
      await prisma.friendship.update({
        where: { id: existing.id },
        data: { status: "PENDING", respondedAt: null },
      });
      return { ok: true as const, status: "PENDING" as const };
    }
  }

  await prisma.friendship.create({
    data: { requesterId: userId, addresseeId: target.id, status: "PENDING" },
  });
  return { ok: true as const, status: "PENDING" as const };
}

export async function acceptFriendRequest(input: { userId: string; requestId: string }) {
  const row = await prisma.friendship.findUnique({ where: { id: input.requestId } });
  if (!row || row.addresseeId !== input.userId) throw new Error("FRIEND_REQUEST_NOT_FOUND");
  if (row.status !== "PENDING") throw new Error("FRIEND_REQUEST_NOT_PENDING");

  const now = new Date();
  await prisma.friendship.update({
    where: { id: row.id },
    data: { status: "ACCEPTED", respondedAt: now },
  });
  return { ok: true as const, status: "ACCEPTED" as const };
}

export async function rejectFriendRequest(input: { userId: string; requestId: string }) {
  const row = await prisma.friendship.findUnique({ where: { id: input.requestId } });
  if (!row || row.addresseeId !== input.userId) throw new Error("FRIEND_REQUEST_NOT_FOUND");
  if (row.status !== "PENDING") throw new Error("FRIEND_REQUEST_NOT_PENDING");

  await prisma.friendship.update({
    where: { id: row.id },
    data: { status: "REJECTED", respondedAt: new Date() },
  });
  return { ok: true as const, status: "REJECTED" as const };
}

export async function cancelFriendRequest(input: { userId: string; requestId: string }) {
  const row = await prisma.friendship.findUnique({ where: { id: input.requestId } });
  if (!row || row.requesterId !== input.userId) throw new Error("FRIEND_REQUEST_NOT_FOUND");
  if (row.status !== "PENDING") throw new Error("FRIEND_REQUEST_NOT_PENDING");

  await prisma.friendship.delete({ where: { id: row.id } });
  return { ok: true as const };
}

export async function removeFriend(input: { userId: string; friendUserId: string }) {
  const deleted = await prisma.friendship.deleteMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: input.userId, addresseeId: input.friendUserId },
        { requesterId: input.friendUserId, addresseeId: input.userId },
      ],
    },
  });
  if (deleted.count === 0) throw new Error("NOT_FRIENDS");
  return { ok: true as const };
}

export async function areFriends(userId: string, otherUserId: string) {
  const row = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userId, addresseeId: otherUserId },
        { requesterId: otherUserId, addresseeId: userId },
      ],
    },
    select: { id: true },
  });
  return !!row;
}

export async function listFriendships(userId: string) {
  const [incoming, outgoing, acceptedSent, acceptedReceived] = await Promise.all([
    prisma.friendship.findMany({
      where: { addresseeId: userId, status: "PENDING" },
      include: { requester: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendship.findMany({
      where: { requesterId: userId, status: "PENDING" },
      include: { addressee: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendship.findMany({
      where: { requesterId: userId, status: "ACCEPTED" },
      include: { addressee: { select: { id: true, username: true } } },
    }),
    prisma.friendship.findMany({
      where: { addresseeId: userId, status: "ACCEPTED" },
      include: { requester: { select: { id: true, username: true } } },
    }),
  ]);

  const friendMap = new Map<string, { id: string; userId: string; username: string; since: string }>();
  for (const r of acceptedSent) {
    friendMap.set(r.addressee.id, {
      id: r.id,
      userId: r.addressee.id,
      username: r.addressee.username,
      since: (r.respondedAt ?? r.createdAt).toISOString(),
    });
  }
  for (const r of acceptedReceived) {
    friendMap.set(r.requester.id, {
      id: r.id,
      userId: r.requester.id,
      username: r.requester.username,
      since: (r.respondedAt ?? r.createdAt).toISOString(),
    });
  }

  const friends = [...friendMap.values()].sort((a, b) =>
    a.username.localeCompare(b.username, "ko"),
  );

  return {
    incoming: incoming.map((r: (typeof incoming)[number]) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      from: { id: r.requester.id, username: r.requester.username },
    })),
    outgoing: outgoing.map((r: (typeof outgoing)[number]) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      to: { id: r.addressee.id, username: r.addressee.username },
    })),
    friends,
  };
}
