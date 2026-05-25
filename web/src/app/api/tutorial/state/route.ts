import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { getTutorialState } from "@/server/tutorialProgress";
import { syncTutorialMinionsForStep } from "@/server/tutorialMinionGrants";
import { TUTORIAL_STEPS, tutorialProgressPercent } from "@/shared/tutorial";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = requireUserId(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const state = await getTutorialState(prisma, auth.userId);
    const minionGrants = state.done
      ? []
      : await syncTutorialMinionsForStep(prisma, auth.userId, state.step);
    return Response.json({
      ok: true,
      step: state.step,
      done: state.done,
      current: state.current,
      steps: TUTORIAL_STEPS.map((s) => ({ id: s.id, title: s.title })),
      progressPercent: tutorialProgressPercent(state.step),
      minionGrants,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
