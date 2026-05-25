"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthTopBar } from "@/app/_components/AuthTopBar";
import { InventoryPanel } from "@/app/_components/InventoryPanel";
import { WorkshopsPanel } from "@/app/_components/WorkshopsPanel";
import { MinionManagementPanel } from "@/app/_components/MinionManagementPanel";
import { RoyalPanel } from "@/app/_components/RoyalPanel";
import { BlackMarketPanel } from "@/app/_components/BlackMarketPanel";
import { ChatPanel } from "@/app/_components/ChatPanel";
import { CommanderProfilePanel } from "@/app/_components/CommanderProfilePanel";
import { HomeGoldHeader } from "@/app/_components/HomeGoldHeader";
import { HomeSettingsButton } from "@/app/_components/HomeSettingsButton";
import { SettingsPanel } from "@/app/_components/SettingsPanel";
import { TutorialPanel, notifyTutorialRefresh } from "@/app/_components/TutorialPanel";
import { GameCard, GamePanel, type GameAccent } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelLoading } from "@/app/_components/panelFeedback";
import {
  playerMatchesProcessWorkshop,
  SPECIALIST_LABEL,
  type SpecialistProfessionSlug,
} from "@/shared/specialistProfession";
import { googleAuthErrorMessage } from "@/shared/googleAuthErrors";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { apiGetJson, apiPostJson, notifySessionChanged } from "@/shared/sessionClient";
import { useSessionUser } from "@/app/_components/SessionProvider";

type MeState = {
  ok: true;
  username?: string | null;
  wallet: { goldAvailable: number; goldLocked: number };
  inventory: Array<{ itemId: string; name: string; category: string; quantity: number }>;
  myListings?: Array<unknown>;
  weaponInstances?: Array<unknown>;

  specialistProfession?: string | null;
};

type MinionsList = { ok: true; minions: Array<{ id: string }> };
type WorkshopsList = {
  ok: true;
  workshops: Array<{ id: string; name: string; minionCount: number; kind?: string }>;
};
type RunState = {
  ok: true;
  active: boolean;
  dungeon?: { name: string };
  combat?: { partyPower: number; clearChance: number };
};


async function getJson<T>(url: string): Promise<T> {
  return apiGetJson<T>(url);
}

function fmtInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return Math.floor(x).toLocaleString();
}

function MenuGlyph(props: { label: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden className="opacity-90">
      <text x="12" y="16" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">
        {props.label}
      </text>
    </svg>
  );
}

function SummaryCard(props: {
  title: string;
  subtitle: string;
  metric?: string;
  accent?: GameAccent;
  glyph?: string;
  onClick: () => void;
}) {
  return (
    <GameCard
      title={props.title}
      subtitle={props.subtitle}
      metric={props.metric}
      accent={props.accent}
      icon={props.glyph ? <MenuGlyph label={props.glyph} /> : undefined}
      onClick={props.onClick}
    />
  );
}

type DetailModalTone = "blackmarket" | "royal" | "workshop";

