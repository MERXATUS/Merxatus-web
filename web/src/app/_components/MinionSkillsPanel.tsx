"use client";

import type { MinionSkillView } from "@/shared/minionSkills";

export function MinionSkillsPanel(props: { skills: MinionSkillView[]; compact?: boolean }) {
  const { skills, compact } = props;
  if (skills.length === 0) return null;

  if (compact) {
    return (
      <div className="minion-skills minion-skills--compact">
        <span className="minion-skills__title">스킬</span>
        <ul className="minion-skills__chips">
          {skills.map((skill) => (
            <li key={skill.id} className="minion-skills__chip">
              {skill.name} Lv{skill.level}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="minion-skills">
      <div className="minion-skills__head">
        <div className="minion-skills__title">스킬</div>
        <span className="minion-skills__hint">확장 예정</span>
      </div>
      <ul className="minion-skills__list">
        {skills.map((skill) => (
          <li key={skill.id} className="minion-skills__item">
            <div className="minion-skills__item-head">
              <span className="minion-skills__name">{skill.name}</span>
              <span className="minion-skills__level">Lv {skill.level}</span>
            </div>
            <p className="minion-skills__desc">{skill.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
