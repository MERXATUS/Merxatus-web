"use client";

import { useCallback, useEffect, useState } from "react";
import { GameBtn } from "@/app/_components/gameUi";
import type { GameTabKey } from "@/shared/gameNav";
import type { ShopSubTab } from "@/shared/shopSubTab";
import { TUTORIAL_STEPS, type TutorialStepDef } from "@/shared/tutorial";

type TutorialMinionGrant = {
  granted: boolean;
  message: string;
};

type TutorialStateResp = {
  ok: true;
  step: number;
  done: boolean;
  current: TutorialStepDef | null;
  steps: Array<{ id: string; title: string }>;
  progressPercent: number;
  minionGrants?: TutorialMinionGrant[];
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

function actionButtonLabel(current: TutorialStepDef): string {
  if (!current.action) return "진행";
  if (current.action.kind === "tab") {
    if (current.action.tab === "shop") {
      if (current.action.shopSub === "equipment") return "장비 매입";
      if (current.action.shopSub === "materials") return "재료";
      return "장비";
    }
    if (current.action.tab === "enhance") return "대장간";
  }
  return "이동";
}

type TutorialPanelProps = {
  loggedIn: boolean;
  compact?: boolean;
  onNavigateTab?: (tab: GameTabKey, opts?: { shopSub?: ShopSubTab }) => void;
};

export function TutorialPanel(props: TutorialPanelProps) {
  const [state, setState] = useState<TutorialStateResp | null>(null);
  const [grantBanner, setGrantBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!props.loggedIn) {
      setState(null);
      setGrantBanner(null);
      return;
    }
    try {
      const r = await getJson<TutorialStateResp>("/api/tutorial/state");
      setState(r);
      const grants = r.minionGrants ?? [];
      const granted = grants.filter((g) => g.granted);
      if (granted.length > 0) {
        setGrantBanner(granted.map((g) => g.message).filter(Boolean).join(" "));
      }
    } catch {
      setState(null);
    }
  }, [props.loggedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener("tutorial_refresh", onRefresh);
    return () => window.removeEventListener("tutorial_refresh", onRefresh);
  }, [load]);

  if (!props.loggedIn || !state || state.done) return null;

  const current = state.current;
  const stepIndex = state.step;

  function goCurrent() {
    if (!current?.action || current.action.kind !== "tab") return;
    props.onNavigateTab?.(current.action.tab, { shopSub: current.action.shopSub });
  }

  return (
    <div className="tutorial-strip">
      <span className="tutorial-strip__pct">
        {stepIndex + 1}/{TUTORIAL_STEPS.length}
        {!props.compact ? ` · ${state.progressPercent}%` : ""}
      </span>
      <div className="tutorial-strip__body min-w-0">
        <span className="tutorial-strip__title">{current?.title ?? "튜토리얼"}</span>
        {current?.hint ? <span className="tutorial-strip__hint">{current.hint}</span> : null}
        {grantBanner ? <span className="tutorial-strip__grant">{grantBanner}</span> : null}
      </div>
      {current?.action ? (
        <GameBtn className="tutorial-strip__btn h-7 px-2.5 text-[11px]" onClick={() => goCurrent()}>
          {actionButtonLabel(current)}
        </GameBtn>
      ) : null}
    </div>
  );
}

export function notifyTutorialRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("tutorial_refresh"));
  }
}
