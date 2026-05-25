/**
 * 고용권(미니언 티켓) 인벤 지급
 *
 *   npx tsx scripts/grant-minion-tickets.ts <username> [qtyPerTicket=3]
 *   npx tsx scripts/grant-minion-tickets.ts yj0309 5 item_minion_ticket
 */
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

const username = process.argv[2] ?? "yj0309";
const qty = Math.max(1, Math.floor(Number(process.argv[3] ?? "3")));
const onlyItemId = process.argv[4]?.trim().toLowerCase();

async function loadTicketIds() {
  const dir = path.join(process.cwd(), "data", "csv-templates");
  const text = await readFile(path.join(dir, "minion_tickets.csv"), "utf8");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const ids: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]!.split(",")[0]?.trim();
    if (!raw) continue;
    const id = raw.replace(/\s+/g, "_").replace(/-+/g, "_").toLowerCase();
    ids.push(id);
  }
  return ids;
}

const p = new PrismaClient();
void (async () => {
  const user = await p.user.findUnique({ where: { username } });
  if (!user) {
    console.error("User not found:", username);
    process.exit(1);
  }

  const ticketIds = onlyItemId ? [onlyItemId] : await loadTicketIds();
  const items = await p.item.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, name: true, category: true, tradable: true, grade: true },
  });
  const itemById = new Map(items.map((x) => [x.id, x]));

  for (const itemId of ticketIds) {
    const def = itemById.get(itemId);
    if (!def) {
      console.warn("SKIP (item missing in DB):", itemId);
      continue;
    }
    await p.inventoryStack.upsert({
      where: { userId_itemId: { userId: user.id, itemId } },
      create: { userId: user.id, itemId, quantity: qty },
      update: { quantity: { increment: qty } },
    });
    const s = await p.inventoryStack.findUnique({
      where: { userId_itemId: { userId: user.id, itemId } },
    });
    console.log("OK", itemId, "→", s?.quantity);
  }

  console.log("\nuserId:", user.id, "| dev_userId로 localStorage에 넣고 인벤에서 고용 테스트");
  await p.$disconnect();
})();
