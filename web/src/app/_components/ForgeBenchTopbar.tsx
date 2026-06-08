"use client";

import type { ReactNode } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn } from "@/app/_components/gameUi";
import { itemGradeNameClassName } from "@/server/itemGrade";

type Props = {
  onBack: () => void;
  extra?: ReactNode;
} & (
  | {
      variant?: "equip";
      modeLabel: string;
      equipKind: "weapon" | "armor";
      baseItemId: string;
      name: string;
      grade?: number;
      enhanceLevel?: number;
    }
  | {
      variant: "minimal";
      title: string;
    }
);

export function ForgeBenchTopbar(props: Props) {
  const minimal = props.variant === "minimal";

  return (
    <header className={`forge-bench__topbar ${minimal ? "forge-bench__topbar--minimal" : ""}`.trim()}>
      <GameBtn variant="ghost" className="forge-bench__back" onClick={props.onBack} aria-label="장비 선택">
        ← <span className="forge-bench__back-label">장비 선택</span>
      </GameBtn>

      {minimal ? (
        <p className="forge-bench__title">{props.title}</p>
      ) : (
        <div className="forge-bench__target">
          <ItemIcon itemId={props.baseItemId} size={36} className="item-icon forge-bench__target-icon" />
          <div className="forge-bench__target-text">
            <p className="forge-bench__target-label">
              {props.modeLabel} · {props.equipKind === "weapon" ? "무기" : "방어구"}
            </p>
            <p className={`forge-bench__target-name ${itemGradeNameClassName(props.grade ?? 1)}`}>
              {props.name}
              {(props.enhanceLevel ?? 0) > 0 ? ` +${props.enhanceLevel}` : ""}
            </p>
          </div>
        </div>
      )}

      {props.extra ? <div className="forge-bench__topbar-end">{props.extra}</div> : null}
    </header>
  );
}
