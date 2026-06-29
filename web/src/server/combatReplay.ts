import { fighterStatsFromMonster, scaleFighterStatsByChannel } from "@/server/monsterCombat";
import type { DungeonEnemyCombatMults } from "@/shared/dungeonDifficulty";
import type { FloorEnemy } from "@/server/dungeonBattler";
import type { MinionCombatClass } from "@/shared/minionDerivedClass";
import { minionPortraitView, monsterPortraitView } from "@/shared/combatPortrait";
import type { DungeonCombatReplay } from "@/shared/dungeonCombatLog";

export function buildCombatReplay(
  floor: number,
  enemy: FloorEnemy,
  monsterId: string,
  partyHpStart: Record<string, { hp: number; maxHp: number }>,
  combatants: Array<{ id: string; label: string }>,
  memberInputs: Array<{
    minionId: string;
    combatClass: MinionCombatClass;
    weaponBaseItemId: string | null;
  }>,
  enemyCombatMults: DungeonEnemyCombatMults | number = 1,
): DungeonCombatReplay {
  const baseEnemyStats = fighterStatsFromMonster(enemy.monster);
  const enemyStats =
    typeof enemyCombatMults === "number"
      ? enemyCombatMults > 1
        ? scaleFighterStatsByChannel(baseEnemyStats, {
            hp: enemyCombatMults,
            atk: enemyCombatMults,
            def: enemyCombatMults,
          })
        : baseEnemyStats
      : scaleFighterStatsByChannel(baseEnemyStats, enemyCombatMults);
  const memberById = new Map((memberInputs ?? []).map((m) => [m.minionId, m]));
  const party = combatants ?? [];
  return {
    floor,
    enemy: {
      name: `[${enemy.name}]`,
      maxHp: enemyStats.maxHp,
      monsterId,
      portrait: monsterPortraitView({ monsterId, icon: enemy.monster.icon }),
    },
    partyBefore: party.map((c) => {
      const saved = partyHpStart[c.id];
      const member = memberById.get(c.id);
      return {
        minionId: c.id,
        label: c.label,
        hp: saved?.hp ?? 0,
        maxHp: saved?.maxHp ?? 1,
        portrait: minionPortraitView({
          combatClass: member?.combatClass,
          weaponBaseItemId: member?.weaponBaseItemId,
        }),
      };
    }),
  };
}
