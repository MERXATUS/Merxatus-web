import { z } from "zod";
import { readItemsCsvTemplate } from "@/server/adminData";
import { requireAdmin } from "@/server/adminAuth";
import { prisma } from "@/server/db";
import { clampItemGrade, defaultItemGradeForItemId } from "@/server/itemGrade";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    username: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    quantityPerItem: z.number().int().positive().max(999).optional(),
  })
  .refine((body) => Boolean(body.username?.trim() || body.userId?.trim()), {
    message: "USER_REQUIRED",
  });

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "UNAUTHORIZED" ? 401 : 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const quantityPerItem = Math.max(1, Math.floor(parsed.data.quantityPerItem ?? 1));
  const username = parsed.data.username?.trim();
  const userId = parsed.data.userId?.trim();

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await prisma.user.findUnique({ where: { username: username! } });
  if (!user) {
    return Response.json({ ok: false, error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const { path: csvPath, data: items } = await readItemsCsvTemplate();
  if (items.length === 0) {
    return Response.json(
      { ok: false, error: "ITEMS_CSV_EMPTY", message: `items.csv가 비었거나 없습니다: ${csvPath}` },
      { status: 400 },
    );
  }

  const granted: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const it of items) {
      const grade = clampItemGrade(it.grade ?? defaultItemGradeForItemId(it.id));
      await tx.item.upsert({
        where: { id: it.id },
        create: {
          id: it.id,
          name: it.name,
          category: it.category,
          tradable: it.tradable,
          grade,
        },
        update: { name: it.name, category: it.category, tradable: it.tradable, grade },
      });

      await tx.inventoryStack.upsert({
        where: { userId_itemId: { userId: user.id, itemId: it.id } },
        create: { userId: user.id, itemId: it.id, quantity: quantityPerItem },
        update: { quantity: { increment: quantityPerItem } },
      });

      granted.push(it.id);
    }
  });

  return Response.json({
    ok: true,
    userId: user.id,
    username: user.username,
    source: csvPath,
    quantityPerItem,
    itemCount: granted.length,
    itemIds: granted,
  });
}
