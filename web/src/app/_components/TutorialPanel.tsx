"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import {
  SPECIALIST_LABEL,
  type SpecialistProfessionSlug,
} from "@/shared/specialistProfession";
import { TUTORIAL_STEPS, type TutorialStepDef } from "@/shared/tutorial";

type TutorialMinionGrant = {
  granted: boolean;
  jobType: string;
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

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

type TutorialPanelProps = {
  loggedIn: boolean;
  onOpenGather: () => void;
  onSpecialistChosen?: () => void;
};

export function TutorialPanel(props: TutorialPanelProps) {
  const router = useRouter();
  const [state, setState] = useState<TutorialStateResp | null>(null);
  const [pickBusy, setPickBusy] = useState<string | null>(null);
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
      const fisherPending =
        (r.step ?? 0) >= 1 &&
        !grants.some((g) => g.jobType === "FISHER" && g.granted);
      if (granted.length > 0) {
        setGrantBanner(granted.map((g) => g.message).join(" "));
        window.dispatchEvent(new Event("auth_session_changed"));
      } else if (fisherPending && grants.some((g) => g.jobType === "FISHER" && g.message)) {
        setGrantBanner(grants.find((g) => g.jobType === "FISHER")?.message ?? "");
      } else {
        setGrantBanner(null);
      }
    } catch {
      setState(null);
      setGrantBanner(null);
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
      props.onOpenGather();
    } else if (current.action.kind === "route") {
      router.push(current.action.path);
    }
  }

  async function pickSpecialist(profession: SpecialistProfessionSlug) {
    setPickBusy(profession);
    try {
      const r = await postJson<{
        ok: boolean;
        workshopsInstalled?: string[];
        workshopsSkipped?: string[];
      }>("/api/user/specialist", { profession });
      let workshopMsg: string | null = null;
      if (r?.workshopsInstalled?.length) {
        workshopMsg = `${SPECIALIST_LABEL[profession]} 전문 작업장이 열렸어요: ${r.workshopsInstalled.join(", ")}`;
      } else if (r?.workshopsSkipped?.length) {
        workshopMsg =
          "전문 직업은 선택됐지만 일부 작업장 데이터가 아직 없어요. 관리자 시드 후 새로고침 해 주세요.";
      }
      props.onSpecialistChosen?.();
      await load();
      if (workshopMsg) setGrantBanner(workshopMsg);
      window.dispatchEvent(new Event("auth_session_changed"));
    } finally {
      setPickBusy(null);
    }
  }

  return (
    <GamePanel className="tutorial-panel">
      <div className="tutorial-panel__head">
        <div>
          <p className="game-label">튜토리얼</p>
          <h2 className="tutorial-panel__title">Merxatus 시작하기</h2>
        </div>
        <span className="tutorial-panel__pct">{state.progressPercent}%</span>
      </div>

      <ol className="tutorial-panel__list">
        {TUTORIAL_STEPS.map((s, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <li
              key={s.id}
              className={`tutorial-panel__item ${done ? "tutorial-panel__item--done" : ""} ${active ? "tutorial-panel__item--active" : ""}`}
            >
              <span className="tutorial-panel__bullet">{done ? "✓" : i + 1}</span>
              <span className="tutorial-panel__item-title">{s.title}</span>
            </li>
          );
        })}
      </ol>

      {grantBanner ? <p className="tutorial-panel__grant">{grantBanner}</p> : null}

      {current ? (
        <div className="tutorial-panel__current">
          <p className="tutorial-panel__hint">{current.hint}</p>
          {current.id === "choose_specialist" ? (
            <div className="tutorial-panel__specialist-pick">
              {(["BLACKSMITH", "ALCHEMIST", "JEWELER"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className="tutorial-panel__specialist-btn"
                  disabled={!!pickBusy}
                  onClick={() => void pickSpecialist(p)}
                >
                  {pickBusy === p ? "…" : SPECIALIST_LABEL[p]}
                </button>
              ))}
            </div>
          ) : current.action ? (
            <GameBtn onClick={() => void goCurrent()}>
              {current.action.kind === "route" ? "거래소로 이동" : "수집 화면 열기"}
            </GameBtn>
          ) : null}
        </div>
      ) : null}
    </GamePanel>
  );
}

export function notifyTutorialRefresh() {
  window.dispatchEvent(new Event("tutorial_refresh"));
}
