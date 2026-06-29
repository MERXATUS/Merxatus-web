"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { MinionEquipDoll } from "@/app/_components/MinionEquipDoll";
import { MinionStatPanel } from "@/app/_components/MinionStatPanel";
import { useGameFrame } from "@/app/_components/GameFrameContext";
import { KnightOrderPanel } from "@/app/_components/KnightOrderPanel";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { GAME_FRAME_REFRESH_EVENT, type GameTabKey } from "@/shared/gameNav";
import type { MeDashboardRepresentativeMinion } from "@/shared/meDashboard";
import { buildMinionEquipmentView } from "@/shared/minionEquipmentView";
import { fetchCombatRoster, type CombatRosterMinion } from "@/shared/combatRosterClient";
import { apiPostJson } from "@/shared/sessionClient";
import { formatPanelError } from "@/shared/formatPanelError";
import { useSessionUser } from "@/app/_components/SessionProvider";

function fmtGold(n: number) {
  return Math.floor(n).toLocaleString();
}

function fmtSignedGold(n: number) {
  const v = Math.floor(n);
  if (v > 0) return `+${v.toLocaleString()}`;
  if (v < 0) return v.toLocaleString();
  return "0";
}

function RepresentativeMinionCard(props: {
  minion: MeDashboardRepresentativeMinion;
  embedded?: boolean;
  onOpenMinions: () => void;
  onChangeRepresentative: () => void;
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
    <div className={`home-minion-detail ${embedded ? "home-minion-detail--fit home-minion-detail--hero" : ""}`}>
      <div className={`minion-detail-grid home-minion-detail__grid ${embedded ? "minion-detail-grid--fit" : ""}`}>
        <MinionEquipDoll equipment={equipmentView} compact={embedded} />
        <div className="min-w-0 space-y-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--game-text)]">
              {minion.displayName ?? minion.combatClassLabel}{" "}
              <span className="text-xs font-semibold text-[var(--game-muted)]">Lv {minion.level}</span>
              {minion.unspentSkillPoints > 0 ? (
                <span className="home-minion-detail__skill-badge">스킬 {minion.unspentSkillPoints}P</span>
              ) : null}
            </h3>
            {minion.nickname?.trim() ? (
              <p className="mt-0.5 text-[10px] text-[var(--game-muted)]">{minion.combatClassLabel}</p>
            ) : null}
            {!embedded ? (
              <p className="mt-0.5 text-[10px] font-semibold text-[var(--game-gold-bright)]">
                전투력 {minion.combatStats.combatPower.toLocaleString()}
              </p>
            ) : null}
          </div>
          <MinionStatPanel stats={minion.combatStats} compact={!embedded} minimal={embedded} />
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
          <div className="flex gap-2">
            <GameBtn variant="ghost" className="h-8 flex-1 text-xs" onClick={props.onChangeRepresentative}>
              대표 변경
            </GameBtn>
            <GameBtn variant="ghost" className="h-8 flex-1 text-xs" onClick={props.onOpenMinions}>
              미니언 관리
            </GameBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function RepresentativePickModal(props: {
  open: boolean;
  roster: CombatRosterMinion[];
  busy: boolean;
  onClose: () => void;
  onPick: (minionId: string) => void;
}) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal>
      <div className="game-subpanel-inset max-h-[70vh] w-full max-w-md overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--game-text)]">대표 미니언 선택</h3>
          <GameBtn variant="ghost" className="h-8 px-2 text-xs" onClick={props.onClose} disabled={props.busy}>
            닫기
          </GameBtn>
        </div>
        {props.roster.length === 0 ? (
          <p className="text-xs text-[var(--game-muted)]">미니언이 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {props.roster.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={props.busy}
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--game-border)] bg-black/20 px-3 py-2 text-left text-xs hover:bg-black/35 disabled:opacity-50"
                  onClick={() => props.onPick(m.id)}
                >
                  <span>
                    {m.displayName ?? m.combatClassLabel} · Lv {m.level}
                  </span>
                  <span className="tabular-nums text-[var(--game-gold-bright)]">
                    {(m.combatStats?.combatPower ?? m.combatPower ?? 0).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function HomeOverviewPanel(props: { embedded?: boolean; onNavigate: (tab: GameTabKey) => void }) {
  const frame = useGameFrame();
  const { user } = useSessionUser();
  const [error, setError] = useState<unknown>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickRoster, setPickRoster] = useState<CombatRosterMinion[]>([]);
  const [repBusy, setRepBusy] = useState(false);

  const data = frame.dashboardLight;

  useEffect(() => {
    if (!props.embedded) return;
    const onRefresh = () => void frame.refreshSummary({ force: true });
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
  }, [props.embedded, frame]);

  const openRepresentativePicker = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const roster = await fetchCombatRoster(user.id);
      setPickRoster(roster);
      setPickOpen(true);
    } catch (e) {
      setError(e);
    }
  }, [user]);

  const setRepresentative = useCallback(
    async (minionId: string) => {
      setRepBusy(true);
      setError(null);
      try {
        await apiPostJson("/api/minions/representative", { minionId });
        setPickOpen(false);
        await frame.refreshSummary({ force: true });
        window.dispatchEvent(new CustomEvent(GAME_FRAME_REFRESH_EVENT));
      } catch (e) {
        setError(e);
      } finally {
        setRepBusy(false);
      }
    },
    [frame],
  );

  const settlePending = useCallback(
    async (listingId: string) => {
      setSettlingId(listingId);
      setError(null);
      try {
        await apiPostJson<{ ok: boolean }>("/api/market/settle", { listingId });
        await frame.refreshSummary({ force: true });
        window.dispatchEvent(new CustomEvent(GAME_FRAME_REFRESH_EVENT));
      } catch (e) {
        setError(e);
      } finally {
        setSettlingId(null);
      }
    },
    [frame],
  );

  if (!frame.loggedIn) {
    return <GamePanelInfo>로그인하면 대시보드를 볼 수 있어요.</GamePanelInfo>;
  }

  if ((frame.summaryLoading || frame.dashboardLoading) && !data) {
    return <GamePanelLoading label="대시보드 불러오는 중…" />;
  }

  const bootstrapFailed = frame.summaryError ?? (error && !data ? error : null);
  const summaryReady = !!frame.summary?.ok;

  if (!data) {
    if (bootstrapFailed) {
      return (
        <div className="space-y-3">
          <GamePanelError error={bootstrapFailed} />
          <GameBtn variant="ghost" className="h-8 text-xs" onClick={() => void frame.refreshSummary({ force: true })}>
            다시 불러오기
          </GameBtn>
        </div>
      );
    }
    if (summaryReady && frame.dashboardLoading) {
      return <GamePanelLoading label="자산·미니언 정보 불러오는 중…" />;
    }
    return <GamePanelLoading label="대시보드 준비 중…" />;
  }

  const { assets, pendingSales, representativeMinion, knightOrder, totalUnspentSkillPoints, leaderboardHighlights } =
    data;

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

      <KnightOrderPanel knightOrder={knightOrder} compact={props.embedded} className="home-overview__knight" />

      <section className="home-panel home-overview__ranking">
        <div className="home-panel__title-row">
          <div className="home-panel__title">내 랭킹</div>
          <GameBtn variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => props.onNavigate("ranking")}>
            전체 보기
          </GameBtn>
        </div>
        {leaderboardHighlights.length === 0 ? (
          <p className="home-panel__empty">탑·레이드에 도전하면 순위가 기록돼요.</p>
        ) : (
          <ul className="home-ranking-highlights">
            {leaderboardHighlights.map((h) => (
              <li key={h.boardKey} className="home-ranking-highlights__row">
                <span className="home-ranking-highlights__label">{h.label}</span>
                <span className="home-ranking-highlights__rank">#{h.rank}</span>
                <span className="home-ranking-highlights__score">{h.scoreLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="home-overview__grid home-overview__grid--no-chart">
        <section className="home-panel home-panel--minion home-panel--span-wide">
          <div className="home-panel__title-row">
            <div className="home-panel__title">대표 미니언</div>
            {totalUnspentSkillPoints > 0 ? (
              <button
                type="button"
                className="home-panel__skill-pill"
                title="미니언 관리에서 스킬 배분"
                onClick={() => props.onNavigate("minions")}
              >
                스킬 포인트 {totalUnspentSkillPoints}
              </button>
            ) : null}
          </div>
          <div className="home-panel__body home-panel__body--minion">
            {representativeMinion ? (
              <RepresentativeMinionCard
                embedded={props.embedded}
                minion={representativeMinion}
                onOpenMinions={() => props.onNavigate("minions")}
                onChangeRepresentative={() => void openRepresentativePicker()}
              />
            ) : (
              <div className="space-y-2 text-center">
                <p className="home-panel__empty">홈에 표시할 대표 미니언을 지정해 주세요.</p>
                <GameBtn className="h-8 text-xs" onClick={() => void openRepresentativePicker()}>
                  대표 미니언 선택
                </GameBtn>
              </div>
            )}
          </div>
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
      </div>

      {error ? (
        <p className="home-overview__warn text-xs text-amber-300/90">{formatPanelError(error)}</p>
      ) : null}

      <RepresentativePickModal
        open={pickOpen}
        roster={pickRoster}
        busy={repBusy}
        onClose={() => setPickOpen(false)}
        onPick={(id) => void setRepresentative(id)}
      />
    </GamePanel>
  );
}
