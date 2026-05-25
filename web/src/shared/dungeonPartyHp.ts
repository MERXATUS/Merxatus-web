export type PartyHpEntry = {
  minionId: string;
  hp: number;
  maxHp: number;
  label?: string;
};

export function parsePartyHpJson(json: unknown): PartyHpEntry[] {
  try {
    const raw = typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => ({
        minionId: typeof x?.minionId === "string" ? x.minionId : "",
        hp: Math.max(0, Math.floor(Number(x?.hp ?? 0))),
        maxHp: Math.max(1, Math.floor(Number(x?.maxHp ?? 1))),
        label: typeof x?.label === "string" ? x.label : undefined,
      }))
      .filter((x) => x.minionId.length > 0);
  } catch {
    return [];
  }
}

export function serializePartyHp(entries: PartyHpEntry[]): string {
  return JSON.stringify(
    entries.map((e) => ({
      minionId: e.minionId,
      hp: Math.max(0, Math.floor(e.hp)),
      maxHp: Math.max(1, Math.floor(e.maxHp)),
      ...(e.label ? { label: e.label } : {}),
    })),
  );
}

export function partyHpToMap(entries: PartyHpEntry[]): Record<string, { hp: number; maxHp: number }> {
  const out: Record<string, { hp: number; maxHp: number }> = {};
  for (const e of entries) {
    out[e.minionId] = { hp: e.hp, maxHp: e.maxHp };
  }
  return out;
}
