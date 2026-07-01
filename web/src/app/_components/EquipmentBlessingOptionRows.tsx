"use client";

import type { OptionRealm } from "@/shared/equipmentBlessings";
import { formatOptionValueText } from "@/shared/equipmentItemBaseStats";

export type BlessingOptionRow = {
  kind: string;
  label: string;
  tierLabel: string;
  displayValue: number;
  isPercent?: boolean;
  flatBonus?: number;
  hidden?: boolean;
  locked?: boolean;
  realm?: OptionRealm;
  affix?: string | null;
  realmLabel?: string;
};

export function EquipmentBlessingOptionRows(props: {
  options: BlessingOptionRow[];
  identified: boolean;
}) {
  const { options, identified } = props;
  if (!options.length) return null;

  const hasBlessing = options.some((o) => o.realm === "celestial" || o.realm === "abyss" || o.realm === "void");

  return (
    <>
      <div className="item-tooltip__divider" />
      <div className="item-tooltip__section-label">
        {hasBlessing ? "특수 옵션" : "추가 옵션"}
      </div>
      {options.map((op, i) => {
        const rowClass = [
          "item-tooltip__option-row",
          op.realm === "celestial" ? "item-tooltip__option-row--celestial" : "",
          op.realm === "abyss" ? "item-tooltip__option-row--abyss" : "",
          op.realm === "void" ? "item-tooltip__option-row--void" : "",
        ]
          .filter(Boolean)
          .join(" ");

        if (!identified) {
          const affix =
            op.affix ??
            (op.realm === "celestial" ? "천계의" : op.realm === "abyss" ? "마계의" : op.realm === "void" ? "공허의" : "");
          return (
            <div key={`${op.kind}-${i}`} className={rowClass}>
              {op.realmLabel ? (
                <span className="item-tooltip__option-realm">{op.realmLabel}</span>
              ) : (
                <span className="item-tooltip__option-tier">?</span>
              )}
              <span className="item-tooltip__option-label">
                {affix ? `${affix} ???` : "???"}
              </span>
            </div>
          );
        }

        return (
          <div key={`${op.kind}-${i}`} className={rowClass}>
            <span className="item-tooltip__option-tier">{op.tierLabel}</span>
            <span className="item-tooltip__option-label">
              {op.realmLabel ? (
                <span className="item-tooltip__option-realm-inline">{op.realmLabel}</span>
              ) : null}
              {op.affix ? <span className="item-tooltip__option-affix">{op.affix} </span> : null}
              {op.locked ? "🔒 " : ""}
              {op.label}
            </span>
            <span className="item-tooltip__option-val">
              {formatOptionValueText({
                displayValue: op.displayValue,
                isPercent: op.isPercent,
                flatBonus: op.flatBonus,
              })}
            </span>
          </div>
        );
      })}
    </>
  );
}
