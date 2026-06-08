"use client";

import { useCallback, useState } from "react";
import { MinionRecruitReveal } from "@/app/_components/MinionRecruitReveal";
import { GameBtn } from "@/app/_components/gameUi";
import {
  minionCreateBlockedMessage,
  type MinionCreateCandidate,
  type MinionCreateEligibility,
} from "@/shared/minionCreate";
import { dispatchMinionRecruited, type MinionHatchResult } from "@/shared/minionRecruit";
import { apiPostJson } from "@/shared/sessionClient";
import { formatPanelError } from "@/shared/formatPanelError";

type Props = {
  eligibility: MinionCreateEligibility;
  busyId: string | null;
  setBusy: (v: string | null) => void;
  onError: (e: unknown) => void;
  onNotice: (msg: string | null) => void;
  onCreated: () => void | Promise<void>;
  compact?: boolean;
};

export function MinionCreateFlow(props: Props) {
  const { eligibility, busyId, setBusy, onError, onNotice, onCreated, compact } = props;
  const [pickOpen, setPickOpen] = useState(false);
  const [candidates, setCandidates] = useState<MinionCreateCandidate[]>([]);
  const [pickToken, setPickToken] = useState<string | null>(null);
  const [reveal, setReveal] = useState<MinionHatchResult | null>(null);

  const blockedMsg = minionCreateBlockedMessage(eligibility);

  const startCreate = useCallback(async () => {
    if (!eligibility.canCreate) {
      onNotice(blockedMsg || "지금은 생성할 수 없어요.");
      return;
    }
    setBusy("create");
    onError(null);
    onNotice(null);
    try {
      const r = await apiPostJson<{
        ok: boolean;
        candidates: MinionCreateCandidate[];
        pickToken: string;
      }>("/api/minions/create/candidates", {});
      if (!r?.ok) throw r;
      setCandidates(r.candidates);
      setPickToken(r.pickToken);
      setPickOpen(true);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  }, [eligibility.canCreate, blockedMsg, onError, onNotice, setBusy]);

  const confirmPick = useCallback(
    async (candidateIndex: number) => {
      if (!pickToken) return;
      setBusy("create");
      onError(null);
      try {
        const r = await apiPostJson<MinionHatchResult & { ok: boolean }>("/api/minions/create", {
          candidateIndex,
          pickToken,
        });
        if (!r?.ok) throw r;
        setPickOpen(false);
        setPickToken(null);
        setCandidates([]);
        setReveal(r);
        dispatchMinionRecruited({
          minionId: r.minion.id,
          pool: r.minion.pool,
          combatClass: r.minion.combatClass,
        });
        await onCreated();
      } catch (e) {
        onError(e);
      } finally {
        setBusy(null);
      }
    },
    [pickToken, onCreated, onError, setBusy],
  );

  return (
    <>
      <div className={`minion-create-bar ${compact ? "minion-create-bar--compact" : ""}`}>
        <div className="minion-create-bar__meta">
          <span className="minion-create-bar__title">캐릭터 생성</span>
          <span className="minion-create-bar__sub">
            {eligibility.isFirstSlot
              ? "첫 캐릭터를 만듭니다."
              : `부캐 생성 · 최고 Lv${eligibility.highestLevel} / 필요 Lv${eligibility.requiredLevel}`}
            {" · "}
            {eligibility.minionCount}/{eligibility.maxOwned}명
          </span>
        </div>
        <GameBtn
          variant="primary"
          className={compact ? "h-8 shrink-0 px-3 text-xs" : ""}
          disabled={!!busyId || !eligibility.canCreate}
          onClick={() => void startCreate()}
        >
          {busyId === "create" ? "…" : eligibility.isFirstSlot ? "캐릭터 만들기" : "부캐 생성"}
        </GameBtn>
      </div>
      {!eligibility.canCreate && blockedMsg ? (
        <p className="minion-create-bar__hint">{blockedMsg}</p>
      ) : null}

      {pickOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4">
          <div className="game-panel w-full max-w-md p-5">
            <div className="text-lg font-semibold text-[var(--game-text)]">캐릭터 생성</div>
            <p className="mt-2 text-sm text-[var(--game-muted)]">
              초기 스탯에 따라 검술 성향이 정해집니다. 나무 검을 지급하며, Lv30·70 전직은 미니언 관리에서 진행합니다.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {candidates.map((c) => (
                <GameBtn
                  key={c.candidateIndex}
                  variant="primary"
                  disabled={!!busyId}
                  onClick={() => void confirmPick(c.candidateIndex)}
                >
                  {c.labelKo}
                </GameBtn>
              ))}
              <GameBtn variant="ghost" disabled={!!busyId} onClick={() => setPickOpen(false)}>
                취소
              </GameBtn>
            </div>
          </div>
        </div>
      ) : null}

      {reveal ? (
        <MinionRecruitReveal
          mode="create"
          result={reveal}
          onClose={() => setReveal(null)}
        />
      ) : null}
    </>
  );
}

export function formatMinionCreateError(e: unknown): string {
  const o = e as { error?: string };
  if (o?.error === "MINION_CREATE_LEVEL_REQUIRED") {
    return "추가 캐릭터는 기존 캐릭터가 Lv100 이상이어야 해요.";
  }
  if (o?.error === "MAX_DUNGEON_MINION_OWNED") return "미니언 보유 한도에 도달했어요.";
  if (o?.error === "MINION_CREATE_MIGRATED") {
    return "미니언 고용권 대신 미니언 관리에서 캐릭터를 생성해 주세요.";
  }
  return formatPanelError(e);
}
