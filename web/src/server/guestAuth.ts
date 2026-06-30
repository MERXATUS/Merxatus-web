import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { ensureUserBootstrap } from "@/server/ensureUserBootstrap";

function randomGuestSuffix() {
  return crypto.randomBytes(3).toString("hex");
}

async function allocateGuestUsername() {
  for (let i = 0; i < 16; i++) {
    const suffix = randomGuestSuffix();
    const username = `guest_${suffix}`;
    const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!taken) return username;
  }
  return `guest_${crypto.randomBytes(5).toString("hex")}`;
}

/** 익명 게스트 계정 생성 (googleId 없음, 즉시 플레이 가능) */
export async function createGuestUser() {
  const username = await allocateGuestUsername();

  const user = await prisma.user.create({
    data: {
      username,
      usernameChosen: true,
      googleId: null,
      email: null,
    },
  });

  await ensureUserBootstrap(user.id);
  return user;
}
