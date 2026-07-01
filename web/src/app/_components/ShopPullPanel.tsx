"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { notifyTutorialRefresh } from "@/app/_components/TutorialPanel";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { notifyGameFramePatch } from "@/shared/gameFramePatch";
import type { GachaPoolDef } from "@/shared/gachaShop";
import { apiGetJson, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
import { useWalletStore, selectGoldAvailable } from "@/shared/stores/walletStore";
import { useGameDataPatch } from "@/shared/useGameDataPatch";

type GachaPoolView = {
  id: string;
  name: string;
  description: string;
  singleCostGold: number;
  multiCount: number;
  multiCostGold: number;
  multiGuaranteeEquipment: boolean;
};

type GachaRewardRow = {
  kind: "gold" | "item" | "equipment";
  itemId: string | null;
  name: string;
  qty: number;
  grade: number;
  icon: string | null;
  iconSrc: string;
};

type GachaState = {
  ok: true;
  goldAvailable: number;
  pools: GachaPoolView[];
};

function fmtGold(n: number) {
  return n.toLocaleString();
}

function rewardLabel(row: GachaRewardRow) {
  if (row.kind === "gold") return `+${fmtGold(row.qty)} G`;
  return `${row.name} ×${row.qty}`;
}

export type ShopPullPanelProps = {
  poolId: GachaPoolDef["id"];
  eyebrow: string;
  rateHints: string[];
  loopHint?: string;
  multiBadge?: string;
};

export function ShopPullPanel(props: ShopPullPanelProps) {
  const { user, loading: sessionLoading } = useSessionUser();
  const userId = user?.id ?? "";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [state, setState] = useState<GachaState | null>(null);
  const [lastRewards, setLastRewards] = useState<GachaRewardRow[] | null>(null);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  const goldAvailable = useWalletStore(selectGoldAvailable);
  const pool = useMemo(
    () => state?.pools.find((p) => p.id === props.poolId) ?? null,
    [state, props.poolId],
  );

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetJson<GachaState>("/api/shop/gacha");
      setState(data);
      useWalletStore.getState().setWallet({ goldAvailable: data.goldAvailable });
    } catch (e) {
      if (!isUnauthorizedError(e)) setError(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!userId) {
      setLoading(false);
      return;
    }
    void load();
  }, [sessionLoading, userId, load]);

  useGameDataPatch(
    ["wallet"],
    useCallback(() => {
      void load();
    }, [load]),
  );

  const pull = useCallback(
    async (count: 1 | 10) => {
      if (!userId || !pool || busy) return;
      const cost = count === 10 ? pool.multiCostGold : pool.singleCostGold;
      const available = goldAvailable ?? state?.goldAvailable ?? 0;
      if (available < cost) {
        setError(new Error("INSUFFICIENT_GOLD"));
        return;
      }

      setBusy(true);
      setError(null);
      setLastSummary(null);
      const rollback = useWalletStore.getState().optimisticGoldDelta(-cost);

      try {
        const result = await apiPostJson<{
          ok: true;
          pulls: number;
          goldSpent: number;
          goldGained: number;
          goldAvailable: number;
          rewards: GachaRewardRow[];
          tutorialAdvanced?: boolean;
        }>("/api/shop/gacha/pull", { poolId: pool.id, count });

        useWalletStore.getState().setWallet({ goldAvailable: result.goldAvailable });
        setState((prev) => (prev ? { ...prev, goldAvailable: result.goldAvailable } : prev));
        setLastRewards(result.rewards);
        setLastSummary(
          `${result.pulls}회 · -${fmtGold(result.goldSpent)} G` +
            (result.goldGained > 0 ? ` · 보상 골드 +${fmtGold(result.goldGained)} G` : ""),
        );
        if (result.tutorialAdvanced) notifyTutorialRefresh();
        notifyGameFramePatch(["wallet", "inventory", "weapons", "armor"]);
      } catch (e) {
        rollback();
        if (!isUnauthorizedError(e)) setError(e);
      } finally {
        setBusy(false);
      }
    },
    [userId, pool, busy, goldAvailable, state?.goldAvailable],
  );

  if (sessionLoading || loading) return <GamePanelLoading label="상점 불러오는 중…" />;
  if (!userId) return <GamePanelInfo>로그인 후 이용할 수 있습니다.</GamePanelInfo>;
  if (!pool) return <GamePanelInfo>뽑기 풀을 찾을 수 없습니다.</GamePanelInfo>;

  const gold = goldAvailable ?? state?.goldAvailable ?? 0;
  const canSingle = gold >= pool.singleCostGold && !busy;
  const canMulti = gold >= pool.multiCostGold && !busy;

  return (
    <div className="gacha-shop shop-pull">
      <header className="gacha-shop__hero">
        <p className="gacha-shop__eyebrow">{props.eyebrow}</p>
        <h2 className="gacha-shop__title">{pool.name}</h2>
        <p className="gacha-shop__desc">{pool.description}</p>
        <p className="gacha-shop__gold">
          보유 골드 <strong>{fmtGold(gold)} G</strong>
        </p>
      </header>

      {error ? <GamePanelError error={error} /> : null}
      {lastSummary ? <p className="gacha-shop__notice">{lastSummary}</p> : null}

      <div className="gacha-shop__actions">
        <GameBtn type="button" disabled={!canSingle} onClick={() => void pull(1)}>
          1회 뽑기 · {fmtGold(pool.singleCostGold)} G
        </GameBtn>
        <GameBtn type="button" disabled={!canMulti} onClick={() => void pull(10)}>
          {pool.multiCount}회 뽑기 · {fmtGold(pool.multiCostGold)} G
          {props.multiBadge ? <span className="gacha-shop__badge">{props.multiBadge}</span> : null}
        </GameBtn>
      </div>

      <section className="gacha-shop__rates" aria-label="구성 안내">
        <h3 className="gacha-shop__rates-title">주요 구성</h3>
        <ul className="gacha-shop__rates-list">
          {props.rateHints.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {props.loopHint ? <p className="gacha-shop__loop-hint">{props.loopHint}</p> : null}
      </section>

      {lastRewards && lastRewards.length > 0 ? (
        <section className="gacha-shop__results" aria-label="최근 결과">
          <h3 className="gacha-shop__results-title">최근 결과</h3>
          <ul className="gacha-shop__result-grid">
            {lastRewards.map((row, i) => (
              <li key={`${row.kind}-${row.itemId ?? "gold"}-${i}`} className="gacha-shop__result-card">
                {row.kind === "gold" ? (
                  <span className="gacha-shop__gold-icon" aria-hidden>
                    G
                  </span>
                ) : (
                  <ItemIcon
                    itemId={row.itemId ?? undefined}
                    icon={row.icon}
                    iconSrc={row.iconSrc}
                    size={44}
                  />
                )}
                <span className={`gacha-shop__result-name ${itemGradeNameClassName(row.grade)}`}>
                  {rewardLabel(row)}
                </span>
                {row.kind === "equipment" ? (
                  <span className="gacha-shop__result-tag">장비</span>
                ) : row.kind === "item" ? (
                  <span className="gacha-shop__result-tag">재료</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
