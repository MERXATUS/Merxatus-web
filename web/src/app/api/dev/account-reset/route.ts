import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { assertDevApiAllowed } from "@/server/devApiGuard";
import { resetTutorialAndSpecialistForDev } from "@/server/devAccountReset";
import { getTutorialState } from "@/server/tutorialProgress";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
});

function jsonError(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

/**
 * 개발용: 튜토리얼 진행·전문 직업 선택을 초기화합니다.
 * 골드·인벤·시설·미니언 등은 그대로 둡니다.
 */
export async function POST(req: Request) {
  const dev = assertDevApiAllowed();
  if (!dev.ok) return jsonError(403, { ok: false, error: dev.error });

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return jsonError(400, { ok: false, error: "BAD_REQUEST" });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return jsonError(401, { ok: false, error: auth.error });

    const exists = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true },
    });
    if (!exists) return jsonError(404, { ok: false, error: "USER_NOT_FOUND" });

    const reset = await resetTutorialAndSpecialistForDev(prisma, auth.userId);

    let tutorialStep: number | null = null;
    let tutorialDone: boolean | null = null;
    try {
      const tutorial = await getTutorialState(prisma, auth.userId);
      tutorialStep = tutorial.step;
      tutorialDone = tutorial.done;
    } catch (stateErr) {
      console.warn("[api/dev/account-reset] getTutorialState", stateErr);
      if (!reset.warning) {
        reset.warning =
          '전문 직업은 초기화됐지만 tutorialStep을 읽지 못했어요. `npx prisma db push` 후 다시 시도해 주세요.';
      }
    }

    return Response.json({
      ok: true,
      userId: auth.userId,
      reset: reset.fields,
      warning: reset.warning,
      tutorialStep,
      tutorialDone,
    });
  } catch (e) {
    console.error("[api/dev/account-reset]", e);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2022") {
        return jsonError(503, {
          ok: false,
          error: "DB_SCHEMA_MISSING",
          hint: 'web 폴더에서 `npx prisma db push`로 User.tutorialStep 등 스키마를 맞춰 주세요.',
          prismaCode: e.code,
        });
      }
      return jsonError(500, {
        ok: false,
        error: "PRISMA",
        prismaCode: e.code,
        message: e.message.slice(0, 500),
        hint: '스키마가 오래됐을 수 있어요. web에서 `npx prisma db push`를 실행해 보세요.',
      });
    }

    const message = e instanceof Error ? e.message : "UNKNOWN";
    const isValidation =
      e instanceof Prisma.PrismaClientValidationError ||
      message.includes("Invalid `prisma.user.update()`");
    return jsonError(500, {
      ok: false,
      error: isValidation ? "PRISMA_CLIENT_STALE" : message,
      message: message.slice(0, 500),
      hint: isValidation
        ? "dev 서버를 끄고 web에서 `npx prisma generate` 후 `npm run dev`로 다시 켜 주세요."
        : undefined,
    });
  }
}
