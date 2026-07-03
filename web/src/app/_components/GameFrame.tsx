"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AuthTopBar } from "@/app/_components/AuthTopBar";
import { LoginWelcomePanel } from "@/app/_components/LoginWelcomePanel";
import { ChatPanel } from "@/app/_components/ChatPanel";
import { GameFrameKeepAlive } from "@/app/_components/GameFrameKeepAlive";
import { GameFrameMobileDock } from "@/app/_components/GameFrameMobileDock";
import { GameFrameProvider } from "@/app/_components/GameFrameContext";
import { HomeGoldHeader } from "@/app/_components/HomeGoldHeader";
import { HomeSettingsButton } from "@/app/_components/HomeSettingsButton";
import { HomeAnnouncementsButton } from "@/app/_components/HomeAnnouncementsButton";
import { AnnouncementsModal } from "@/app/_components/AnnouncementsModal";
import { SettingsPanel } from "@/app/_components/SettingsPanel";
import { UsernameSetupModal } from "@/app/_components/UsernameSetupModal";
import { TutorialPanel } from "@/app/_components/TutorialPanel";
import { GameFrameAnnouncements } from "@/app/_components/GameFrameAnnouncements";
import { GamePanelError, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";
import {
  DEFAULT_GAME_TAB,
  isVisibleGameTab,
  readStoredGameTab,
  resolveGameTab,
  writeStoredGameTab,
  type GameTabKey,
  type MinionPanelTab,
  visibleGameTabs,
} from "@/shared/gameNav";
import { GAME_FRAME_PATCH_EVENT, notifyGameFramePatch, type GameFramePatchDetail } from "@/shared/gameFramePatch";
import { prefetchCombatRoster } from "@/shared/combatRosterClient";
import { prefetchGamePanel } from "@/shared/panelTabPrefetch";
import { googleAuthErrorMessage } from "@/shared/googleAuthErrors";
import { API_CACHE_TTL } from "@/shared/apiCache";
import type { DungeonRunState, MeSummary } from "@/shared/meSummary";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { apiGetJsonCachedSwr, apiPostJson, notifySessionChanged, BOOTSTRAP_FETCH_TIMEOUT_MS } from "@/shared/sessionClient";
import { readGameTabFromWindow, syncGameTabUrl } from "@/shared/gameTabUrl";
import { notifyShopSubTab, type ShopSubTab } from "@/shared/shopSubTab";
import { refreshGameDataScopes } from "@/shared/gameDataRefresh";
import { ANNOUNCEMENTS_READ_CHANGED_EVENT, hasUnreadAnnouncements } from "@/shared/announcements";
import { selectGoldAvailable, useWalletStore } from "@/shared/stores/walletStore";
import { GameBootSplash, type GameBootSplashPhase } from "@/app/_components/GameBootSplash";

function fmtInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return Math.floor(x).toLocaleString();
}

function normalizeTab(tab: GameTabKey): GameTabKey {
  return isVisibleGameTab(tab) ? tab : DEFAULT_GAME_TAB;
}

