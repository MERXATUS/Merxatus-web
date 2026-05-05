"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPanel } from "@/app/_components/AuthPanel";
import { WorkshopsPanel } from "@/app/_components/WorkshopsPanel";
import { DungeonsPanel } from "@/app/_components/DungeonsPanel";
import { MinionManagementPanel } from "@/app/_components/MinionManagementPanel";
import { WealthTrendPanel } from "@/app/_components/WealthTrendPanel";
import { MarketBoard } from "@/app/_components/MarketBoard";
import { RoyalPanel } from "@/app/_components/RoyalPanel";
import { BlackMarketPanel } from "@/app/_components/BlackMarketPanel";
import { ChatPanel } from "@/app/_components/ChatPanel";

type MeState = {
  ok: true;
  wallet: { goldAvailable: number; goldLocked: number };
  inventory: Array<{ itemId: string; name: string; category: string; quantity: number }>;
  myListings?: Array<unknown>;
  weaponInstances?: Array<unknown>;
};

type MinionsList = { ok: true; minions: Array<{ id: string }> };
type WorkshopsList = { ok: true; workshops: Array<{ id: string; name: string; minionCount: number }> };
type RunState = {
  ok: true;
  active: boolean;
  dungeon?: { name: string };
  combat?: { partyPower: number; winRate: number };
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

function fmtInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return Math.floor(x).toLocaleString();
}

function SummaryCard(props: {
  title: string;
  subtitle: string;
  metric?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="group rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm transition hover:border-zinc-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">{props.title}</div>
          <div className="mt-1 text-sm text-zinc-600">{props.subtitle}</div>
        </div>
        {props.metric ? (
          <div className="rounded-xl bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-900">{props.metric}</div>
        ) : null}
      </div>
      <div className="mt-4 text-xs font-semibold text-zinc-500 group-hover:text-zinc-700">클릭해서 열기</div>
    </button>
  );
}

function DetailModal(props: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="닫기"
        onClick={props.onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-5xl rounded-t-3xl bg-zinc-50 shadow-2xl md:inset-0 md:m-auto md:h-[85vh] md:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-4 md:rounded-t-3xl">
          <div className="text-sm font-semibold">{props.title}</div>
          <button
            type="button"
            onClick={props.onClose}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            닫기
          </button>
        </div>
        <div className="h-[calc(100vh-90px)] overflow-auto p-5 md:h-[calc(85vh-68px)]">{props.children}</div>
      </div>
    </div>
  );
}

type PanelKey = "auth" | "workshops" | "dungeons" | "minions" | "pnl" | "market" | "royal" | "blackmarket";

