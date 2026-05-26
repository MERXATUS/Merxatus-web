import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { getUserSpecialistRow, setUserSpecialistProfession } from "@/server/userSpecialistDb";
import { tryTutorialSpecialistChosen } from "@/server/tutorialProgress";
import { ensureSpecialistWorkshopsForUser } from "@/server/ensureSpecialistWorkshops";
import { invalidateWorkshopEnsureCache } from "@/server/ensureWorkshopsForUser";
import type { SpecialistProfessionSlug } from "@/shared/specialistProfession";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  profession: z.enum(["BLACKSMITH", "ALCHEMIST", "JEWELER"]),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const user = await getUserSpecialistRow(prisma, auth.userId);
  if (!user) return Response.json({ ok: false, error: "USER_NOT_FOUND" }, { status: 404 });
  if (!user.specialistUnlocked) {
    return Response.json({ ok: false, error: "SPECIALIST_LOCKED" }, { status: 403 });
  }
  if (user.specialistProfession != null) {
    return Response.json({ ok: false, error: "SPECIALIST_ALREADY_CHOSEN" }, { status: 400 });
  }

  await setUserSpecialistProfession(prisma, auth.userId, parsed.data.profession);
  invalidateWorkshopEnsureCache(auth.userId);
  await tryTutorialSpecialistChosen(prisma, auth.userId);

  const workshops = await ensureSpecialistWorkshopsForUser(
    auth.userId,
    parsed.data.profession as SpecialistProfessionSlug,
  );

  return Response.json({
    ok: true,
    specialistProfession: parsed.data.profession,
    workshopsInstalled: workshops.installed,
    workshopIds: workshops.workshopIds,
    workshopsSkipped: workshops.skipped,
  });
}
