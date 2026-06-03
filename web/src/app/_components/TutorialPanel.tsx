"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GameBtn } from "@/app/_components/gameUi";
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
  if (current.action.kind === "route") {
    return current.id === "list_on_market" ? "판매 탭" : "거래소";
  }
  return "던전";
}

type TutorialPanelProps = {
  loggedIn: boolean;
  compact?: boolean;
  onOpenDungeon?: () => void;
};

export function TutorialPanel(props: TutorialPanelProps) {
  const router = useRouter();
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

  async function goCurrent() {
    if (!current?.action) return;
    if (current.action.kind === "panel") {
      props.onOpenDungeon?.();
    } else if (current.action.kind === "route") {
      router.push(current.action.path);
    }
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
        <GameBtn className="tutorial-strip__btn h-7 px-2.5 text-[11px]" onClick={() => void goCurrent()}>
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