function DetailModal(props: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  tone?: DetailModalTone;
}) {
  useEscapeClose(props.open, props.onClose);
  if (!props.open) return null;
  const tone = props.tone;
  const isFullBleed = tone != null;
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="닫기"
        onClick={props.onClose}
        className={
          tone === "blackmarket"
            ? "absolute inset-0 bg-black/70"
            : tone === "workshop"
              ? "absolute inset-0 bg-black/50"
              : "absolute inset-0 bg-black/40"
        }
      />
      <div
        className={
          tone === "blackmarket"
            ? "absolute inset-x-0 bottom-0 mx-auto flex h-[100dvh] w-full max-w-5xl flex-col rounded-t-3xl border border-violet-950/50 bg-zinc-950 text-zinc-100 shadow-2xl shadow-black/50 md:inset-0 md:m-auto md:h-[85vh] md:rounded-3xl"
            : tone === "royal"
              ? "absolute inset-x-0 bottom-0 mx-auto flex h-[100dvh] w-full max-w-5xl flex-col rounded-t-3xl border border-amber-200/90 bg-gradient-to-b from-amber-50 via-white to-amber-50/80 text-amber-950 shadow-2xl shadow-amber-900/10 md:inset-0 md:m-auto md:h-[85vh] md:rounded-3xl"
              : tone === "workshop"
                ? "absolute inset-0 flex h-[100dvh] w-full flex-col border-0 bg-[var(--game-bg,#0c0f16)] shadow-none"
                : "game-modal absolute inset-x-0 bottom-0 mx-auto w-full max-w-5xl rounded-t-3xl md:inset-0 md:m-auto md:h-[85vh] md:rounded-3xl"
        }
      >
        <div
          className={
            tone === "blackmarket"
              ? "flex shrink-0 items-center justify-between gap-3 border-b border-violet-950/40 bg-zinc-950/95 px-5 py-4 md:rounded-t-3xl"
              : tone === "royal"
                ? "flex shrink-0 items-center justify-between gap-3 border-b border-amber-200/80 bg-white/95 px-5 py-4 md:rounded-t-3xl"
                : tone === "workshop"
                  ? "game-modal-header flex shrink-0 items-center justify-between gap-3 border-b border-[var(--game-border)] px-4 py-3 sm:px-5 sm:py-4"
                  : "game-modal-header flex items-center justify-between gap-3 px-5 py-4 md:rounded-t-3xl"
          }
        >
          <div
            className={`text-sm font-semibold ${
              tone === "blackmarket" ? "text-zinc-100" : tone === "royal" ? "text-amber-950" : "text-[var(--game-text)]"
            }`}
          >
            {props.title}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className={
              tone === "blackmarket"
                ? "h-9 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-zinc-100 hover:bg-zinc-800"
                : tone === "royal"
                  ? "h-9 rounded-xl border border-amber-200 bg-white px-3 text-xs font-semibold text-amber-950 hover:bg-amber-50"
                  : "game-btn game-btn-ghost h-9 px-3"
            }
          >
            닫기
          </button>
        </div>
        <div
          className={
            isFullBleed
              ? "min-h-0 flex-1 overflow-auto"
              : "h-[calc(100vh-90px)] overflow-auto p-5 md:h-[calc(85vh-68px)]"
          }
        >
          {props.children}
        </div>
      </div>
    </div>
  );
}

type PanelKey =
  | "inventory"
  | "gather"
  | "specialist"
  | "minions"
  | "royal"
  | "blackmarket";

const HOME_PANEL_STORAGE_KEY = "merxatus_home_panel_v1";
const PANEL_KEYS: PanelKey[] = ["inventory", "gather", "specialist", "minions", "royal", "blackmarket"];

function parseStoredPanel(raw: string | null): PanelKey | null {
  if (!raw) return null;
  return PANEL_KEYS.includes(raw as PanelKey) ? (raw as PanelKey) : null;
}

