import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { attemptArmorInstanceUpgrade } from "@/server/armorInstanceUpgrade";
import { tryTutorialEnhanceEquipment, ensureTutorialEnhanceBudget } from "@/server/tutorialProgress";
import { ENHANCE_MANA_STONE_ITEM_IDS } from "@/server/weaponUpgradeRules";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  armorInstanceId: z.string().min(1),
  useProtectionScroll: z.boolean().optional(),
  useBlessingGem: z.boolean().optional(),
  manaStoneItemId: z.enum(ENHANCE_MANA_STONE_ITEM_IDS).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    await ensureTutorialEnhanceBudget(prisma, auth.userId);
    const result = await prisma.$transaction(async (tx) =>
      attemptArmorInstanceUpgrade(tx, {
        userId: auth.userId,
        armorInstanceId: parsed.data.armorInstanceId,
        useProtectionScroll: parsed.data.useProtectionScroll,
        useBlessingGem: parsed.data.useBlessingGem,
        manaStoneItemId: parsed.data.manaStoneItemId,
      }),
    );
    const tutorial = await tryTutorialEnhanceEquipment(prisma, auth.userId);
    return Response.json({ ...result, tutorialAdvanced: tutorial.advanced });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
