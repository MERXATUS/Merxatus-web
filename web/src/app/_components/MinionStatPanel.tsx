"use client";

import type { MinionCombatBreakdown } from "@/shared/minionCombatStats";

function fmt(n: number) {
  return n.toLocaleString();
}

function StatRow(props: { line: MinionCombatBreakdown["hp"]; showRange?: false }) {
  return (
    <tr className="minion-stat-panel__row">
      <th className="minion-stat-panel__label">{props.line.label}</th>
      <td className="minion-stat-panel__num">{fmt(props.line.base)}</td>
      <td className="minion-stat-panel__num minion-stat-panel__num--equip">
        {props.line.equip > 0 ? `+${fmt(props.line.equip)}` : "—"}
      </td>
      <td className="minion-stat-panel__num minion-stat-panel__num--total">{fmt(props.line.total)}</td>
    </tr>
  );
}

export function MinionStatPanel(props: { stats: MinionCombatBreakdown; compact?: boolean }) {
  const { stats, compact } = props;

  return (
    <div className={`minion-stat-panel ${compact ? "minion-stat-panel--compact" : ""}`}>
      <div className="minion-stat-panel__hero">
        <span className="minion-stat-panel__hero-label">총 전투력</span>
        <span className="minion-stat-panel__hero-value">{fmt(stats.combatPower)}</span>
      </div>

      <table className="minion-stat-panel__table">
        <thead>
          <tr>
            <th>스탯</th>
            <th>기본</th>
            <th>장비</th>
            <th>합계</th>
          </tr>
        </thead>
        <tbody>
          <StatRow line={stats.hp} />
          <StatRow line={stats.def} />
          <tr className="minion-stat-panel__row">
            <th className="minion-stat-panel__label">{stats.atk.label}</th>
            <td className="minion-stat-panel__num">{fmt(stats.atk.base)}</td>
            <td className="minion-stat-panel__num minion-stat-panel__num--equip">
              {stats.atk.equip > 0 ? `+${fmt(stats.atk.equip)}` : "—"}
            </td>
            <td className="minion-stat-panel__num minion-stat-panel__num--total">
              {fmt(stats.atk.min)}
              {stats.atk.max > stats.atk.min ? ` ~ ${fmt(stats.atk.max)}` : ""}
            </td>
          </tr>
        </tbody>
      </table>

      {stats.armorPieces.length > 0 ? (
        <div className="minion-stat-panel__armor">
          <div className="minion-stat-panel__armor-title">방어구 기여</div>
          <ul className="minion-stat-panel__armor-list">
            {stats.armorPieces.map((p) => (
              <li key={p.slot} className="minion-stat-panel__armor-item">
                <span className="minion-stat-panel__armor-slot">{p.slotLabel}</span>
                <span className="minion-stat-panel__armor-name">{p.name}</span>
                <span className="minion-stat-panel__armor-stats">
                  HP +{p.hp}
                  {p.def > 0 ? ` · DEF +${p.def}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
