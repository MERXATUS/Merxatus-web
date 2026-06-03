/** 로컬에 저장한 던전·레이드·무탑 파티 미니언 id */

export function readSavedPartyIds(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export function writeSavedPartyIds(storageKey: string, ids: Iterable<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/** 저장 id 중 현재 로스터·상한에 맞는 것만 유지 */
export function resolveSavedPartyIds(
  savedIds: string[],
  minions: Array<{ id: string }>,
  maxParty: number,
): Set<string> {
  const cap = Math.max(1, Math.floor(maxParty));
  const valid = new Set(minions.map((m) => m.id));
  const out: string[] = [];
  for (const id of savedIds) {
    if (!valid.has(id)) continue;
    out.push(id);
    if (out.length >= cap) break;
  }
  return new Set(out);
}

/** 진행 중인 런 파티가 있으면 우선, 없으면 localStorage */
export function partyIdsForPanel(input: {
  storageKey: string;
  minions: Array<{ id: string }>;
  maxParty: number;
  activeRunMinionIds?: string[] | null;
  current?: Set<string>;
}): Set<string> {
  if (input.activeRunMinionIds?.length) {
    return resolveSavedPartyIds(input.activeRunMinionIds, input.minions, input.maxParty);
  }
  if (input.current && input.current.size > 0) {
    return resolveSavedPartyIds([...input.current], input.minions, input.maxParty);
  }
  return resolveSavedPartyIds(readSavedPartyIds(input.storageKey), input.minions, input.maxParty);
}
