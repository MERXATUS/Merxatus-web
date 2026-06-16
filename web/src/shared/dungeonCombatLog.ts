import { COMBAT_STATUS_LABEL, type CombatStatusId } from "@/shared/combatStatusLabels";

export type CombatHitKind = "normal" | "crit" | "extra";



export type CombatLogLine =

  | { t: "floor_start"; floor: number; enemyName: string; enemyMaxHp?: number }

  | { t: "skill"; side: "party" | "enemy"; actor: string; skillName: string }

  | {

      t: "hit";

      side: "party" | "enemy";

      actor: string;

      target: string;

      damage: number;

      kind?: CombatHitKind;

      actorId?: string;

      targetId?: string;

    }

  | { t: "block"; side: "party" | "enemy"; actor: string; attacker: string; skillName?: string }
  | { t: "evade"; side: "party" | "enemy"; actor: string; attacker: string; skillName?: string }

  | {
      t: "heal";
      side: "party" | "enemy";
      actor: string;
      amount: number;
      source?: "lifesteal" | "regen" | "skill";
      skillName?: string;
    }

  | { t: "buff"; side: "party" | "enemy"; actor: string; text: string; skillName?: string }

  | {
      t: "status";
      action: "apply" | "tick" | "expire" | "skip";
      side: "party" | "enemy";
      actor: string;
      status: CombatStatusId;
      stacks?: number;
      amount?: number;
    }

  | { t: "counter"; side: "party" | "enemy"; actor: string; target: string; damage: number }

  | { t: "ko"; side: "party" | "enemy"; name: string }

  | { t: "result"; outcome: "WIN" | "LOSS" };



import type { CombatPortraitView } from "@/shared/combatPortrait";



export type DungeonCombatReplay = {

  floor: number;

  enemy: { name: string; maxHp: number; monsterId?: string; portrait?: CombatPortraitView };

  partyBefore: Array<{

    minionId: string;

    label: string;

    hp: number;

    maxHp: number;

    portrait?: CombatPortraitView;

  }>;

};



function hitKindLabel(kind: CombatHitKind | undefined): string {

  if (kind === "crit") return " 치명!";

  if (kind === "extra") return " 추가타!";

  return "";

}



/** 관전 로그 한 줄 텍스트 */

export function formatCombatLogLine(line: CombatLogLine): string {

  switch (line.t) {

    case "floor_start":

      return `— ${line.floor}층 · ${line.enemyName} —`;

    case "skill":

      return `⚔ ${line.actor} · ${line.skillName}!`;

    case "hit":

      return `${line.actor} → ${line.target}  ${line.damage}${hitKindLabel(line.kind)}`;

    case "block":

      return line.skillName
        ? `🛡 ${line.actor} · ${line.skillName}! (${line.attacker})`
        : `${line.actor} 막기! (${line.attacker})`;

    case "evade":

      return line.skillName
        ? `💨 ${line.actor} · ${line.skillName}! (${line.attacker})`
        : `${line.actor} 회피! (${line.attacker})`;

    case "heal":
      if (line.source === "lifesteal") return `${line.actor} 흡혈 +${line.amount} HP`;
      if (line.source === "skill" && line.skillName) {
        return `✨ ${line.actor} · ${line.skillName} +${line.amount} HP`;
      }
      return `${line.actor} +${line.amount} HP 회복`;

    case "buff":
      return line.skillName ? `◆ ${line.actor} · ${line.skillName} — ${line.text}` : `◆ ${line.actor} · ${line.text}`;

    case "status": {
      const label = COMBAT_STATUS_LABEL[line.status] ?? line.status;
      if (line.action === "apply") return `${line.actor} · ${label}${line.stacks && line.stacks > 1 ? ` ×${line.stacks}` : ""}`;
      if (line.action === "tick") return `${line.actor} · ${label} ${line.amount ?? 0}`;
      if (line.action === "skip") return `${line.actor} · ${label} (행동 불가)`;
      return `${line.actor} · ${label} 해제`;
    }

    case "counter":
      return `${line.actor} 반격 → ${line.target}  ${line.damage}`;

    case "ko":

      return `${line.name} 처치!`;

    case "result":

      return line.outcome === "WIN" ? "✦ 층 클리어!" : "✦ 전멸… 누적 보상 소멸";

    default:

      return "";

  }

}


