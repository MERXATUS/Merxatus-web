import type { CombatantInput } from "@/server/dungeonBattler";
import { statsFromPower } from "@/server/dungeonBattler";
import type { MinionCombatClass } from "@/shared/minionDerivedClass";
import { minionPortraitView } from "@/shared/combatPortrait";
import type { DungeonCombatReplay } from "@/shared/dungeonCombatLog";

export function buildPvpCombatReplay(input: {
  attacker: CombatantInput;
  defender: CombatantInput;
  attackerMeta: { combatClass: MinionCombatClass; weaponBaseItemId: string | null };
  defenderMeta: { combatClass: MinionCombatClass; weaponBaseItemId: string | null };
}): DungeonCombatReplay {
  const atkSt = statsFromPower(input.attacker.power);
  const defSt = statsFromPower(input.defender.power);
  const atkMaxHp = atkSt.maxHp + Math.max(0, Math.floor(input.attacker.bonusHp ?? 0));
  const defMaxHp = defSt.maxHp + Math.max(0, Math.floor(input.defender.bonusHp ?? 0));

  return {
    floor: 1,
    enemy: {
      name: input.defender.label,
      maxHp: defMaxHp,
      portrait: minionPortraitView({
        combatClass: input.defenderMeta.combatClass,
        weaponBaseItemId: input.defenderMeta.weaponBaseItemId,
      }),
    },
    partyBefore: [
      {
        minionId: input.attacker.id,
        label: input.attacker.label,
        hp: atkMaxHp,
        maxHp: atkMaxHp,
        portrait: minionPortraitView({
          combatClass: input.attackerMeta.combatClass,
          weaponBaseItemId: input.attackerMeta.weaponBaseItemId,
        }),
      },
    ],
  };
}