function GameFrameNav(props: {
  activeTab: GameTabKey;
  onNavigate: (tab: GameTabKey) => void;
  userId: string | null;
  className?: string;
}) {
  const tabs = visibleGameTabs();
  return (
    <nav className={`game-frame__nav game-frame__nav--header ${props.className ?? ""}`.trim()} aria-label="활동 메뉴">
      {tabs.map((tab) => {
        const active = props.activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            className={`game-frame__nav-btn ${active ? "game-frame__nav-btn--active" : ""}`.trim()}
            aria-current={active ? "page" : undefined}
            onClick={() => props.onNavigate(tab.key)}
            onMouseEnter={() => prefetchGamePanel(tab.key, props.userId)}
            onFocus={() => prefetchGamePanel(tab.key, props.userId)}
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
  className?: string;
}) {
  const { summary, summaryLoading, runState } = props;
  const placeholder = summaryLoading ? "…" : "—";

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
    <footer className={`game-frame__status ${props.className ?? ""}`.trim()} aria-label="진행 상태">
      <span className="game-frame__status-chip">{dungeon}</span>
      <span className="game-frame__status-chip">{market}</span>
    </footer>
  );
}

export function GameFrame() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user: sessionUser, loading: sessionLoading } = useSessionUser();
  const needUsername = !!sessionUser && sessionUser.usernameChosen === false;

  const urlTab = useMemo(
    () => normalizeTab(resolveGameTab(pathname, searchParams)),
    [pathname, searchParams],
  );

  const [activeTab, setActiveTab] = useState<GameTabKey>(() => urlTab);
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<GameTabKey>>(() => new Set([urlTab]));
  const tabInitializedRef = useRef(false);
  const [minionPanelTab, setMinionPanelTab] = useState<MinionPanelTab>("dungeon");
  const lastSummaryRefreshRef = useRef(0);
  const patchInflightRef = useRef(false);
  const summaryLoadPromiseRef = useRef<Promise<void> | null>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const [error, setError] = useState<unknown>(null);
  const [summaryError, setSummaryError] = useState<unknown>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [runState, setRunState] = useState<DungeonRunState | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [announcementsUnread, setAnnouncementsUnread] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [bootMinDone, setBootMinDone] = useState(false);
  const [splashFading, setSplashFading] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);

  const gold = useWalletStore(selectGoldAvailable);

  const bootDataReady = !sessionLoading && (!sessionUser || summary != null || !summaryLoading);
  const bootSplashPhase: GameBootSplashPhase = sessionLoading
    ? "session"
    : sessionUser && summary == null && summaryLoading
      ? "world"
      : "default";

  useEffect(() => {
    function syncUnread() {
      setAnnouncementsUnread(hasUnreadAnnouncements());
    }
    syncUnread();
    window.addEventListener(ANNOUNCEMENTS_READ_CHANGED_EVENT, syncUnread);
    return () => window.removeEventListener(ANNOUNCEMENTS_READ_CHANGED_EVENT, syncUnread);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setBootMinDone(true), 650);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!bootDataReady || !bootMinDone || !splashMounted) return;
    setSplashFading(true);
    const t = window.setTimeout(() => setSplashMounted(false), 480);
    return () => window.clearTimeout(t);
  }, [bootDataReady, bootMinDone, splashMounted]);

  const markVisited = useCallback((tab: GameTabKey) => {
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  const navigateTab = useCallback((tab: GameTabKey, opts?: { minionTab?: MinionPanelTab; shopSub?: ShopSubTab }) => {
    const next = normalizeTab(tab);
    if (opts?.minionTab) setMinionPanelTab(opts.minionTab);
    if (opts?.shopSub) notifyShopSubTab(opts.shopSub);
    setMobileMoreOpen(false);
    setActiveTab(next);
    markVisited(next);
    writeStoredGameTab(next);
    syncGameTabUrl(next);
  }, [markVisited]);

  useEffect(() => {
    if (tabInitializedRef.current) return;
    tabInitializedRef.current = true;
    let next = urlTab;
    if (pathname === "/" && !searchParams.get("tab") && !searchParams.get("panel")) {
      const stored = readStoredGameTab();
      if (stored) next = normalizeTab(stored);
    }
    setActiveTab(next);
    markVisited(next);
    writeStoredGameTab(next);
    syncGameTabUrl(next, { replace: true });
  }, [urlTab, pathname, searchParams, markVisited]);

  useEffect(() => {
    const onPopState = () => {
      const tab = normalizeTab(readGameTabFromWindow());
      setActiveTab(tab);
      markVisited(tab);
      writeStoredGameTab(tab);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [markVisited]);

  const applySummary = useCallback((next: MeSummary) => {
    setSummary(next);
    setSummaryError(null);
    useWalletStore.getState().setWallet({
      goldAvailable: next.wallet.goldAvailable,
      goldLocked: next.wallet.goldLocked,
      todayNetGold: next.todayNetGold,
    });
  }, []);

  const refreshSummary = useCallback(
    async (opts?: { force?: boolean; silent?: boolean }) => {
      if (summaryLoadPromiseRef.current && !opts?.force) {
        return summaryLoadPromiseRef.current;
      }

      const work = (async () => {
        setError(null);
        setSummaryError(null);
        if (!sessionUser) {
          setSummary(null);
          setRunState(null);
          useWalletStore.getState().setWallet(null);
          setSummaryLoading(false);
          return;
        }

        const blockSummary = !opts?.silent && (opts?.force || summary == null);
        if (blockSummary) setSummaryLoading(true);

        try {
          const summaryRes = await apiGetJsonCachedSwr<MeSummary>("/api/me/summary", {
            ttlMs: API_CACHE_TTL.summary,
            timeoutMs: BOOTSTRAP_FETCH_TIMEOUT_MS,
            force: opts?.force,
          });
          if (!summaryRes?.ok) throw new Error("BOOTSTRAP_INCOMPLETE");
          applySummary(summaryRes);
          setSummaryLoading(false);

          if (summaryRes.dungeon?.active && activeTabRef.current !== "dungeon") {
            void apiGetJsonCachedSwr<DungeonRunState>("/api/dungeons/run/state?lite=1", {
              ttlMs: API_CACHE_TTL.runState,
              force: opts?.force,
              onRevalidate: (rs) => {
                if (rs?.active) setRunState(rs);
                else setRunState(null);
              },
            })
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
          setSummary(null);
          setSummaryLoading(false);
        }
      })();

      summaryLoadPromiseRef.current = work;
      try {
        await work;
      } finally {
        if (summaryLoadPromiseRef.current === work) {
          summaryLoadPromiseRef.current = null;
        }
      }
    },
    [sessionUser, applySummary, summary],
  );

  const refreshSummaryRef = useRef(refreshSummary);
  refreshSummaryRef.current = refreshSummary;

  const handleDataPatch = useCallback(
    async (detail: GameFramePatchDetail) => {
      if (!sessionUser || patchInflightRef.current) return;
      patchInflightRef.current = true;
      try {
        await refreshGameDataScopes(detail.scopes, {
          force: detail.scopes.includes("all"),
          onBootstrap: (data) => {
            setSummary(data.summary);
          },
        });
      } finally {
        patchInflightRef.current = false;
      }
    },
    [sessionUser],
  );

  useEffect(() => {
    if (!sessionUser?.id || summary == null || summaryLoading) return;
    const t = window.setTimeout(() => {
      prefetchCombatRoster(sessionUser.id);
      prefetchGamePanel(activeTab, sessionUser.id);
    }, 400);
    return () => window.clearTimeout(t);
  }, [sessionUser?.id, activeTab, summary, summaryLoading]);

  useEffect(() => {
    const authError = searchParams.get("auth_error");
    if (authError) {
      setError(googleAuthErrorMessage(authError));
      const params = new URLSearchParams(searchParams.toString());
      params.delete("auth_error");
      const qs = params.toString();
      const base = pathname === "/" ? "/" : pathname;
      window.history.replaceState(window.history.state, "", qs ? `${base}?${qs}` : base);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!sessionUser?.id) {
      setSummary(null);
      setSummaryLoading(false);
      return;
    }
    void refreshSummaryRef.current();
  }, [sessionUser?.id]);

  useEffect(() => {
    function onChanged() {
      const now = Date.now();
      if (now - lastSummaryRefreshRef.current < 8000) return;
      lastSummaryRefreshRef.current = now;
      void refreshSummaryRef.current({ silent: true });
    }
    function onPatch(event: Event) {
      const detail = (event as CustomEvent<GameFramePatchDetail>).detail;
      if (!detail) return;
      void handleDataPatch(detail);
    }
    window.addEventListener("auth_session_changed", onChanged);
    window.addEventListener("focus", onChanged);
    window.addEventListener("pageshow", onChanged);
    window.addEventListener(GAME_FRAME_PATCH_EVENT, onPatch);
    return () => {
      window.removeEventListener("auth_session_changed", onChanged);
      window.removeEventListener("focus", onChanged);
      window.removeEventListener("pageshow", onChanged);
      window.removeEventListener(GAME_FRAME_PATCH_EVENT, onPatch);
    };
  }, [handleDataPatch]);

  useEscapeClose(chatOpen, () => setChatOpen(false));
  useEscapeClose(settingsOpen, () => setSettingsOpen(false));

  async function handleLogout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await apiPostJson("/api/auth/logout", {});
      setSummary(null);
      useWalletStore.getState().setWallet(null);
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
      runState,
      refreshSummary,
      gold,
      sessionUser,
      sessionLoading,
      summaryError,
    ],
  );

  const showSessionGate = sessionLoading || !sessionUser;

  return (
    <GameFrameProvider value={frameContext}>
      <div className="game-shell game-frame" style={{ backgroundColor: "#080a0f", color: "#e8ebf2" }}>
        <UsernameSetupModal open={needUsername} currentUsername={sessionUser?.username ?? summary?.username ?? null} />
        <main className="game-frame__main mx-auto w-full max-w-[1800px] px-2 py-1.5 sm:px-2.5">
          <header className="game-frame__hud">
            <div className="game-frame__hud-row">
              <HomeGoldHeader
                todayNetGold={summary?.todayNetGold}
                activeListings={summary?.market.activeListingCount}
                username={sessionUser?.username ?? summary?.username ?? null}
              />
              <div className="game-frame__hud-tools">
                <HomeAnnouncementsButton
                  unread={announcementsUnread}
                  active={announcementsOpen}
                  onClick={() => setAnnouncementsOpen(true)}
                />
                <HomeSettingsButton active={settingsOpen} onClick={() => setSettingsOpen((v) => !v)} />
                <AuthTopBar />
              </div>
            </div>

            <GameFrameNav activeTab={activeTab} onNavigate={navigateTab} userId={sessionUser?.id ?? null} />

            <GameFrameStatusBar
              summary={summary}
              summaryLoading={summaryLoading}
              runState={runState}
              className="game-frame__status--hud"
            />
          </header>

          {sessionUser ? <GameFrameAnnouncements onOpen={() => setAnnouncementsOpen(true)} /> : null}

          <TutorialPanel compact loggedIn={!!sessionUser} onNavigateTab={navigateTab} />

          {error ? <GamePanelError error={error} className="mt-1" /> : null}

          <section className="game-frame__section" aria-label={activeTab}>
            {showSessionGate ? (
              <div className="game-frame__content game-frame__content--enter game-frame__content--fit">
                {sessionLoading ? (
                  <GamePanelLoading label="세션 확인 중…" />
                ) : (
                  <LoginWelcomePanel />
                )}
              </div>
            ) : (
              <GameFrameKeepAlive
                activeTab={activeTab}
                visitedTabs={visitedTabs}
                onOpenMinions={() => navigateTab("profile")}
                onNavigate={navigateTab}
              />
            )}
          </section>

          <GameFrameMobileDock
            activeTab={activeTab}
            onNavigate={navigateTab}
            userId={sessionUser?.id ?? null}
            moreOpen={mobileMoreOpen}
            onMoreOpenChange={setMobileMoreOpen}
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

        <AnnouncementsModal open={announcementsOpen} onClose={() => setAnnouncementsOpen(false)} />

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
        />
      </div>

      {splashMounted ? <GameBootSplash phase={bootSplashPhase} fading={splashFading} /> : null}
    </GameFrameProvider>
  );
}
