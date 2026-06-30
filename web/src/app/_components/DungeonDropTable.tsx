"use client";

import { useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { formatDropChancePct, formatDropQty } from "@/shared/dungeonDropTable";
import type {
  DungeonDropTableEntryView,
  DungeonDropTablePayloadView,
} from "@/shared/dungeonDropTableView";

const CATEGORY_LABEL: Record<DungeonDropTableEntryView["category"], string> = {
  equipment: "장비",
  consumable: "소모",
  material: "재료",
  other: "기타",
};

export function DungeonDropTable(props: {
  table: DungeonDropTablePayloadView | null | undefined;
  compact?: boolean;
  hint?: string;
  hideFloorLabels?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | DungeonDropTableEntryView["category"]>("all");
  const data = props.table;

  useEffect(() => {
    setOpen(false);
    setFilter("all");
  }, [data?.dungeonId]);

  const totalKinds = useMemo(() => {
    if (!data?.sections.length) return 0;
    return data.sections.reduce((sum, section) => sum + section.rows.length, 0);
  }, [data]);

  const sections = useMemo(() => {
    if (!data?.sections.length) return [];
    return data.sections
      .map((section) => ({
        ...section,
        rows:
          filter === "all" ? section.rows : section.rows.filter((r) => r.category === filter),
      }))
      .filter((s) => s.rows.length > 0);
  }, [data, filter]);

  if (!data) return null;
  if (!data.sections.length) {
    return <p className="dungeon-drop-table__empty">드랍 정보가 없습니다.</p>;
  }

  const hint = props.hint ?? "층 클리어 시 1회 추첨 · 확률은 해당 구간 풀 기준";

  return (
    <div
      className={`dungeon-drop-table ${props.compact ? "dungeon-drop-table--compact" : ""}${open ? " dungeon-drop-table--open" : ""}`.trim()}
      aria-label={props.ariaLabel ?? "드랍표"}
    >
      <button
        type="button"
        className="dungeon-drop-table__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="dungeon-drop-table__title">드랍표</span>
        <span className="dungeon-drop-table__toggle-meta">
          <span className="dungeon-drop-table__hint">
            {open ? hint : `${totalKinds}종 · 클릭하여 보기`}
          </span>
          <span className="dungeon-drop-table__chevron" aria-hidden>
            {open ? "▲" : "▼"}
          </span>
        </span>
      </button>

      {open ? (
        <>
          {data.gearPlanNotes ? (
            <p className="dungeon-drop-table__plan-notes">{data.gearPlanNotes}</p>
          ) : null}

          <div className="dungeon-drop-table__filters" role="tablist" aria-label="드랍 종류 필터">
            {(["all", "equipment", "consumable", "material"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={`dungeon-drop-table__filter ${filter === key ? "dungeon-drop-table__filter--active" : ""}`}
                onClick={() => setFilter(key)}
              >
                {key === "all" ? "전체" : CATEGORY_LABEL[key]}
              </button>
            ))}
          </div>

          <div className="dungeon-drop-table__sections">
            {sections.map((section) => (
              <section key={section.id} className="dungeon-drop-table__section">
                <header className="dungeon-drop-table__section-head">
                  <h4
                    className={`dungeon-drop-table__section-title ${section.kind === "boss" ? "dungeon-drop-table__section-title--boss" : ""}`}
                  >
                    {props.hideFloorLabels
                      ? section.kind === "boss"
                        ? "보스 드랍"
                        : "드랍"
                      : section.label}
                  </h4>
                  <span className="dungeon-drop-table__section-count">{section.rows.length}종</span>
                </header>
                <div className="dungeon-drop-table__grid" role="table">
                  <div className="dungeon-drop-table__row dungeon-drop-table__row--head" role="row">
                    <span role="columnheader">아이템</span>
                    <span role="columnheader">확률</span>
                    <span role="columnheader">수량</span>
                  </div>
                  {section.rows.map((row) => (
                    <div key={`${section.id}-${row.itemId}-${row.floorLabel}`} className="dungeon-drop-table__row" role="row">
                      <div className="dungeon-drop-table__item" role="cell">
                        <ItemIcon
                          itemId={row.itemId}
                          icon={row.icon}
                          iconSrc={row.iconSrc}
                          size={props.compact ? 28 : 32}
                          className="item-icon shrink-0"
                        />
                        <div className="dungeon-drop-table__item-text">
                          <span className={`dungeon-drop-table__item-name ${itemGradeNameClassName(row.grade)}`}>
                            {row.name}
                          </span>
                          <span className="dungeon-drop-table__item-meta">
                            {row.gradeLabel}
                            {!props.hideFloorLabels && row.category === "equipment" ? ` · ${row.floorLabel}` : ""}
                          </span>
                        </div>
                      </div>
                      <span className="dungeon-drop-table__chance" role="cell">
                        {formatDropChancePct(row.chancePct)}
                      </span>
                      <span className="dungeon-drop-table__qty" role="cell">
                        {formatDropQty(row.minQty, row.maxQty)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
