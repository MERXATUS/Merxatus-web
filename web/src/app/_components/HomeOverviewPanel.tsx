"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { MinionEquipDoll } from "@/app/_components/MinionEquipDoll";
import { MinionStatPanel } from "@/app/_components/MinionStatPanel";
import { useGameFrame } from "@/app/_components/GameFrameContext";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { GAME_FRAME_REFRESH_EVENT, type GameTabKey } from "@/shared/gameNav";
import type { MeDashboard, MeDashboardGoldDay } from "@/shared/meDashboard";
import { buildMinionEquipmentView } from "@/shared/minionEquipmentView";
import { apiGetJson, apiPostJson } from "@/shared/sessionClient";
import { formatPanelError } from "@/shared/formatPanelError";

type GoldTrendRange = "week" | "month";

function fmtGold(n: number) {
  return Math.floor(n).toLocaleString();
}

function fmtSignedGold(n: number) {
  const v = Math.floor(n);
  if (v > 0) return `+${v.toLocaleString()}`;
  if (v < 0) return v.toLocaleString();
  return "0";
}

function buildGoldLineChart(days: MeDashboardGoldDay[]) {
  const width = 320;
  const height = 72;
  const pad = { top: 8, right: 6, bottom: 4, left: 6 };
  const values = days.map((d) => d.netGold);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);
  const span = maxVal - minVal || 1;
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const points = days.map((day, i) => {
    const x =
      pad.left + (days.length <= 1 ? chartW / 2 : (i / (days.length - 1)) * chartW);
    const y = pad.top + chartH - ((day.netGold - minVal) / span) * chartH;
    return { x, y, day };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const zeroY = pad.top + chartH - ((0 - minVal) / span) * chartH;
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1]!.x.toFixed(2)} ${zeroY.toFixed(2)} L ${points[0]!.x.toFixed(2)} ${zeroY.toFixed(2)} Z`
      : "";

  return { width, height, points, linePath, areaPath, zeroY, hasNegative: minVal < 0, hasPositive: maxVal > 0 };
}

function shouldShowChartLabel(index: number, total: number, range: GoldTrendRange) {
  if (total <= 1) return true;
  if (range === "week") return true;
  const step = Math.max(1, Math.ceil(total / 7));
  return index === 0 || index === total - 1 || index % step === 0;
}

function GoldTrendChart(props: {
  range: GoldTrendRange;
  onRangeChange: (r: GoldTrendRange) => void;
  days: MeDashboardGoldDay[];
  netTotal: number;
}) {
  const chart = useMemo(() => buildGoldLineChart(props.days), [props.days]);
  const title = props.range === "week" ? "주간 골드 흐름" : "월간 골드 흐름";
  const lineUp = props.netTotal >= 0;

  return (
    <div className="home-chart">
      <div className="home-chart__head">
        <div className="home-chart__head-left">
          <span className="home-chart__title">{title}</span>
          <div className="home-chart__range" role="tablist" aria-label="골드 흐름 기간">
            <button
              type="button"
              role="tab"
              aria-selected={props.range === "week"}
              className={`home-chart__range-btn ${props.range === "week" ? "home-chart__range-btn--active" : ""}`}
              onClick={() => props.onRangeChange("week")}
            >
              주간
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={props.range === "month"}
              className={`home-chart__range-btn ${props.range === "month" ? "home-chart__range-btn--active" : ""}`}
              onClick={() => props.onRangeChange("month")}
            >
              월간
            </button>
          </div>
        </div>
        <span
          className={`home-chart__total ${props.netTotal >= 0 ? "home-chart__total--up" : "home-chart__total--down"}`}
        >
          {fmtSignedGold(props.netTotal)}G
        </span>
      </div>

      <div
        className={`home-chart__plot ${props.range === "month" ? "home-chart__plot--month" : ""}`}
        role="img"
        aria-label={`${title} 꺾은선 그래프`}
      >
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          preserveAspectRatio="none"
          className="home-chart__svg"
        >
          {chart.hasNegative && chart.hasPositive ? (
            <line
              x1={6}
              x2={chart.width - 6}
              y1={chart.zeroY}
              y2={chart.zeroY}
              className="home-chart__zero-line"
            />
          ) : null}
          {chart.areaPath ? (
            <path
              d={chart.areaPath}
              className={`home-chart__area ${lineUp ? "home-chart__area--up" : "home-chart__area--down"}`}
            />
          ) : null}
          {chart.linePath ? (
            <path
              d={chart.linePath}
              className={`home-chart__line ${lineUp ? "home-chart__line--up" : "home-chart__line--down"}`}
            />
          ) : null}
          {chart.points.map((p) => (
            <circle
              key={p.day.date}
              cx={p.x}
              cy={p.y}
              r={props.range === "month" ? 1.6 : 2.4}
              className={`home-chart__dot ${p.day.netGold >= 0 ? "home-chart__dot--up" : "home-chart__dot--down"}`}
            >
              <title>
                {p.day.label} {fmtSignedGold(p.day.netGold)}G
              </title>
            </circle>
          ))}
        </svg>
        <div className="home-chart__labels" aria-hidden>
          {props.days.map((d, i) =>
            shouldShowChartLabel(i, props.days.length, props.range) ? (
              <span key={d.date} className="home-chart__day">
                {d.label}
              </span>
            ) : (
              <span key={d.date} className="home-chart__day home-chart__day--spacer" />
            ),
          )}
        </div>
      </div>
      <p className="home-chart__hint">거래소·황실 등 골드 거래 기준 (추정 자산 제외)</p>
    </div>
  );
}

function QuickStatus(props: { onNavigate: (tab: GameTabKey) => void }) {
  const frame = useGameFrame();
  const s = frame.summary;

  if (!s) {
    return <GamePanelLoading label="상태 불러오는 중…" />;
  }

  const rows = [
    {
      label: "던전",
      value: s.dungeon.active && s.dungeon.name ? `${s.dungeon.name} 탐험 중` : "대기",
      tab: "dungeon" as const,
    },
    {
      label: "용병",
      value: `${s.mercenaries.count}/${s.mercenaries.maxCount}명 · 최고 Lv${s.mercenaries.topLevel ?? "—"}`,
      tab: "minions" as const,
    },
    {
      label: "거래",
      value: `매물 ${s.market.activeListingCount}/${s.market.maxActiveListings}건`,
      tab: "market" as const,
    },
    {
      label: "인벤",
      value: `종류 ${s.inventory.kindCount} · 무기 ${s.inventory.weaponCount}`,
      tab: "inventory" as const,
    },
  ];

  return (
    <div className="home-quick">
      <div className="home-quick__title">지금 상황</div>
      <ul className="home-quick__list">
        {rows.map((r) => (
          <li key={r.label}>
            <button type="button" className="home-quick__row" onClick={() => props.onNavigate(r.tab)}>
              <span className="home-quick__label">{r.label}</span>
              <span className="home-quick__val">{r.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StrongestMinionCard(props: {
  minion: NonNullable<MeDashboard["strongestMinion"]>;
  embedded?: boolean;
  onOpenMinions: () => void;
}) {
  const { minion, embedded } = props;
  const equipmentView = useMemo(
    () =>
      buildMinionEquipmentView({
        equippedWeapon: minion.equippedWeapon,
        equippedArmor: minion.equippedArmor,
      }),
    [minion],
  );

  return (
    <div className={`home-minion-detail ${embedded ? "home-minion-detail--fit" : ""}`}>
      <div className="minion-detail-grid home-minion-detail__grid">
        <MinionEquipDoll equipment={equipmentView} compact />
        <div className="min-w-0 space-y-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--game-text)]">
              {minion.combatClassLabel}{" "}
              <span className="text-xs font-semibold text-[var(--game-muted)]">Lv {minion.level}</span>
            </h3>
            <p className="mt-0.5 text-[10px] font-semibold text-[var(--game-gold-bright)]">
              전투력 {minion.combatStats.combatPower.toLocaleString()}
            </p>
          </div>
          <MinionStatPanel stats={minion.combatStats} compact />
          {!embedded && minion.traits.length > 0 ? (
            <div>
              <div className="game-stat-label mb-1">특성</div>
              <ul className="flex flex-wrap gap-1">
                {minion.traits.map((t) => (
                  <li
                    key={t.type}
                    className="rounded-md border border-[var(--game-border)] bg-black/25 px-1.5 py-0.5 text-[10px] text-[var(--game-muted)]"
                  >
                    {t.type} R{t.rank}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <GameBtn variant="ghost" className="h-8 w-full text-xs" onClick={props.onOpenMinions}>
            미니언 관리
          </GameBtn>
        </div>
      </div>
    </div>
  );
}

export function HomeOverviewPanel(props: { embedded?: boolean; onNavigate: (tab: GameTabKey) => void }) {
  const frame = useGameFrame();
  const [data, setData] = useState<MeDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [goldRange, setGoldRange] = useState<GoldTrendRange>("week");
  const [settlingId, setSettlingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await apiGetJson<MeDashboard>("/api/me/dashboard");
      setData(r);
    } catch (e) {
      setError(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!frame.loggedIn) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    void load();
  }, [frame.loggedIn, load]);

  useEffect(() => {
    if (!props.embedded) return;
    const onRefresh = () => void load();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
  }, [props.embedded, load]);

  const chartDays = useMemo(() => {
    if (!data) return [];
    return goldRange === "week" ? data.goldTrend.week : data.goldTrend.month;
  }, [data, goldRange]);

  const chartNet = useMemo(() => {
    if (!data) return 0;
    return goldRange === "week" ? data.goldTrend.weekNetGold : data.goldTrend.monthNetGold;
  }, [data, goldRange]);

  const settlePending = useCallback(
    async (listingId: string) => {
      setSettlingId(listingId);
      setError(null);
      try {
        await apiPostJson<{ ok: boolean }>("/api/market/settle", { listingId });
        await load();
        window.dispatchEvent(new CustomEvent(GAME_FRAME_REFRESH_EVENT));
      } catch (e) {
        setError(e);
      } finally {
        setSettlingId(null);
      }
    },
    [load],
  );

  if (!frame.loggedIn) {
    return <GamePanelInfo>로그인하면 대시보드를 볼 수 있어요.</GamePanelInfo>;
  }

  if (loading && !data) {
    return <GamePanelLoading label="대시보드 불러오는 중…" />;
  }

  if (error && !data) {
    return <GamePanelError error={error} />;
  }

  if (!data) {
    return <GamePanelLoading label="대시보드 준비 중…" />;
  }

  const { assets, pendingSales, strongestMinion } = data;

  return (
    <GamePanel className={`home-overview ${props.embedded ? "home-overview--fit panel-fit" : ""}`}>
      <header className="home-overview__hero">
        <div>
          <p className="game-label">총 추정 자산</p>
          <p className="home-overview__total">{fmtGold(assets.totalEstimatedGold)} G</p>
        </div>
        <div className="home-overview__hero-stats">
          <div className="home-stat-pill home-stat-pill--gold">
            <span className="home-stat-pill__label">보유 골드</span>
            <span className="home-stat-pill__val">{fmtGold(assets.goldAvailable)}G</span>
          </div>
          {assets.goldLocked > 0 ? (
            <div className="home-stat-pill">
              <span className="home-stat-pill__label">거래 예치</span>
              <span className="home-stat-pill__val">{fmtGold(assets.goldLocked)}G</span>
            </div>
          ) : null}
          {frame.summary?.todayNetGold != null ? (
            <div className="home-stat-pill">
              <span className="home-stat-pill__label">오늘 순골드</span>
              <span
                className={`home-stat-pill__val ${frame.summary.todayNetGold >= 0 ? "text-emerald-300" : "text-rose-300"}`}
              >
                {fmtSignedGold(frame.summary.todayNetGold)}G
              </span>
            </div>
          ) : null}
        </div>
      </header>

      <div className="home-overview__asset-grid">
        <div className="home-asset-card">
          <span className="home-asset-card__label">재료·소모품</span>
          <span className="home-asset-card__val">{fmtGold(assets.inventoryEstimatedGold)}G</span>
          <span className="home-asset-card__sub">
            {assets.inventoryKindCount}종 · {fmtGold(assets.inventoryTotalQty)}개
          </span>
        </div>
        <div className="home-asset-card">
          <span className="home-asset-card__label">무기</span>
          <span className="home-asset-card__val">{fmtGold(assets.weaponsEstimatedGold)}G</span>
          <span className="home-asset-card__sub">{assets.weaponCount}개 (기준가 추정)</span>
        </div>
      </div>

      <div className="home-overview__grid">
        <section className="home-panel home-panel--chart">
          <GoldTrendChart
            range={goldRange}
            onRangeChange={setGoldRange}
            days={chartDays}
            netTotal={chartNet}
          />
        </section>

        <section className="home-panel home-panel--minion">
          <div className="home-panel__title">최강 미니언</div>
          {strongestMinion ? (
            <StrongestMinionCard
              embedded={props.embedded}
              minion={strongestMinion}
              onOpenMinions={() => props.onNavigate("minions")}
            />
          ) : (
            <p className="home-panel__empty">미니언이 없어요.</p>
          )}
        </section>

        <section className="home-panel home-panel--sales">
          <div className="home-panel__title">최근 판매 (거래소)</div>
          <p className="home-panel__hint">낙찰·거래 완료 후 아직 정산하지 않은 내 매물</p>
          {pendingSales.length === 0 ? (
            <p className="home-panel__empty">정산 대기 중인 매물이 없어요.</p>
          ) : (
            <ul className="home-sales-list">
              {pendingSales.map((s) => (
                <li key={s.listingId} className="home-sales-row">
                  <ItemIcon itemId={s.itemId} size={36} />
                  <div className="home-sales-row__meta min-w-0">
                    <div className="home-sales-row__name truncate">
                      {s.itemName}
                      {s.enhanceLevel != null && s.enhanceLevel > 0 ? (
                        <span className="text-[var(--game-muted)]"> +{s.enhanceLevel}</span>
                      ) : null}
                      {s.quantity > 1 ? (
                        <span className="text-[var(--game-muted)]"> ×{s.quantity}</span>
                      ) : null}
                    </div>
                    <div className="home-sales-row__time">
                      낙찰 {fmtGold(s.highestBid)}G · 정산 시 +{fmtGold(s.expectedNetGold)}G
                    </div>
                  </div>
                  <GameBtn
                    variant="ghost"
                    className="h-8 shrink-0 px-2 text-xs"
                    disabled={settlingId === s.listingId}
                    onClick={() => void settlePending(s.listingId)}
                  >
                    {settlingId === s.listingId ? "…" : "정산"}
                  </GameBtn>
                </li>
              ))}
            </ul>
          )}
          <GameBtn variant="ghost" className="mt-2 h-8 w-full text-xs" onClick={() => props.onNavigate("market")}>
            거래소 열기
          </GameBtn>
        </section>

        <section className="home-panel home-panel--status">
          <QuickStatus onNavigate={props.onNavigate} />
        </section>
      </div>

      {error ? (
        <p className="home-overview__warn text-xs text-amber-300/90">{formatPanelError(error)}</p>
      ) : null}
    </GamePanel>
  );
}
