import { prisma } from "@/server/db";
import type { SpecialistProfessionSlug } from "@/shared/specialistProfession";
import { playerMatchesProcessWorkshop, processWorkshopNamesForProfession } from "@/shared/specialistProfession";
import { installWorkshopForUser } from "@/server/workshopPlot";

export type EnsureSpecialistWorkshopsResult = {
  installed: string[];
  workshopIds: string[];
  skipped: string[];
};

/** 선택한 전문 직업에 맞는 가공(PROCESS) 시설을 자동 설치한다. */
export async function ensureSpecialistWorkshopsForUser(
  userId: string,
  profession: SpecialistProfessionSlug,
): Promise<EnsureSpecialistWorkshopsResult> {
  const targetNames = [...processWorkshopNamesForProfession(profession)];
  if (targetNames.length === 0) {
    return { installed: [], workshopIds: [], skipped: [] };
  }

  const [types, existing] = await Promise.all([
    prisma.workshopType.findMany({
      where: { kind: "PROCESS", name: { in: targetNames } },
      select: { id: true, name: true },
    }),
    prisma.workshopInstance.findMany({
      where: { userId },
      include: { workshopType: { select: { id: true, name: true, kind: true } } },
    }),
  ]);

  const byTypeId = new Set(existing.map((w) => w.workshopTypeId));
  const byName = new Set(
    existing
      .filter((w) => w.workshopType.kind === "PROCESS" && playerMatchesProcessWorkshop(w.workshopType.name, profession))
      .map((w) => w.workshopType.name),
  );

  const installed: string[] = [];
  const workshopIds: string[] = [];
  const skipped: string[] = [];

  for (const name of targetNames) {
    const type = types.find((t) => t.name === name);
    if (!type) {
      skipped.push(name);
      continue;
    }
    if (byTypeId.has(type.id) || byName.has(name)) {
      const inst = existing.find((w) => w.workshopTypeId === type.id || w.workshopType.name === name);
      if (inst) workshopIds.push(inst.id);
      continue;
    }

    const r = await installWorkshopForUser({ userId, workshopTypeId: type.id });
    if (r.ok) {
      installed.push(name);
      workshopIds.push(r.workshopId);
      byTypeId.add(type.id);
      byName.add(name);
    } else {
      skipped.push(name);
    }
  }

  return { installed, workshopIds, skipped };
}
