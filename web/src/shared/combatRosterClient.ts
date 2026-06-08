import { apiGetJson } from "@/shared/sessionClient";

export type CombatRosterMinion = {
  id: string;
  level: number;
  pool?: string;
  combatClassLabel: string;
  combatStats?: { combatPower: number };
  combatPower?: number;
  equippedWeapon?: {
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    grade: number;
  } | null;
};

type CacheEntry = {
  userId: string;
  minions: CombatRosterMinion[];
  fetchedAt: number;
};

const ROSTER_TTL_MS = 45_000;
let cache: CacheEntry | null = null;
let inflight: Promise<CombatRosterMinion[]> | null = null;

export function invalidateCombatRosterCache() {
  cache = null;
  inflight = null;
}

export async function fetchCombatRoster(userId: string, opts?: { force?: boolean }): Promise<CombatRosterMinion[]> {
  const now = Date.now();
  if (!opts?.force && cache && cache.userId === userId && now - cache.fetchedAt < ROSTER_TTL_MS) {
    return cache.minions;
  }
  if (!opts?.force && inflight) return inflight;

  inflight = apiGetJson<{ ok: boolean; minions: CombatRosterMinion[] }>("/api/minions/list?scope=partyPick")
    .then((r) => {
      const minions = r.ok ? (r.minions ?? []) : [];
      cache = { userId, minions, fetchedAt: Date.now() };
      return minions;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** 네비 hover 등 — 로그인 후 백그라운드 워밍 */
export function prefetchCombatRoster(userId: string | null | undefined) {
  if (!userId) return;
  void fetchCombatRoster(userId).catch(() => {});
}