function writeStoredPanel(key: PanelKey | null) {
  try {
    if (key) sessionStorage.setItem(HOME_PANEL_STORAGE_KEY, key);
    else sessionStorage.removeItem(HOME_PANEL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function HomeDashboard() {
  const router = useRouter();
  const { user: sessionUser, refresh: refreshSession } = useSessionUser();
  const [active, setActive] = useState<PanelKey | null>(null);
  const lastSummaryRefreshRef = useRef(0);
  const [error, setError] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [me, setMe] = useState<MeState | null>(null);
  const [minions, setMinions] = useState<MinionsList | null>(null);
  const [workshops, setWorkshops] = useState<WorkshopsList | null>(null);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const openPanel = useCallback((key: PanelKey) => {
    writeStoredPanel(key);
    setActive(key);
  }, []);

  async function refreshSummary() {
    setError(null);
    try {
      const loggedIn = await refreshSession();
      if (!loggedIn) {
        setMe(null);
        setMinions(null);
        setWorkshops(null);
        setRunState(null);
        return;
      }
      const [meState, minionList, wsList, rs] = await Promise.allSettled([
        getJson<MeState>("/api/me/state"),
        getJson<MinionsList>("/api/minions/list"),
        getJson<WorkshopsList>("/api/workshops/list"),
        getJson<RunState>("/api/dungeons/run/state"),
      ]);
      if (meState.status === "fulfilled") setMe(meState.value);
      else if (!loggedIn) setMe(null);
      if (minionList.status === "fulfilled") setMinions(minionList.value);
      if (wsList.status === "fulfilled") setWorkshops(wsList.value);
      if (rs.status === "fulfilled") setRunState(rs.value);
    } catch (e) {
      setError(e);
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const panel = params.get("panel");
    if (panel === "inventory") openPanel("inventory");
    else if (panel === "market") router.replace("/market");
    else if (panel === "dungeons") router.replace("/dungeon");
    else {
      try {
        const stored = parseStoredPanel(sessionStorage.getItem(HOME_PANEL_STORAGE_KEY));
        if (stored) setActive(stored);
      } catch {
        /* ignore */
      }
    }

    const authError = params.get("auth_error");
    if (authError) {
      setError(googleAuthErrorMessage(authError));
      params.delete("auth_error");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
    }
  }, [router, openPanel]);

  useEffect(() => {
    function onChanged() {
      const now = Date.now();
      if (now - lastSummaryRefreshRef.current < 4000) return;
      lastSummaryRefreshRef.current = now;
      void refreshSummary();
    }
    window.addEventListener("auth_session_changed", onChanged);
    window.addEventListener("focus", onChanged);
    window.addEventListener("pageshow", onChanged);
    lastSummaryRefreshRef.current = Date.now();
    void refreshSummary();
    return () => {
      window.removeEventListener("auth_session_changed", onChanged);
      window.removeEventListener("focus", onChanged);
      window.removeEventListener("pageshow", onChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser?.id]);

  const gold = me?.wallet?.goldAvailable ?? null;
  const invQtySum = useMemo(() => {
    if (!me?.inventory) return null;
    return me.inventory.reduce((a, b) => a + Math.max(0, Math.floor(b.quantity ?? 0)), 0);
  }, [me?.inventory]);
  const invKinds = useMemo(() => {
    if (!me?.inventory) return null;
    return me.inventory.reduce((acc, r) => acc + (Math.max(0, Math.floor(r.quantity ?? 0)) > 0 ? 1 : 0), 0);
  }, [me?.inventory]);
  const myListingsCount = (me?.myListings?.length ?? null) as number | null;
  const weaponInstanceCount = (me?.weaponInstances?.length ?? null) as number | null;
  const minionCount = minions?.minions?.length ?? null;

  const gatherWorkshopRows = useMemo(
    () => (workshops?.workshops ?? []).filter((w) => (w.kind ?? "GATHER") === "GATHER"),
    [workshops?.workshops],
  );

  const gatherMinionsPlaced = useMemo(() => {
    return gatherWorkshopRows.reduce((a, w) => a + Math.max(0, Math.floor(w.minionCount ?? 0)), 0);
  }, [gatherWorkshopRows]);

  const specialistWorkshopCount = useMemo(() => {
    const prof = me?.specialistProfession ?? null;
    if (!prof) return null;
    return (workshops?.workshops ?? []).filter(
      (w) => w.kind === "PROCESS" && playerMatchesProcessWorkshop(w.name, prof),
    ).length;
  }, [workshops?.workshops, me?.specialistProfession]);

  const dungeonStatus = runState?.active ? `진행중: ${runState.dungeon?.name ?? "던전"}` : "대기";
  const dungeonMetric = useMemo(() => {
    if (!runState) return "—";
    if (!runState.active) return "대기";
    const pp = runState.combat?.partyPower;
    const wr = runState.combat?.clearChance;
    const wrPct = typeof wr === "number" && Number.isFinite(wr) ? `${Math.round(wr * 100)}%` : "—";
    return pp != null ? `${fmtInt(pp)} · ${wrPct}` : `진행중`;
  }, [runState]);

  const specialistProfession = me?.specialistProfession ?? null;

  useEscapeClose(chatOpen, () => setChatOpen(false));
  useEscapeClose(settingsOpen, () => setSettingsOpen(false));

  async function handleLogout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await apiPostJson("/api/auth/logout", {});
      setMe(null);
      notifySessionChanged();
      setSettingsOpen(false);
    } finally {
      setLogoutBusy(false);
    }
  }

  function closePanel() {
    writeStoredPanel(null);
    setActive(null);
    try {
      if (new URLSearchParams(window.location.search).has("panel")) {
        window.history.replaceState(null, "", "/");
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="game-shell">
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:py-10">
        <div className="auth-corner-anchor flex flex-col gap-3">
          <div className="home-top-actions">
            <HomeSettingsButton active={settingsOpen} onClick={() => setSettingsOpen((v) => !v)} />
            <AuthTopBar />
          </div>
          <HomeGoldHeader gold={gold} />
          <header className="home-brand-header">
            <p className="game-wordmark">Merxatus</p>
          </header>
          <CommanderProfilePanel
            username={sessionUser?.username ?? me?.username ?? null}
            specialistProfession={specialistProfession}
          />

          <TutorialPanel
            loggedIn={!!sessionUser}
            onOpenGather={() => openPanel("gather")}
            onSpecialistChosen={() => {
              void refreshSummary();
              notifyTutorialRefresh();
              openPanel("specialist");
            }}
          />

          <div className="min-w-0 space-y-6">
            {error ? <GamePanelError error={error} /> : null}

            {summaryLoading ? (
              <GamePanelLoading label="게임 정보를 불러오는 중…" />
            ) : (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            glyph="◆"
            accent="gold"
            title="인벤토리"
            subtitle="재료·고용권·무기 목록 확인"
            metric={
              invKinds != null && invQtySum != null
                ? `${fmtInt(invKinds)}종 · ${fmtInt(invQtySum)}개${weaponInstanceCount != null ? ` · 무기 ${fmtInt(weaponInstanceCount)}` : ""}`
                : "—"
            }
            onClick={() => openPanel("inventory")}
          />
          <SummaryCard
            glyph="＋"
            accent="amber"
            title="강화소"
            subtitle="무기 강화 · 재료 소모"
            metric={
              weaponInstanceCount != null
                ? `무기 ${fmtInt(weaponInstanceCount)}개`
                : "—"
            }
            onClick={() => router.push("/enhance")}
          />
          <SummaryCard
            glyph="⛏"
            accent="emerald"
            title="수집"
            subtitle="광산·낚시터·탐험·고고학 수집·미니언"
            metric={
              workshops?.workshops
                ? `${fmtInt(gatherWorkshopRows.length)}개 · 미니언 ${fmtInt(gatherMinionsPlaced)}`
                : "—"
            }
            onClick={() => openPanel("gather")}
          />
          <SummaryCard
            glyph="⚒"
            accent="amber"
            title="전문 작업장"
            subtitle={
              specialistProfession
                ? `${SPECIALIST_LABEL[specialistProfession as SpecialistProfessionSlug] ?? specialistProfession} 전용 가공`
                : "직업 선택 시 작업장 자동 개방"
            }
            metric={
              specialistProfession != null && specialistWorkshopCount != null
                ? `${fmtInt(specialistWorkshopCount)}개`
                : "—"
            }
            onClick={() => openPanel("specialist")}
          />
          <SummaryCard
            glyph="⚔"
            accent="rose"
            title="던전"
            subtitle="파티 전투력/승률/수령"
            metric={runState?.active ? `${runState.dungeon?.name ?? "던전"} · ${dungeonMetric}` : dungeonStatus}
            onClick={() => router.push("/dungeon")}
          />
          <SummaryCard
            glyph="●"
            accent="indigo"
            title="미니언"
            subtitle="무기 장착 · 배치"
            metric={minionCount != null ? `${fmtInt(minionCount)}명` : "—"}
            onClick={() => openPanel("minions")}
          />
          <SummaryCard
            glyph="¤"
            accent="sky"
            title="거래소"
            subtitle="구매 · 판매 · 내 매물"
            metric={
              invQtySum != null
                ? `${myListingsCount != null ? `${fmtInt(myListingsCount)}건 · ` : ""}${invKinds != null ? `${fmtInt(invKinds)}종` : "—"} · ${fmtInt(invQtySum)}개`
                : "—"
            }
            onClick={() => router.push("/market")}
          />
          <SummaryCard
            glyph="♛"
            accent="gold"
            title="황실"
            subtitle="고정가 거래 · 명예/칭호"
            metric="열기"
            onClick={() => openPanel("royal")}
          />
          <SummaryCard
            glyph="☾"
            accent="violet"
            title="지하도시(암시장)"
            subtitle="변동 시세 · 악명/해금"
            metric="열기"
            onClick={() => openPanel("blackmarket")}
          />
            </section>
            )}
          </div>
        </div>

        {/* 채팅: 오른쪽에서 올라오는 드로어 */}
        <div
          aria-hidden={!chatOpen}
          className={`chat-drawer fixed z-40 flex flex-col overflow-hidden rounded-2xl shadow-2xl ${
            chatOpen ? "chat-drawer-open pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <ChatPanel layout="drawer" onMinimize={() => setChatOpen(false)} />
          </div>
        </div>

        {/* 채팅 열기 / 축소 */}
        <button
          type="button"
          aria-expanded={chatOpen}
          aria-label={chatOpen ? "채팅 축소" : "채팅 열기"}
          onClick={() => setChatOpen((open) => !open)}
          className="game-chat-fab fixed bottom-6 right-6 z-50 flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold transition"
        >
          {chatOpen ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-zinc-600">
                <path
                  fill="currentColor"
                  d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"
                />
              </svg>
              축소
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-zinc-600">
                <path
                  fill="currentColor"
                  d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"
                />
              </svg>
              채팅
            </>
          )}
        </button>

        <DetailModal
          title={
            active === "inventory"
                ? "인벤토리"
                : active === "gather"
                ? "수집"
                : active === "specialist"
                  ? "전문 작업장"
                  : active === "minions"
                      ? "미니언 관리"
                      : active === "royal"
                            ? "황실"
                            : active === "blackmarket"
                              ? "지하도시(암시장)"
                              : "상세"
          }
          open={active != null}
          onClose={closePanel}
          tone={
            active === "blackmarket"
              ? "blackmarket"
              : active === "royal"
                ? "royal"
                : active === "gather" || active === "specialist"
                  ? "workshop"
                  : undefined
          }
        >
          {active === "inventory" ? (
            <InventoryPanel onOpenMinions={() => openPanel("minions")} />
          ) : active === "gather" ? (
            <WorkshopsPanel variant="gather" />
          ) : active === "specialist" ? (
            <WorkshopsPanel variant="specialist" />
          ) : active === "minions" ? (
            <MinionManagementPanel />
          ) : active === "royal" ? (
            <RoyalPanel />
          ) : active === "blackmarket" ? (
            <BlackMarketPanel />
          ) : null}
        </DetailModal>

        <SettingsPanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          loggedIn={!!sessionUser}
          username={sessionUser?.username ?? me?.username ?? null}
          userId={sessionUser?.id ?? null}
          logoutBusy={logoutBusy}
          onLogout={handleLogout}
          onRefresh={refreshSummary}
          onUsernameChanged={(username) => {
            setMe((prev) => (prev ? { ...prev, username } : prev));
          }}
        />
      </main>
    </div>
  );
}

