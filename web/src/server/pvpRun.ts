import { prisma } from "@/server/db";
import { incrementLeaderboardScore } from "@/server/leaderboard";
import { buildPartyCombatants } from "@/server/dungeonBattler";
import { loadPartyCombatRows, type PartyCombatDb } from "@/server/minionCombatBuild";
import { simulatePvpDuel } from "@/server/pvpCombat";
import { buildPvpCombatReplay } from "@/server/pvpReplay";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";

export const PVP_BOARD_KEY = "pvp";
export const PVP_SEASON_KEY = "default";
export const PVP_DAILY_ATTACK_LIMIT = 20;

const minionSelect = {
  id: true,
  level: true,
  jobType: true,
  equippedWeaponInstanceId: true,
  strength: true,
  agility: true,
  intelligence: true,
  endurance: true,
  promotionTier: true,
  promotionClass: true,
  skillLevelsJson: true,
} as const;

type MinionRow = {
  id: string;
  level: number;
  jobType: string;
  equippedWeaponInstanceId: string | null;
  strength: number | null;
  agility: number | null;
  intelligence: number | null;
  endurance: number | null;
  promotionTier: number | null;
  promotionClass: string | null;
  skillLevelsJson: string | null;
};

async function loadRepresentativeMinionRow(db: PartyCombatDb, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { representativeMinionId: true },
  });
  if (!user?.representativeMinionId) return null;

  const minion = await db.minion.findFirst({
    where: { id: user.representativeMinionId, userId },
    select: minionSelect,
  });
  return minion;
}

export async function loadRepresentativeCombat(db: PartyCombatDb, userId: string) {
  const minion = await loadRepresentativeMinionRow(db, userId);
  if (!minion) return null;

  const { memberInputs } = await loadPartyCombatRows(db, userId, [
    { minionId: minion.id, minion },
  ]);
  const member = memberInputs[0];
  if (!member) return null;

  const [combatant] = buildPartyCombatants([
    {
      minionId: member.minionId,
      combatClassLabel: member.combatClassLabel,
      power: member.power,
      bonusHp: member.bonusHp,
      bonusDef: member.bonusDef,
      skillDamageMult: member.skillDamageMult,
      activeSkillName: member.activeSkillName,
      activeSkillId: member.activeSkillId,
      activeSkillLevel: member.activeSkillLevel,
      combatMods: member.combatMods,
    },
  ]);

  return { minion, member, combatant };
}

export async function countPvpAttacksToday(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.pvpMatch.count({
    where: { attackerId: userId, createdAt: { gte: start } },
  });
}

export type PvpOpponentView = {
  userId: string;
  username: string;
  honorTitle: string | null;
  minionId: string;
  combatClassLabel: string;
  level: number;
  combatPower: number;
};

export async function listPvpOpponents(userId: string, limit = 16): Promise<PvpOpponentView[]> {
  const myCombat = await loadRepresentativeCombat(prisma, userId);
  if (!myCombat) return [];

  const candidates = await prisma.user.findMany({
    where: {
      id: { not: userId },
      representativeMinionId: { not: null },
    },
    select: {
      id: true,
      username: true,
      honorTitle: true,
      representativeMinionId: true,
    },
    take: 80,
    orderBy: { createdAt: "desc" },
  });

  const rows: PvpOpponentView[] = [];
  for (const u of candidates) {
    if (!u.representativeMinionId) continue;
    const minion = await prisma.minion.findFirst({
      where: { id: u.representativeMinionId, userId: u.id },
      select: minionSelect,
    });
    if (!minion) continue;

    const { memberInputs } = await loadPartyCombatRows(prisma, u.id, [
      { minionId: minion.id, minion },
    ]);
    const member = memberInputs[0];
    if (!member) continue;

    rows.push({
      userId: u.id,
      username: u.username,
      honorTitle: u.honorTitle,
      minionId: minion.id,
      combatClassLabel: member.combatClassLabel,
      level: minion.level,
      combatPower: member.power,
    });
  }

  const myPower = myCombat.member.power;
  rows.sort((a, b) => Math.abs(a.combatPower - myPower) - Math.abs(b.combatPower - myPower));

  return rows.slice(0, Math.min(30, Math.max(1, limit)));
}

