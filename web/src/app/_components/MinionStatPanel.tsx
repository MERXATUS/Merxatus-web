"use client";

import type { MinionCombatBreakdown } from "@/shared/minionCombatStats";
import { MINION_STAT_KEYS, MINION_STAT_LABELS } from "@/shared/minionBaseStats";

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

function SkillContributionBlock(props: { stats: MinionCombatBreakdown }) {
  const skill = props.stats.skillBreakdown;
  if (!skill) return null;

  return (
    <div className="minion-stat-panel__skills">
      <div className="minion-stat-panel__skills-title">스킬 기여</div>
      <ul className="minion-stat-panel__skills-list">
        {skill.entries.map((entry) => (
          <li key={entry.id} className="minion-stat-panel__skills-item">
            <span className="minion-stat-panel__skills-name">
              {entry.name} Lv{entry.level}
            </span>
            <span className="minion-stat-panel__skills-effect">{entry.effectSummary}</span>
          </li>
        ))}
      </ul>
      <div className="minion-stat-panel__skills-total">
        {skill.power > 0 ? `전투력 +${fmt(skill.power)}` : null}
        {skill.hp > 0 ? `${skill.power > 0 ? " · " : ""}HP +${fmt(skill.hp)}` : null}
        {skill.def > 0 ? ` · DEF +${fmt(skill.def)}` : null}
        {skill.damagePct > 0 ? ` · 피해 +${skill.damagePct}%` : null}
      </div>
    </div>
  );
}

export function MinionStatPanel(props: { stats: MinionCombatBreakdown; compact?: boolean; minimal?: boolean }) {
  const { stats, compact, minimal } = props;

  if (minimal) {
    return (
      <div className="minion-stat-panel minion-stat-panel--minimal">
        <span className="minion-stat-panel__minimal-power">
          전투력 <strong>{fmt(stats.combatPower)}</strong>
        </span>
        <span className="minion-stat-panel__minimal-divider" aria-hidden>
          ·
        </span>
        <span className="minion-stat-panel__minimal-stats">
          HP {fmt(stats.hp.total)} · DEF {fmt(stats.def.total)} · ATK {fmt(stats.atk.min)}
          {stats.atk.max > stats.atk.min ? `~${fmt(stats.atk.max)}` : ""}
        </span>
        {stats.skillBreakdown ? (
          <span className="minion-stat-panel__minimal-skill" title="스킬 피해 보너스">
            스킬 피해 +{stats.skillBreakdown.damagePct}%
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`minion-stat-panel ${compact ? "minion-stat-panel--compact" : ""}`}>
      <div className="minion-stat-panel__hero">
        <span className="minion-stat-panel__hero-label">총 전투력</span>
        <span className="minion-stat-panel__hero-value">{fmt(stats.combatPower)}</span>
        {stats.skillBreakdown && stats.skillBreakdown.power > 0 ? (
          <span className="minion-stat-panel__hero-skill">스킬 +{fmt(stats.skillBreakdown.power)}</span>
        ) : null}
      </div>

      <div className="minion-stat-panel__attrs" aria-label="기본 스탯">
        {MINION_STAT_KEYS.map((key) => (
          <div key={key} className="minion-stat-panel__attr">
            <span className="minion-stat-panel__attr-label">{MINION_STAT_LABELS[key]}</span>
            <span className="minion-stat-panel__attr-val">{stats.attributes[key]}</span>
          </div>
        ))}
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

      <SkillContributionBlock stats={stats} />

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
