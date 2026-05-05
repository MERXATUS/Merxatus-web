/**
 * Usage: npx tsx scripts/grant-minion-eggs.ts <username> [quantity=10]
 */
import { PrismaClient } from "@prisma/client";

const EGG = "item_minion_egg";
const username = process.argv[2] ?? "yj0309";
const qty = Math.max(1, Math.floor(Number(process.argv[3] ?? "10")));

const p = new PrismaClient();
void (async () => {
  const user = await p.user.findUnique({ where: { username } });
  if (!user) {
    console.error("User not found:", username);
    process.exit(1);
  }
  await p.item.upsert({
    where: { id: EGG },
    create: { id: EGG, name: "미니언 알", category: "소비", tradable: true, grade: 1 },
    update: {},
  });
  await p.inventoryStack.upsert({
    where: { userId_itemId: { userId: user.id, itemId: EGG } },
    create: { userId: user.id, itemId: EGG, quantity: qty },
    update: { quantity: { increment: qty } },
  });
  const s = await p.inventoryStack.findUnique({
    where: { userId_itemId: { userId: user.id, itemId: EGG } },
  });
  console.log("OK", username, "item_minion_egg total:", s?.quantity);
  await p.$disconnect();
})();
