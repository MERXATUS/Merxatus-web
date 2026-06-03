/**
 * Usage: npx tsx scripts/wipe-user-minions.ts <username>
 * 예: npx tsx scripts/wipe-user-minions.ts yj0309
 */
import { PrismaClient } from "@prisma/client";

const username = process.argv[2] ?? "yj0309";
const p = new PrismaClient();

void (async () => {
  const user = await p.user.findUnique({ where: { username } });
  if (!user) {
    console.error("User not found:", username);
    process.exit(1);
  }
  const before = await p.minion.count({ where: { userId: user.id } });
  console.log("Wiping minions for", username, user.id, "count:", before);

  await p.$transaction(async (tx) => {
    await tx.dungeonRun.deleteMany({ where: { userId: user.id } });
    await tx.minion.deleteMany({ where: { userId: user.id } });
    await tx.minionInventory.upsert({
      where: { userId: user.id },
      create: { userId: user.id, owned: 0, dungeonOwned: 0 },
      update: { owned: 0, dungeonOwned: 0 },
    });
  });

  const after = await p.minion.count({ where: { userId: user.id } });
  console.log("Done. Remaining minions:", after);
  await p.$disconnect();
})();
