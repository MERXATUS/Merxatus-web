"use client";

import type { ReactNode } from "react";
import { GameBtn } from "@/app/_components/gameUi";

type Props = {
  onBack: () => void;
  extra?: ReactNode;
};

export function ForgeBenchTopbar(props: Props) {
  return (
    <header className="forge-bench__topbar forge-bench__topbar--minimal">
      <GameBtn variant="ghost" className="forge-bench__back" onClick={props.onBack} aria-label="장비 선택">
        ← <span className="forge-bench__back-label">장비 선택</span>
      </GameBtn>

      {props.extra ? <div className="forge-bench__topbar-end">{props.extra}</div> : null}
    </header>
  );
}