export type PvpAttackResult = {
  matchId: string;
  outcome: "ATTACKER_WIN" | "DEFENDER_WIN";
  won: boolean;
  combatLog: CombatLogLine[];
  combatReplay: DungeonCombatReplay;
  attackerLabel: string;
  defenderLabel: string;
  remainingAttacksToday: number;
};

export async function runPvpAttack(attackerId: string, defenderUserId: string): Promise<PvpAttackResult> {
  if (attackerId === defenderUserId) {
    throw new Error("CANNOT_ATTACK_SELF");
  }

  const attacksToday = await countPvpAttacksToday(attackerId);
  if (attacksToday >= PVP_DAILY_ATTACK_LIMIT) {
    throw new Error("PVP_DAILY_LIMIT");
  }

  const attacker = await loadRepresentativeCombat(prisma, attackerId);
  if (!attacker) throw new Error("REPRESENTATIVE_REQUIRED");

  const defender = await loadRepresentativeCombat(prisma, defenderUserId);
  if (!defender) throw new Error("DEFENDER_NOT_READY");

  const battle = simulatePvpDuel({
    attacker: attacker.combatant,
    defender: defender.combatant,
  });

  const combatReplay = buildPvpCombatReplay({
    attacker: attacker.combatant,
    defender: defender.combatant,
    attackerMeta: {
      combatClass: attacker.member.combatClass,
      weaponBaseItemId: attacker.member.weaponBaseItemId,
    },
    defenderMeta: {
      combatClass: defender.member.combatClass,
      weaponBaseItemId: defender.member.weaponBaseItemId,
    },
  });

  const match = await prisma.pvpMatch.create({
    data: {
      attackerId,
      defenderId: defenderUserId,
      attackerMinionId: attacker.minion.id,
      defenderMinionId: defender.minion.id,
      outcome: battle.outcome,
      combatLogJson: JSON.stringify(battle.log),
    },
  });

  if (battle.outcome === "ATTACKER_WIN") {
    await incrementLeaderboardScore({
      userId: attackerId,
      boardKey: PVP_BOARD_KEY,
      seasonKey: PVP_SEASON_KEY,
    });
  }

  return {
    matchId: match.id,
    outcome: battle.outcome,
    won: battle.outcome === "ATTACKER_WIN",
    combatLog: battle.log,
    combatReplay,
    attackerLabel: attacker.combatant.label,
    defenderLabel: defender.combatant.label,
    remainingAttacksToday: Math.max(0, PVP_DAILY_ATTACK_LIMIT - attacksToday - 1),
  };
}

export type PvpHistoryRow = {
  id: string;
  role: "attack" | "defense";
  opponentUsername: string;
  opponentHonorTitle: string | null;
  outcome: "ATTACKER_WIN" | "DEFENDER_WIN";
  won: boolean;
  createdAt: string;
};

export async function listPvpHistory(userId: string, limit = 12): Promise<PvpHistoryRow[]> {
  const take = Math.min(30, Math.max(1, limit));
  const matches = await prisma.pvpMatch.findMany({
    where: { OR: [{ attackerId: userId }, { defenderId: userId }] },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      attacker: { select: { id: true, username: true, honorTitle: true } },
      defender: { select: { id: true, username: true, honorTitle: true } },
    },
  });

  return matches.map((m) => {
    const asAttacker = m.attackerId === userId;
    const opponent = asAttacker ? m.defender : m.attacker;
    const won = asAttacker
      ? m.outcome === "ATTACKER_WIN"
      : m.outcome === "DEFENDER_WIN";
    return {
      id: m.id,
      role: asAttacker ? "attack" : "defense",
      opponentUsername: opponent.username,
      opponentHonorTitle: opponent.honorTitle,
      outcome: m.outcome as "ATTACKER_WIN" | "DEFENDER_WIN",
      won,
      createdAt: m.createdAt.toISOString(),
    };
  });
}