export function HomeDashboard() {
  const router = useRouter();
  const [active, setActive] = useState<PanelKey | null>(null);
  const [error, setError] = useState<any>(null);
  const [me, setMe] = useState<MeState | null>(null);
  const [minions, setMinions] = useState<MinionsList | null>(null);
  const [workshops, setWorkshops] = useState<WorkshopsList | null>(null);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  // hydration 안정성을 위해: 초기 렌더(서버/클라)는 항상 ""로 통일하고,
  // 마운트 이후에만 localStorage 값을 반영한다.
  const [userId, setUserId] = useState("");

  function readDevUserId() {
    try {
      return localStorage.getItem("dev_userId") ?? "";
    } catch {
      return "";
    }
  }

  async function refreshSummary() {
    setError(null);
    try {
      const [meState, minionList, wsList, rs] = await Promise.allSettled([
        getJson<MeState>("/api/me/state"),
        getJson<MinionsList>("/api/minions/list"),
        getJson<WorkshopsList>("/api/workshops/list"),
        getJson<RunState>("/api/dungeons/run/state"),
      ]);
      if (meState.status === "fulfilled") setMe(meState.value);
      if (minionList.status === "fulfilled") setMinions(minionList.value);
      if (wsList.status === "fulfilled") setWorkshops(wsList.value);
      if (rs.status === "fulfilled") setRunState(rs.value);
      setRefreshedAt(new Date());
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    setUserId(readDevUserId());
    function onChanged() {
      setUserId(readDevUserId());
      void refreshSummary();
    }
    window.addEventListener("dev_user_changed", onChanged);
    window.addEventListener("storage", onChanged);
    void refreshSummary();
    void getJson<{ ok: true; user: { id: string } | null }>("/api/auth/me")
      .then((r) => {
        if (r?.user?.id) {
          try {
            localStorage.setItem("dev_userId", r.user.id);
          } catch {
            /* ignore */
          }
          setUserId(r.user.id);
          void refreshSummary();
        }
      })
      .catch(() => {});
    return () => {
      window.removeEventListener("dev_user_changed", onChanged);
      window.removeEventListener("storage", onChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gold = me?.wallet?.goldAvailable ?? null;
  const goldLocked = me?.wallet?.goldLocked ?? null;
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
  const workshopCount = workshops?.workshops?.length ?? null;
  const workshopMinionsTotal = useMemo(() => {
    if (!workshops?.workshops) return null;
    return workshops.workshops.reduce((a, w) => a + Math.max(0, Math.floor(w.minionCount ?? 0)), 0);
  }, [workshops?.workshops]);
  const dungeonStatus = runState?.active ? `진행중: ${runState.dungeon?.name ?? "던전"}` : "대기";
  const dungeonMetric = useMemo(() => {
    if (!runState) return "—";
    if (!runState.active) return "대기";
    const pp = runState.combat?.partyPower;
    const wr = runState.combat?.winRate;
    const wrPct = typeof wr === "number" && Number.isFinite(wr) ? `${Math.round(wr * 100)}%` : "—";
    return pp != null ? `${fmtInt(pp)} · ${wrPct}` : `진행중`;
  }, [runState]);

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:py-10">
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
          {/* 좌: 개인 정보 (데스크톱) / 모바일에서도 상단에 동일 순서 */}
          <aside className="space-y-4 lg:sticky lg:top-4 lg:col-span-3 lg:self-start">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold text-zinc-500">내 정보</div>
              <div className="mt-3 break-all font-mono text-[11px] text-zinc-600">
                {userId ? userId : "미로그인"}
              </div>
              {refreshedAt ? (
                <div className="mt-2 text-[11px] text-zinc-400">갱신 {refreshedAt.toLocaleTimeString()}</div>
              ) : null}

              <div className="mt-4 space-y-2">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-[11px] font-semibold text-zinc-600">보유 골드</div>
                  <div className="mt-0.5 text-sm font-semibold">{gold != null ? `${fmtInt(gold)}G` : "—"}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-[11px] font-semibold text-zinc-600">잠금 골드</div>
                  <div className="mt-0.5 text-sm font-semibold">{goldLocked != null ? `${fmtInt(goldLocked)}G` : "—"}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-[11px] font-semibold text-zinc-600">인벤 요약</div>
                  <div className="mt-0.5 text-sm font-semibold">
                    {invKinds != null && invQtySum != null ? `${fmtInt(invKinds)}종 · ${fmtInt(invQtySum)}개` : "—"}
                    {weaponInstanceCount != null ? ` · 무기 ${fmtInt(weaponInstanceCount)}개` : ""}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void refreshSummary()}
                className="mt-4 h-9 w-full rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white"
              >
                새로고침
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold text-zinc-600">빠른 메뉴</div>
              <button
                type="button"
                onClick={() => setActive("auth")}
                className="mt-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 text-left text-xs font-semibold text-zinc-900 hover:bg-zinc-100"
              >
                로그인 / 계정
              </button>
            </div>
          </aside>

          {/* 중: 인벤·마을 등 선택 패널 */}
          <div className="min-w-0 space-y-6 lg:col-span-6">
            <header className="flex flex-col gap-2">
              <div className="text-sm font-semibold text-zinc-600">경제 시뮬레이션 (프로토타입)</div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">요약 대시보드</h1>
              <p className="max-w-2xl text-sm text-zinc-600 sm:text-base">
                가운데에서 메뉴를 고르고, 왼쪽은 내 상태·오른쪽은 채팅 등 부가 UI를 둘 거예요.
              </p>
            </header>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                오류: {typeof error === "string" ? error : JSON.stringify(error)}
              </div>
            ) : null}

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SummaryCard
            title="로그인/계정"
            subtitle="테스트 계정 선택/전환"
            metric={userId ? "선택됨" : "필요"}
            onClick={() => setActive("auth")}
          />
          <SummaryCard
            title="인벤토리"
            subtitle="무기 강화/판매/재료 확인"
            metric={
              invKinds != null && invQtySum != null
                ? `${fmtInt(invKinds)}종 · ${fmtInt(invQtySum)}개${weaponInstanceCount != null ? ` · 무기 ${fmtInt(weaponInstanceCount)}` : ""}`
                : "—"
            }
            onClick={() => router.push("/inventory")}
          />
          <SummaryCard
            title="마을"
            subtitle="시설 개수 · 배치 미니언"
            metric={
              workshopCount != null
                ? `${fmtInt(workshopCount)}개${workshopMinionsTotal != null ? ` · 배치 ${fmtInt(workshopMinionsTotal)}` : ""}`
                : "—"
            }
            onClick={() => setActive("workshops")}
          />
          <SummaryCard
            title="던전"
            subtitle="파티 전투력/승률/수령"
            metric={runState?.active ? `${runState.dungeon?.name ?? "던전"} · ${dungeonMetric}` : dungeonStatus}
            onClick={() => setActive("dungeons")}
          />
          <SummaryCard
            title="미니언"
            subtitle="무기 장착/무기 강화/레벨업"
            metric={minionCount != null ? `${fmtInt(minionCount)}명` : "—"}
            onClick={() => setActive("minions")}
          />
          <SummaryCard
            title="시장(아이템)"
            subtitle="내 리스팅 · 인벤(종류/수량)"
            metric={
              invQtySum != null
                ? `${myListingsCount != null ? `${fmtInt(myListingsCount)}건 · ` : ""}${invKinds != null ? `${fmtInt(invKinds)}종` : "—"} · ${fmtInt(invQtySum)}개`
                : "—"
            }
            onClick={() => setActive("market")}
          />
          <SummaryCard
            title="황실"
            subtitle="고정가 거래 · 명예/칭호"
            metric="열기"
            onClick={() => setActive("royal")}
          />
          <SummaryCard
            title="지하도시(암시장)"
            subtitle="변동 시세 · 악명/해금"
            metric="열기"
            onClick={() => setActive("blackmarket")}
          />
          <SummaryCard
            title="손익(PnL)"
            subtitle="일자별 손익 추세"
            metric="열기"
            onClick={() => setActive("pnl")}
          />
            </section>
          </div>

          {/* 우: 채팅 등 */}
          <aside className="space-y-4 lg:sticky lg:top-4 lg:col-span-3 lg:self-start">
            <ChatPanel />
          </aside>
        </div>

        <DetailModal
          title={
            active === "auth"
              ? "로그인/계정"
                : active === "workshops"
                  ? "마을"
                  : active === "dungeons"
                    ? "던전"
                    : active === "minions"
                        ? "미니언 관리"
                        : active === "market"
                          ? "시장(아이템)"
                          : active === "pnl"
                            ? "손익(PnL)"
                : active === "royal"
                  ? "황실"
                  : active === "blackmarket"
                    ? "지하도시(암시장)"
                            : "상세"
          }
          open={active != null}
          onClose={() => setActive(null)}
        >
          {active === "auth" ? (
            <AuthPanel />
          ) : active === "workshops" ? (
            <WorkshopsPanel />
          ) : active === "dungeons" ? (
            <DungeonsPanel />
          ) : active === "minions" ? (
            <MinionManagementPanel />
          ) : active === "market" ? (
            <MarketBoard />
          ) : active === "royal" ? (
            <RoyalPanel />
          ) : active === "blackmarket" ? (
            <BlackMarketPanel />
          ) : active === "pnl" ? (
            <WealthTrendPanel />
          ) : null}
        </DetailModal>
      </main>
    </div>
  );
}

