"use client";

export type PartyRosterRow = {
  id: string;
  label: string;
  hp: number;
  maxHp: number;
  pct: number;
  dead: boolean;
};

type Props = {
  roster: PartyRosterRow[];
  compact?: boolean;
};

export function DungeonPartyHpList(props: Props) {
  const { roster, compact } = props;

  return (
    <ul className={`dungeon-party-hp-list ${compact ? "mt-1.5" : "mt-2"}`.trim()}>
      {roster.map((m) => (
        <li key={m.id} className={`dungeon-party-hp-row${m.dead ? " dungeon-party-hp-row--dead" : ""}`.trim()}>
          <div className="dungeon-party-hp-head">
            <span className={`truncate font-semibold ${compact ? "text-[10px]" : "text-xs"}`}>{m.label}</span>
            <span
              className={`shrink-0 tabular-nums text-[var(--game-muted)] ${compact ? "text-[10px]" : "text-[11px]"}`}
            >
              {m.dead ? "전투불가" : `${m.hp}/${m.maxHp}`}
            </span>
          </div>
          <div className="dungeon-party-hp-actions">
            <div className="dungeon-hp-track flex-1" aria-hidden={m.dead}>
              <div
                className={`dungeon-hp-fill${m.pct <= 30 ? " dungeon-hp-fill--low" : ""}`.trim()}
                style={{ width: `${m.pct}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
