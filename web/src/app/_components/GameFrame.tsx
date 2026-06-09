"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthTopBar } from "@/app/_components/AuthTopBar";
import { ChatPanel } from "@/app/_components/ChatPanel";
import { GameFrameProvider } from "@/app/_components/GameFrameContext";
import { HomeOverviewPanel } from "@/app/_components/HomeOverviewPanel";
import { HomeGoldHeader } from "@/app/_components/HomeGoldHeader";
import { HomeSettingsButton } from "@/app/_components/HomeSettingsButton";
import { SettingsPanel } from "@/app/_components/SettingsPanel";
import { UsernameSetupModal } from "@/app/_components/UsernameSetupModal";
import { TutorialPanel } from "@/app/_components/TutorialPanel";
import { GameBtn } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";
import {
  DEFAULT_GAME_TAB,
  GAME_FRAME_REFRESH_EVENT,
  isScrollableGameTab,
  isVisibleGameTab,
  notifyGameFrameRefresh,
  notifyStartTradeWith,
  readStoredGameTab,
  resolveGameTab,
  routeForGameTab,
  writeStoredGameTab,
  type GameTabKey,
  type MinionPanelTab,
  visibleGameTabs,
} from "@/shared/gameNav";
import { isCombatGameTab, prefetchCombatPanelChunk } from "@/shared/combatTabPrefetch";
import { prefetchCombatRoster } from "@/shared/combatRosterClient";
import { googleAuthErrorMessage } from "@/shared/googleAuthErrors";
import { API_CACHE_TTL } from "@/shared/apiCache";
import type { MeDashboardLight } from "@/shared/meDashboard";
import type { DungeonRunState, MeBootstrap, MeSummary } from "@/shared/meSummary";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { apiGetJson, apiGetJsonCached, apiPostJson, notifySessionChanged } from "@/shared/sessionClient";

const panelLoading = (label: string) => <GamePanelLoading label={label} />;

const MarketBoard = dynamic(
  () => import("@/app/_components/MarketBoard").then((m) => m.MarketBoard),
  { loading: () => panelLoading("거래소 불러오는 중…") },
);
const InventoryPanel = dynamic(
  () => import("@/app/_components/InventoryPanel").then((m) => m.InventoryPanel),
  { loading: () => panelLoading("인벤토리 불러오는 중…") },
);
const WeaponEnhancePanel = dynamic(
  () => import("@/app/_components/WeaponEnhancePanel").then((m) => m.WeaponEnhancePanel),
  { loading: () => panelLoading("강화소 불러오는 중…") },
);
const RoyalPanel = dynamic(
  () => import("@/app/_components/RoyalPanel").then((m) => m.RoyalPanel),
  { loading: () => panelLoading("황실 불러오는 중…") },
);
const DungeonsPanel = dynamic(
  () => import("@/app/_components/DungeonsPanel").then((m) => m.DungeonsPanel),
  { loading: () => null },
);
const RaidsPanel = dynamic(
  () => import("@/app/_components/RaidsPanel").then((m) => m.RaidsPanel),
  { loading: () => null },
);
const TowerPanel = dynamic(
  () => import("@/app/_components/TowerPanel").then((m) => m.TowerPanel),
  { loading: () => null },
);
const RankingPanel = dynamic(
  () => import("@/app/_components/RankingPanel").then((m) => m.RankingPanel),
  { loading: () => panelLoading("랭킹 불러오는 중…") },
);
const PvpPanel = dynamic(
  () => import("@/app/_components/PvpPanel").then((m) => m.PvpPanel),
  { loading: () => panelLoading("결투장 불러오는 중…") },
);
const MinionManagementPanel = dynamic(
  () => import("@/app/_components/MinionManagementPanel").then((m) => m.MinionManagementPanel),
  { loading: () => panelLoading("미니언 불러오는 중…") },
);
const BlackMarketPanel = dynamic(
  () => import("@/app/_components/BlackMarketPanel").then((m) => m.BlackMarketPanel),
  { loading: () => panelLoading("암시장 불러오는 중…") },
);

function fmtInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return Math.floor(x).toLocaleString();
}

