import { buildPartyCombatants } from "@/server/dungeonBattler";
import type { loadPartyCombatRows } from "@/server/minionCombatBuild";
import type { KnightOrderBonuses } from "@/shared/knightOrder";

const SNAPSHOT_VERSION = 1;

type MemberInputRow = Awaited<ReturnType<typeof loadPartyCombatRows>>["memberInputs"][number];
type StoredMemberInput = Omit<MemberInputRow, "row">;

export type RunPartyBuildSnapshot = {
  partyPower: number;
  knightOrder: KnightOrderBonuses;
  memberInputs: StoredMemberInput[];
  combatants: ReturnType<typeof buildPartyCombatants>;
};

type SnapshotPayload = {
  v: typeof SNAPSHOT_VERSION;
  partyPower: number;
  knightOrder: KnightOrderBonuses;
  memberInputs: StoredMemberInput[];
};

export function serializeRunPartyBuild(input: {
  partyPower: number;
  knightOrder: KnightOrderBonuses;
  memberInputs?: MemberInputRow[] | StoredMemberInput[] | null;
}): string | null {
  const rows = input.memberInputs ?? [];
  if (rows.length === 0) return null;
  const payload: SnapshotPayload = {
    v: SNAPSHOT_VERSION,
    partyPower: input.partyPower,
    knightOrder: input.knightOrder,
    memberInputs: rows.map((entry) => {
      const { row: _row, ...rest } = entry as MemberInputRow;
      return rest;
    }),
  };
  return JSON.stringify(payload);
}

export function parseRunPartyBuild(json: string | null | undefined): RunPartyBuildSnapshot | null {
  if (!json?.trim()) return null;
  try {
    const raw = JSON.parse(json) as SnapshotPayload;
    if (raw?.v !== SNAPSHOT_VERSION) return null;
    if (!Array.isArray(raw.memberInputs) || raw.memberInputs.length === 0) return null;
    if (typeof raw.partyPower !== "number" || !raw.knightOrder) return null;
    const combatants = buildPartyCombatants(raw.memberInputs);
    if (!Array.isArray(combatants) || combatants.length === 0) return null;
    return {
      partyPower: raw.partyPower,
      knightOrder: raw.knightOrder,
      memberInputs: raw.memberInputs,
      combatants,
    };
  } catch {
    return null;
  }
}
