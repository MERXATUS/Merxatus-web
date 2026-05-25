import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { setUserSpecialistUnlockedTrue } from "@/server/userSpecialistDb";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
});

function jsonError(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

/** 로컬 개발용: 전문 직업 선택 퀘스트를 생략하고 해제 플래그만 켠다. */
export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(400, { ok: false, error: "BAD_REQUEST" });
    }

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return jsonError(401, { ok: false, error: auth.error });

    const exists = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true },
    });
    if (!exists) {
      return jsonError(404, { ok: false, error: "USER_NOT_FOUND" });
    }

    await setUserSpecialistUnlockedTrue(prisma, auth.userId);

    return Response.json({ ok: true });
  } catch (e) {
    console.error("[api/dev/specialist-unlock]", e);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2022") {
        return jsonError(503, {
          ok: false,
          error: "DB_SCHEMA_MISSING",
          prismaCode: e.code,
          hint: 'DB에 "User"."specialistUnlocked" 등 전문 직업 컬럼이 없습니다. web 폴더에서 `npx prisma db push`를 실행하세요.',
        });
      }
      return jsonError(500, {
        ok: false,
        error: "PRISMA",
        prismaCode: e.code,
        meta: e.meta,
      });
    }

    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(500, {
      ok: false,
      error: "INTERNAL",
      message: msg.slice(0, 800),
    });
  }
}