function GameFrameNav(props: {
  activeTab: GameTabKey;
  onNavigate: (tab: GameTabKey) => void;
  userId: string | null;
}) {
  const tabs = visibleGameTabs();
  return (
    <nav className="game-frame__nav" aria-label="활동 메뉴">
      {tabs.map((tab) => {
        const active = props.activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            className={`game-frame__nav-btn ${active ? "game-frame__nav-btn--active" : ""}`.trim()}
            aria-current={active ? "page" : undefined}
            onClick={() => props.onNavigate(tab.key)}
            onMouseEnter={() => {
              if (isCombatGameTab(tab.key)) {
                prefetchCombatPanelChunk(tab.key);
                prefetchCombatRoster(props.userId);
              }
            }}
            onFocus={() => {
              if (isCombatGameTab(tab.key)) {
                prefetchCombatPanelChunk(tab.key);
                prefetchCombatRoster(props.userId);
              }
            }}
          >
            <span className="game-frame__nav-glyph" aria-hidden>
              {tab.glyph}
            </span>
            <span className="game-frame__nav-label">{tab.shortLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}

function GameFrameStatusBar(props: {
  summary: MeSummary | null;
  summaryLoading: boolean;
  runState: DungeonRunState | null;
}) {
  const { summary, summaryLoading, runState } = props;
  const placeholder = summaryLoading ? "…" : "—";

  const merc =
    summary != null
      ? `용병 ${fmtInt(summary.mercenaries.count)}/${fmtInt(summary.mercenaries.maxCount)}`
      : `용병 ${placeholder}`;

  const dungeon = runState?.active
    ? runState.dungeon?.name
      ? `던전 · ${runState.dungeon.name}`
      : "던전 · 진행 중"
    : summary?.dungeon.active && summary.dungeon.name
      ? `던전 · ${summary.dungeon.name}`
      : "던전 · 대기";

  const market =
    summary != null ? `매물 ${fmtInt(summary.market.activeListingCount)}건` : `거래 ${placeholder}`;

  return (
    <footer className="game-frame__status" aria-label="진행 상태">
      <span className="game-frame__status-chip">{merc}</span>
      <span className="game-frame__status-chip">{dungeon}</span>
      <span className="game-frame__status-chip">{market}</span>
    </footer>
  );
}

function GameFrameContent(props: {
  activeTab: GameTabKey;
  minionPanelTab: MinionPanelTab;
  onOpenMinions: () => void;
  onNavigate: (tab: GameTabKey) => void;
}) {
  const { activeTab, minionPanelTab, onOpenMinions, onNavigate } = props;

  switch (activeTab) {
    case "home":
      return <HomeOverviewPanel embedded onNavigate={onNavigate} />;
    case "market":
      return <MarketBoard embedded />;
    case "inventory":
      return <InventoryPanel embedded onOpenMinions={onOpenMinions} />;
    case "enhance":
      return <WeaponEnhancePanel embedded />;
    case "royal":
      return <RoyalPanel embedded />;
    case "dungeon":
      return <DungeonsPanel embedded />;
    case "raid":
      return <RaidsPanel embedded />;
    case "tower":
      return <TowerPanel embedded />;
    case "pvp":
      return <PvpPanel embedded />;
    case "ranking":
      return <RankingPanel embedded />;
    case "minions":
      return <MinionManagementPanel embedded />;
    case "blackmarket":
      return <BlackMarketPanel embedded />;
    default:
      return null;
  }
}

export function GameFrame() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user: sessionUser, loading: sessionLoading } = useSessionUser();
  const needUsername = !!sessionUser && sessionUser.usernameChosen === false;

  const activeTab = useMemo(
    () => resolveGameTab(pathname, searchParams),
    [pathname, searchParams],
  );

  const [minionPanelTab, setMinionPanelTab] = useState<MinionPanelTab>("dungeon");
  const lastSummaryRefreshRef = useRef(0);
  const [error, setError] = useState<unknown>(null);
  const [summaryError, setSummaryError] = useState<unknown>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [dashboardLight, setDashboardLight] = useState<MeDashboardLight | null>(null);
  const [runState, setRunState] = useState<DungeonRunState | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [contentKey, setContentKey] = useState(0);

  const navigateTab = useCallback(
    (tab: GameTabKey, opts?: { minionTab?: MinionPanelTab }) => {
      if (opts?.minionTab) setMinionPanelTab(opts.minionTab);
      writeStoredGameTab(tab);
      router.push(routeForGameTab(tab));
    },
    [router],
  );

  useEffect(() => {
    if (!isVisibleGameTab(activeTab)) {
      router.replace(routeForGameTab(DEFAULT_GAME_TAB));
    }
  }, [activeTab, router]);

  useEffect(() => {
    writeStoredGameTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (pathname !== "/") return;
    if (searchParams.get("tab") || searchParams.get("panel")) return;
    const target = readStoredGameTab() ?? DEFAULT_GAME_TAB;
    router.replace(routeForGameTab(target));
  }, [pathname, router, searchParams]);

  const refreshSummary = useCallback(
    async (opts?: { force?: boolean }) => {
      setError(null);
      setSummaryError(null);
      if (!sessionUser) {
        setSummary(null);
        setDashboardLight(null);
        setRunState(null);
        setSummaryLoading(false);
        return;
      }
      try {
        const boot = await apiGetJsonCached<MeBootstrap>("/api/me/bootstrap", {
          ttlMs: API_CACHE_TTL.bootstrap,
          force: opts?.force,
        });
        if (!boot?.summary || !boot?.dashboard) {
          throw new Error("BOOTSTRAP_INCOMPLETE");
        }
        setSummary(boot.summary);
        setDashboardLight(boot.dashboard);
        if (boot.summary.dungeon?.active && activeTab !== "dungeon") {
          void apiGetJson<DungeonRunState>("/api/dungeons/run/state")
            .then((rs) => {
              if (rs?.active) setRunState(rs);
              else setRunState(null);
            })
            .catch(() => setRunState(null));
        } else {
          setRunState(null);
        }
      } catch (e) {
        setSummaryError(e);
        setError(e);
      } finally {
        setSummaryLoading(false);
      }
    },
    [sessionUser, activeTab],
  );

  useEffect(() => {
    if (sessionUser?.id) prefetchCombatRoster(sessionUser.id);
  }, [sessionUser?.id]);

  useEffect(() => {
    if (isCombatGameTab(activeTab)) prefetchCombatPanelChunk(activeTab);
  }, [activeTab]);

  const handleGlobalRefresh = useCallback(async () => {
    setContentKey((k) => k + 1);
    await refreshSummary({ force: true });
    notifyGameFrameRefresh();
  }, [refreshSummary]);

  useEffect(() => {
    const authError = searchParams.get("auth_error");
    if (authError) {
      setError(googleAuthErrorMessage(authError));
      const params = new URLSearchParams(searchParams.toString());
      params.delete("auth_error");
      const qs = params.toString();
      const base = pathname === "/" ? "/" : pathname;
      window.history.replaceState(null, "", qs ? `${base}?${qs}` : base);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    function onChanged() {
      const now = Date.now();
      if (now - lastSummaryRefreshRef.current < 8000) return;
      lastSummaryRefreshRef.current = now;
      void refreshSummary();
    }
    window.addEventListener("auth_session_changed", onChanged);
    window.addEventListener("focus", onChanged);
    window.addEventListener("pageshow", onChanged);
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onChanged);
    lastSummaryRefreshRef.current = Date.now();
    setSummaryLoading(true);
    void refreshSummary();
    return () => {
      window.removeEventListener("auth_session_changed", onChanged);
      window.removeEventListener("focus", onChanged);
      window.removeEventListener("pageshow", onChanged);
      window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onChanged);
    };
  }, [refreshSummary, sessionUser?.id]);

  const gold = summary?.wallet?.goldAvailable ?? null;
  useEscapeClose(chatOpen, () => setChatOpen(false));
  useEscapeClose(settingsOpen, () => setSettingsOpen(false));

  async function handleLogout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await apiPostJson("/api/auth/logout", {});
      setSummary(null);
      setDashboardLight(null);
      notifySessionChanged();
      setSettingsOpen(false);
    } finally {
      setLogoutBusy(false);
    }
  }

  const frameContext = useMemo(
    () => ({
      activeTab,
      navigateTab,
      minionPanelTab,
      summary,
      summaryLoading,
      dashboardLight,
      runState,
      refreshSummary,
      gold,
      loggedIn: !!sessionUser,
      sessionLoading,
      summaryError,
    }),
    [
      activeTab,
      navigateTab,
      minionPanelTab,
      summary,
      summaryLoading,
      dashboardLight,
      runState,
      refreshSummary,
      gold,
      sessionUser,
      sessionLoading,
      summaryError,
    ],
  );

  const showSessionGate = sessionLoading || !sessionUser;
  const contentScrollable = isScrollableGameTab(activeTab);

  return (
    <GameFrameProvider value={frameContext}>
      <div className="game-shell game-frame">
        <UsernameSetupModal open={needUsername} currentUsername={sessionUser?.username ?? summary?.username ?? null} />
        <main className="game-frame__main mx-auto w-full max-w-[1800px] px-2 py-1.5 sm:px-2.5">
          <header className="game-frame__hud">
            <div className="game-frame__hud-row">
              <HomeGoldHeader
                gold={gold}
                todayNetGold={summary?.todayNetGold}
                activeListings={summary?.market.activeListingCount}
                username={sessionUser?.username ?? summary?.username ?? null}
              />
              <div className="game-frame__hud-tools">
                <HomeSettingsButton active={settingsOpen} onClick={() => setSettingsOpen((v) => !v)} />
                <GameBtn
                  variant="ghost"
                  className="h-8 px-2.5 text-xs"
                  disabled={summaryLoading}
                  onClick={() => void handleGlobalRefresh()}
                >
                  {summaryLoading ? "…" : "새로고침"}
                </GameBtn>
                <AuthTopBar />
              </div>
            </div>

            <GameFrameNav activeTab={activeTab} onNavigate={navigateTab} userId={sessionUser?.id ?? null} />
          </header>

          <TutorialPanel
            compact
            loggedIn={!!sessionUser}
            onOpenDungeon={() => navigateTab("dungeon")}
          />

          {error ? <GamePanelError error={error} className="mt-1" /> : null}

          <section className="game-frame__section" aria-label={activeTab}>
            <div
              key={`${activeTab}-${contentKey}`}
              className={[
                "game-frame__content game-frame__content--enter",
                contentScrollable ? "game-frame__content--scroll" : "game-frame__content--fit",
              ].join(" ")}
            >
              {showSessionGate ? (
                sessionLoading ? (
                  <GamePanelLoading label="세션 확인 중…" />
                ) : (
                  <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
                )
              ) : (
                <GameFrameContent
                  activeTab={activeTab}
                  minionPanelTab={minionPanelTab}
                  onOpenMinions={() => navigateTab("minions")}
                  onNavigate={navigateTab}
                />
              )}
            </div>
          </section>

          <GameFrameStatusBar
            summary={summary}
            summaryLoading={summaryLoading}
            runState={runState}
          />
        </main>

        <div
          aria-hidden={!chatOpen}
          className={`chat-drawer fixed z-40 flex flex-col overflow-hidden rounded-2xl shadow-2xl ${
            chatOpen ? "chat-drawer-open pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <ChatPanel layout="drawer" onMinimize={() => setChatOpen(false)} pollingEnabled={chatOpen} />
          </div>
        </div>

        <button
          type="button"
          aria-expanded={chatOpen}
          aria-label={chatOpen ? "채팅 축소" : "채팅 열기"}
          onClick={() => setChatOpen((open) => !open)}
          className="game-chat-fab fixed bottom-6 right-6 z-50 flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold transition"
        >
          {chatOpen ? "축소" : "채팅"}
        </button>

        <SettingsPanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          loggedIn={!!sessionUser}
          username={sessionUser?.username ?? summary?.username ?? null}
          userId={sessionUser?.id ?? null}
          logoutBusy={logoutBusy}
          onLogout={handleLogout}
          onRefresh={refreshSummary}
          onUsernameChanged={(username) => {
            setSummary((prev) => (prev ? { ...prev, username } : prev));
          }}
          onStartTrade={(username) => {
            setSettingsOpen(false);
            navigateTab("market");
            notifyStartTradeWith(username);
          }}
        />
      </div>
    </GameFrameProvider>
  );
}
