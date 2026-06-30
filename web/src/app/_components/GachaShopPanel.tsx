"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { formatPanelError } from "@/shared/formatPanelError";
import { notifyGameFramePatch } from "@/shared/gameFramePatch";
import { GACHA_STANDARD_POOL_ID } from "@/shared/gachaShop";
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

export function GachaShopPanel() {
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
    () => state?.pools.find((p) => p.id === GACHA_STANDARD_POOL_ID) ?? state?.pools[0] ?? null,
    [state],
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
        }>("/api/shop/gacha/pull", { poolId: pool.id, count });

        useWalletStore.getState().setWallet({ goldAvailable: result.goldAvailable });
        setState((prev) => (prev ? { ...prev, goldAvailable: result.goldAvailable } : prev));
        setLastRewards(result.rewards);
        setLastSummary(
          `${result.pulls}회 · -${fmtGold(result.goldSpent)} G` +
            (result.goldGained > 0 ? ` · 보상 골드 +${fmtGold(result.goldGained)} G` : ""),
        );
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

  if (sessionLoading || loading) return <GamePanelLoading label="가챠 상점 불러오는 중…" />;
  if (!userId) return <GamePanelInfo>로그인 후 이용할 수 있습니다.</GamePanelInfo>;
  if (!pool) return <GamePanelInfo>가챠 풀이 없습니다.</GamePanelInfo>;

  const gold = goldAvailable ?? state?.goldAvailable ?? 0;
  const canSingle = gold >= pool.singleCostGold && !busy;
  const canMulti = gold >= pool.multiCostGold && !busy;

  return (
    <div className="gacha-shop">
      <header className="gacha-shop__hero">
        <p className="gacha-shop__eyebrow">거래소 · 가챠</p>
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
          {pool.multiGuaranteeEquipment ? (
            <span className="gacha-shop__badge">장비 1+</span>
          ) : null}
        </GameBtn>
      </div>

      <section className="gacha-shop__rates" aria-label="구성 안내">
        <h3 className="gacha-shop__rates-title">주요 구성</h3>
        <ul className="gacha-shop__rates-list">
          <li>크래프팅 재료 — 하급 마석, 감정서, 마석, 강화 보호 주문서 등</li>
          <li>골드 — 60~520 G (일부 환급)</li>
          <li>입문 장비 — 나무·돌 검, 가죽·사슬 방어구 (낮은 확률)</li>
        </ul>
        <p className="gacha-shop__loop-hint">
          뽑기 → 대장간 강화·가공 → 「장비 매입」탭에서 골드 회수 → 다시 뽑기. 던전 방치는 앱을 꺼 둔 동안 쌓이는
          추가 보상입니다.
        </p>
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
