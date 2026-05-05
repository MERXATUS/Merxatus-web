"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultItemGradeForItemId, ITEM_GRADE_LABELS } from "@/server/itemGrade";
import { RARITY_REFERENCE_GROWTH } from "@/server/itemReferenceGold";

type Json = any;

type ItemRow = { id: string; name: string; category: string; tradable: boolean; grade?: number };
type DropRow = { itemId: string; weight: number; minQty: number; maxQty: number; minTier?: number };
type WorkshopRow = { id: string; name: string; drops: DropRow[] };
type RecipeInRow = { itemId: string; quantity: number };
type RecipeOutRow = { itemId: string; weight?: number; minQty?: number; maxQty?: number };
type RecipeRow = {
  workshopName: string;
  name: string;
  inputs: RecipeInRow[];
  outputs: RecipeOutRow[];
  rewardGold?: number;
  minTier?: number;
  craftTimeSeconds?: number;
};

async function adminFetch(method: string, url: string, token: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-admin-token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) throw json;
  return json;
}

function safeJsonParse<T>(text: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "JSON_PARSE_FAILED" };
  }
}

function normalizeNumber(n: unknown, fallback = 0) {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function normalizeItemGradeForAdmin(row: ItemRow): ItemRow {
  const id = String(row?.id ?? "").trim();
  const raw = row?.grade;
  const g =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.max(1, Math.min(8, Math.floor(raw)))
      : id
        ? defaultItemGradeForItemId(id)
        : 1;
  return { ...row, grade: g };
}

function fmtInt(n: unknown) {
  const x = normalizeNumber(n, NaN);
  if (!Number.isFinite(x)) return "—";
  return Math.round(x).toLocaleString();
}

function fmtPct01(n: unknown) {
  if (n == null) return "—";
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return `${Math.round(x * 100)}%`;
}

function signalPillClass(level: string) {
  if (level === "bad") return "border-red-200 bg-red-50 text-red-900";
  if (level === "warn") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-zinc-200 bg-zinc-50 text-zinc-800";
}

function workshopDropTotalWeight(ws: WorkshopRow) {
  return ws.drops.reduce((a, d) => a + Math.max(0, d.weight || 0), 0);
}

function recipeOutputsTotalWeight(r: RecipeRow) {
  return (r.outputs ?? []).reduce((a, o) => a + Math.max(0, Number(o.weight ?? 0)), 0);
}

function isConsumeRecipe(r: RecipeRow) {
  return Math.max(0, Math.floor(Number(r.rewardGold ?? 0))) > 0;
}

export default function AdminApp() {
  const [token, setToken] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [workshopsText, setWorkshopsText] = useState("");
  const [recipesText, setRecipesText] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [workshops, setWorkshops] = useState<WorkshopRow[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Json>(null);
  const [error, setError] = useState<Json>(null);
  const [botDash, setBotDash] = useState<Json>(null);
  const [ensureBotCount, setEnsureBotCount] = useState("5");
  const [seedResult, setSeedResult] = useState<Json>(null);
  const [refStoneGold, setRefStoneGold] = useState("10");
  const [refRarityGrowth, setRefRarityGrowth] = useState(String(RARITY_REFERENCE_GROWTH));

  useEffect(() => {
    try {
      const t = localStorage.getItem("admin_token") ?? "";
      if (t) setToken(t);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (token) localStorage.setItem("admin_token", token);
    } catch {}
  }, [token]);

  useEffect(() => {
    const n = botDash?.rules?.configuredBotCount;
    if (typeof n === "number" && Number.isFinite(n)) setEnsureBotCount(String(n));
  }, [botDash]);

  const pretty = useMemo(() => {
    const payload = error ?? result;
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }, [error, result]);

  const refTable = useMemo(() => {
    const base = Math.max(1, Math.floor(Number(refStoneGold) || 10));
    const growth = Math.max(1.01, Math.min(10, Number(refRarityGrowth) || 3));
    const rows = items
      .map((it) => {
        const grade = Math.max(1, Math.min(8, Math.floor(it.grade ?? 1)));
        const price = Math.max(1, Math.floor(base * Math.pow(growth, grade - 1)));
        return {
          id: it.id,
          name: it.name,
          category: it.category,
          grade,
          gradeLabel: ITEM_GRADE_LABELS[grade - 1] ?? ITEM_GRADE_LABELS[0],
          recommendedGold: it.id === "item_stone" ? base : price,
        };
      })
      .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "ko"));
    return { base, growth, rows };
  }, [items, refStoneGold, refRarityGrowth]);

  const itemIdSet = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const itemOptions = useMemo(
    () => items.slice().sort((a, b) => a.id.localeCompare(b.id)),
    [items],
  );
  const recipeWorkshopNames = useMemo(() => {
    const names = Array.from(new Set(recipes.map((r) => (r.workshopName ?? "").trim()).filter(Boolean)));
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }, [recipes]);
  const recipesByWorkshop = useMemo(() => {
    const map = new Map<string, RecipeRow[]>();
    for (const r of recipes) {
      const k = (r.workshopName ?? "").trim() || "미지정";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    for (const [k, arr] of map) arr.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [recipes]);

  async function run(label: string, fn: () => Promise<any>) {
    setBusy(label);
    setError(null);
    setResult(null);
    try {
      const r = await fn();
      setResult(r);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-zinc-600">관리자 패널</div>
          <h1 className="text-3xl font-semibold tracking-tight">데이터 편집 · DB 적용</h1>
          <p className="max-w-3xl text-sm text-zinc-600">
            `items.json` / `workshops.json`을 직접 편집한 뒤, “DB에 적용”을 누르면 DB에 업서트되고 드랍테이블이 갱신돼.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="text-sm font-semibold">접근 토큰</div>
          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder=".env의 ADMIN_TOKEN 값"
            />
            <div className="flex gap-2">
              <button
                className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!token || !!busy}
                onClick={() =>
                  run("load", async () => {
                    const [items, workshops, recipes] = await Promise.all([
                      adminFetch("GET", "/api/admin/data/items", token),
                      adminFetch("GET", "/api/admin/data/workshops", token),
                      adminFetch("GET", "/api/admin/data/recipes", token),
                    ]);
                    setItemsText(JSON.stringify(items.items, null, 2));
                    setWorkshopsText(JSON.stringify(workshops.workshops, null, 2));
                    setRecipesText(JSON.stringify(recipes.recipes, null, 2));
                    setItems((items.items ?? []).map(normalizeItemGradeForAdmin));
                    setWorkshops(workshops.workshops ?? []);
                    setRecipes(recipes.recipes ?? []);
                    return { ok: true };
                  })
                }
              >
                파일 불러오기
              </button>
              <button
                className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                disabled={!token || !!busy}
                onClick={() =>
                  run("apply", () => adminFetch("POST", "/api/admin/apply", token, {}))
                }
              >
                DB에 적용
              </button>
            </div>
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            로컬 개발용 최소 보안이야. 배포 전엔 반드시 인증/권한 체계를 붙여야 해.
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">개발 도구</div>
              <div className="mt-1 text-xs text-zinc-600">DevPanel 기능을 관리자 패널로 통합했어. (로컬 개발용)</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!!busy}
                onClick={() =>
                  run("dev-seed", async () => {
                    const r = await adminFetch("POST", "/api/dev/seed", token || "dev", {});
                    setSeedResult(r);
                    return r;
                  })
                }
              >
                시드 넣기(/api/dev/seed)
              </button>
              <button
                className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                disabled={!seedResult}
                onClick={() => setSeedResult(null)}
              >
                시드 결과 지우기
              </button>
            </div>
          </div>
          {seedResult ? (
            <pre className="mt-3 max-h-[260px] overflow-auto rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-xs leading-5 text-white/90">
              {JSON.stringify(seedResult, null, 2)}
            </pre>
          ) : (
            <div className="mt-3 text-xs text-zinc-500">
              시드를 넣으면 테스트 유저/마을 시설/매물/봇이 생성돼. 로그인 패널에서 <span className="font-semibold">dev_buyer</span>{" "}
              로 로그인하면 바로 확인 가능해.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">봇 모니터링</div>
              <div className="mt-1 text-xs text-zinc-600">
                지갑·일일 매수 예산·재고·활성 매물·최근 거래를 한눈에 보고, 이상 징후는 색 뱃지로 표시돼.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                disabled={!token || !!busy}
                onClick={() =>
                  run("bots-dashboard", async () => {
                    const r = await adminFetch("GET", "/api/admin/bots", token);
                    setBotDash(r);
                    return r;
                  })
                }
              >
                봇 상태 새로고침
              </button>
              <button
                className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!token || !!busy}
                onClick={() =>
                  run("bots-tick", async () => {
                    const tick = await adminFetch("POST", "/api/bots/tick", token);
                    const dash = await adminFetch("GET", "/api/admin/bots", token);
                    setBotDash(dash);
                    return { tick, dash };
                  })
                }
              >
                봇 틱 실행 + 갱신
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="flex min-w-[120px] flex-col gap-1">
              <label className="text-[11px] font-semibold text-zinc-600" htmlFor="ensure-bot-count">
                봇 수(1~100)
              </label>
              <input
                id="ensure-bot-count"
                className="h-10 w-28 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                type="number"
                min={1}
                max={100}
                value={ensureBotCount}
                onChange={(e) => setEnsureBotCount(e.target.value)}
              />
            </div>
            <button
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
              disabled={!token || !!busy}
              onClick={() =>
                run("bots-ensure", async () => {
                  const n = Math.floor(normalizeNumber(ensureBotCount, NaN));
                  if (!Number.isFinite(n) || n < 1 || n > 100) throw { ok: false, error: "봇 수는 1~100 정수로 입력해." };
                  const ensured = await adminFetch("POST", "/api/admin/bots/ensure", token, { count: n });
                  const dash = await adminFetch("GET", "/api/admin/bots", token);
                  setBotDash(dash);
                  return ensured;
                })
              }
            >
              봇 N명 DB에 보장
            </button>
            <p className="min-w-[200px] flex-1 text-xs text-zinc-600">
              코드/재시작 없이 DB에 `market_bot_1`…`N`을 만들거나 갱신해. 틱은 DB에 있는 봇 전원을 돌려. `.env`의{" "}
              <span className="font-mono">BOT_COUNT</span>는 기본값·시드용이고, 바꾸면 프로세스 재시작 후 반영돼.
            </p>
          </div>

          {!botDash ? (
            <div className="mt-4 text-sm text-zinc-500">위에서 “봇 상태 새로고침”을 눌러 데이터를 불러와.</div>
          ) : (
            <div className="mt-4 grid gap-4">
              {Array.isArray(botDash.globalSignals) && botDash.globalSignals.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {botDash.globalSignals.map((s: Json, i: number) => (
                    <div
                      key={`gs-${i}`}
                      className={[
                        "rounded-full border px-3 py-1 text-xs font-semibold",
                        signalPillClass(String(s?.level ?? "info")),
                      ].join(" ")}
                      title={String(s?.detail ?? "")}
                    >
                      {String(s?.title ?? s?.code ?? "signal")}
                    </div>
                  ))}
                </div>
              ) : null}

              {botDash.market ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-[11px] font-semibold text-zinc-600">고정가 활성 매물</div>
                    <div className="mt-1 text-lg font-semibold">
                      {fmtInt(botDash.market.activeFixedListings)}건 / {fmtInt(botDash.market.activeFixedQty)}개
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-[11px] font-semibold text-zinc-600">봇 위탁(고정가) 수량 비중</div>
                    <div className="mt-1 text-lg font-semibold">{fmtPct01(botDash.market.botShareOfActiveFixedQty)}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      봇 {fmtInt(botDash.market.botEscrowQtyOnFixed)} / 전체 {fmtInt(botDash.market.activeFixedQty)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-[11px] font-semibold text-zinc-600">24h 고정가 매수 총액</div>
                    <div className="mt-1 text-lg font-semibold">{fmtInt(botDash.market.fixedBuyGrossGold24h)}G</div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-[11px] font-semibold text-zinc-600">그중 봇 매수 비중</div>
                    <div className="mt-1 text-lg font-semibold">{fmtPct01(botDash.market.botShareOfFixedBuyGross24h)}</div>
                    <div className="mt-1 text-xs text-zinc-600">봇 합계 {fmtInt(botDash.market.botFixedBuyGrossGold24h)}G</div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-2">
                {Array.isArray(botDash.bots)
                  ? botDash.bots.map((b: Json) => {
                      if (b?.missing) {
                        return (
                          <div key={String(b?.username)} className="rounded-2xl border border-red-200 bg-red-50 p-4">
                            <div className="text-sm font-semibold text-red-900">{String(b?.username)}</div>
                            <div className="mt-2 text-xs text-red-900">DB에 유저가 없어. 시드로 봇을 생성해.</div>
                          </div>
                        );
                      }

                      const sigs = Array.isArray(b?.signals) ? b.signals : [];
                      const invStacks = Array.isArray(b?.inventory?.stacks) ? b.inventory.stacks : [];

                      return (
                        <div key={String(b?.id ?? b?.username)} className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold">{String(b?.username)}</div>
                              <div className="mt-1 font-mono text-[11px] text-zinc-500">{String(b?.id)}</div>
                            </div>
                            <div className="text-right text-xs text-zinc-600">
                              KST 오늘 <span className="font-semibold text-zinc-900">{String(botDash.kstDayKey)}</span>
                            </div>
                          </div>

                          {sigs.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {sigs.map((s: Json, i: number) => (
                                <div
                                  key={`${b?.id}-s-${i}`}
                                  className={[
                                    "rounded-full border px-3 py-1 text-[11px] font-semibold",
                                    signalPillClass(String(s?.level ?? "info")),
                                  ].join(" ")}
                                  title={String(s?.detail ?? "")}
                                >
                                  {String(s?.title ?? s?.code ?? "signal")}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-3 text-xs text-zinc-500">특이 신호 없음(임계 기준).</div>
                          )}

                          <div className="mt-4 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                              <div className="text-[11px] font-semibold text-zinc-600">지갑</div>
                              <div className="mt-1 text-sm font-semibold">
                                {fmtInt(b?.wallet?.goldAvailable)}G
                              </div>
                              <div className="text-[11px] text-zinc-600">잠금 {fmtInt(b?.wallet?.goldLocked)}G</div>
                            </div>
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                              <div className="text-[11px] font-semibold text-zinc-600">오늘 매수 예산</div>
                              <div className="mt-1 text-sm font-semibold">
                                남음 {fmtInt(b?.budget?.remainingBuyBudget)} /{" "}
                                {fmtInt(b?.budget?.dailyBuyBudgetGold)}G
                              </div>
                              <div className="text-[11px] text-zinc-600">
                                소진 {fmtInt(b?.budget?.budgetUsedToday)}G · dayKey {String(b?.budget?.dayKey ?? "—")}
                              </div>
                            </div>
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                              <div className="text-[11px] font-semibold text-zinc-600">활성 매물</div>
                              <div className="mt-1 text-sm font-semibold">
                                {fmtInt(b?.listings?.activeCount)}건 / {fmtInt(b?.listings?.activeQty)}개
                              </div>
                              <div className="text-[11px] text-zinc-600">거래가능 재고 {fmtInt(b?.inventory?.tradableQty)}</div>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-xl border border-zinc-200 p-3">
                              <div className="text-[11px] font-semibold text-zinc-600">최근 1시간(고정가)</div>
                              <div className="mt-1 text-xs text-zinc-800">
                                매수 {fmtInt(b?.activity?.last1h?.buyCount)}건 · {fmtInt(b?.activity?.last1h?.buyGross)}G
                              </div>
                              <div className="text-xs text-zinc-800">
                                매도 {fmtInt(b?.activity?.last1h?.sellCount)}건 · 순입{" "}
                                {fmtInt(b?.activity?.last1h?.sellNet)}G
                              </div>
                              <div className="mt-1 text-[11px] text-zinc-600">
                                추정 순익(대략) {fmtInt(b?.activity?.last1h?.pnlApprox)}G
                              </div>
                            </div>
                            <div className="rounded-xl border border-zinc-200 p-3">
                              <div className="text-[11px] font-semibold text-zinc-600">최근 24시간(고정가)</div>
                              <div className="mt-1 text-xs text-zinc-800">
                                매수 {fmtInt(b?.activity?.last24h?.buyCount)}건 · {fmtInt(b?.activity?.last24h?.buyGross)}G
                              </div>
                              <div className="text-xs text-zinc-800">
                                매도 {fmtInt(b?.activity?.last24h?.sellCount)}건 · 순입{" "}
                                {fmtInt(b?.activity?.last24h?.sellNet)}G
                              </div>
                              <div className="mt-1 text-[11px] text-zinc-600">
                                추정 순익(대략) {fmtInt(b?.activity?.last24h?.pnlApprox)}G
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <div className="text-[11px] font-semibold text-zinc-600">인벤토리</div>
                              <div className="mt-2 max-h-32 overflow-auto rounded-xl border border-zinc-200">
                                {invStacks.length === 0 ? (
                                  <div className="p-2 text-xs text-zinc-500">비어 있음</div>
                                ) : (
                                  <table className="w-full border-collapse text-left text-[11px]">
                                    <thead className="sticky top-0 bg-zinc-50 text-zinc-600">
                                      <tr>
                                        <th className="border-b border-zinc-200 px-2 py-1">아이템</th>
                                        <th className="border-b border-zinc-200 px-2 py-1">수량</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {invStacks.slice(0, 12).map((row: Json, idx: number) => (
                                        <tr key={`${b?.id}-inv-${idx}`} className="border-b border-zinc-100 last:border-b-0">
                                          <td className="px-2 py-1 font-mono text-zinc-800">
                                            {String(row?.itemId)}{" "}
                                            <span className="text-zinc-500">{String(row?.name ?? "")}</span>
                                            {!row?.tradable ? (
                                              <span className="ml-1 text-amber-700">(비거래)</span>
                                            ) : null}
                                          </td>
                                          <td className="px-2 py-1">{fmtInt(row?.quantity)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] font-semibold text-zinc-600">최근 체결(봇 기준)</div>
                              <div className="mt-2 max-h-32 overflow-auto rounded-xl border border-zinc-200">
                                {!Array.isArray(b?.recentTrades) || b.recentTrades.length === 0 ? (
                                  <div className="p-2 text-xs text-zinc-500">없음</div>
                                ) : (
                                  <table className="w-full border-collapse text-left text-[11px]">
                                    <thead className="sticky top-0 bg-zinc-50 text-zinc-600">
                                      <tr>
                                        <th className="border-b border-zinc-200 px-2 py-1">시간</th>
                                        <th className="border-b border-zinc-200 px-2 py-1">구분</th>
                                        <th className="border-b border-zinc-200 px-2 py-1">아이템</th>
                                        <th className="border-b border-zinc-200 px-2 py-1">금액</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {b.recentTrades.map((t: Json, idx: number) => (
                                        <tr key={`${b?.id}-tx-${idx}`} className="border-b border-zinc-100 last:border-b-0">
                                          <td className="px-2 py-1 text-zinc-600">
                                            {String(t?.at ?? "").slice(11, 19)}
                                          </td>
                                          <td className="px-2 py-1">
                                            <span
                                              className={
                                                String(t?.side) === "buy"
                                                  ? "font-semibold text-blue-800"
                                                  : "font-semibold text-emerald-800"
                                              }
                                            >
                                              {String(t?.side)}
                                            </span>
                                          </td>
                                          <td className="px-2 py-1 font-mono">{String(t?.itemId)}</td>
                                          <td className="px-2 py-1">{fmtInt(t?.gold)}G</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          </div>

                          {Array.isArray(b?.listings?.samples) && b.listings.samples.length > 0 ? (
                            <div className="mt-3">
                              <div className="text-[11px] font-semibold text-zinc-600">활성 매물 샘플</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {b.listings.samples.map((l: Json, idx: number) => (
                                  <div
                                    key={`${b?.id}-lst-${idx}`}
                                    className="rounded-xl border border-zinc-200 bg-white px-2 py-1 font-mono text-[11px] text-zinc-800"
                                  >
                                    {String(l?.itemId)} × {fmtInt(l?.qty)} @ {fmtInt(l?.unit)}G
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  : null}
              </div>

              <div className="text-xs text-zinc-500">
                “추정 순익”은 고정가 기준으로{" "}
                <span className="font-semibold">매도 순입금(net) − 매수 총액(gross)</span>로만 대략 잡았고, 수수료/부분
                체결/다른 유저 거래까지 완전히 설명하진 못해.
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">폼 편집(추천)</div>
              <div className="mt-1 text-xs text-zinc-600">
                여기서 편집 → 저장(파일) → DB에 적용 순서로 사용하면 돼.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                disabled={!!busy}
                onClick={() =>
                  run("sync-from-text", async () => {
                    const a = safeJsonParse<ItemRow[]>(itemsText);
                    if (!a.ok) throw { ok: false, error: `items.json 파싱 실패: ${a.error}` };
                    const b = safeJsonParse<WorkshopRow[]>(workshopsText);
                    if (!b.ok) throw { ok: false, error: `workshops.json 파싱 실패: ${b.error}` };
                    setItems((a.value ?? []).map(normalizeItemGradeForAdmin));
                    setWorkshops(b.value ?? []);
                    return { ok: true };
                  })
                }
              >
                텍스트 → 폼 반영
              </button>
              <button
                className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                disabled={!!busy}
                onClick={() =>
                  run("sync-to-text", async () => {
                    setItemsText(JSON.stringify(items, null, 2));
                    setWorkshopsText(JSON.stringify(workshops, null, 2));
                    return { ok: true };
                  })
                }
              >
                폼 → 텍스트 반영
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">아이템</div>
                <button
                  className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() =>
                    setItems((prev) => [
                      ...prev,
                      {
                        id: `item_new_${prev.length + 1}`,
                        name: "새 아이템",
                        category: "재료",
                        tradable: true,
                        grade: 1,
                      },
                    ])
                  }
                >
                  + 아이템 추가
                </button>
              </div>

              <div className="mt-3 grid gap-2">
                {items.length === 0 ? (
                  <div className="text-sm text-zinc-500">아이템이 없어.</div>
                ) : (
                  items.map((it, idx) => (
                    <div key={`${it.id}-${idx}`} className="rounded-xl border border-zinc-200 bg-white p-3">
                      <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_minmax(140px,200px)_auto]">
                        <div className="flex flex-col gap-1">
                          <div className="text-[11px] font-semibold text-zinc-600">id</div>
                          <input
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                            value={it.id}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, id: e.target.value } : p)),
                              )
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="text-[11px] font-semibold text-zinc-600">name</div>
                          <input
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                            value={it.name}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, name: e.target.value } : p)),
                              )
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="text-[11px] font-semibold text-zinc-600">category</div>
                          <input
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                            value={it.category}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, category: e.target.value } : p)),
                              )
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="text-[11px] font-semibold text-zinc-600">등급</div>
                          <select
                            className="h-9 rounded-xl border border-zinc-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                            value={Math.max(1, Math.min(8, Math.floor(it.grade ?? 1)))}
                            onChange={(e) => {
                              const v = Math.max(1, Math.min(8, Math.floor(Number(e.target.value) || 1)));
                              setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, grade: v } : p)));
                            }}
                          >
                            {ITEM_GRADE_LABELS.map((label, gi) => (
                              <option key={label} value={gi + 1}>
                                {gi + 1}. {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end justify-end gap-2">
                          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                            <input
                              type="checkbox"
                              checked={!!it.tradable}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((p, i) => (i === idx ? { ...p, tradable: e.target.checked } : p)),
                                )
                              }
                            />
                            거래가능
                          </label>
                          <button
                            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                            onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">아이템 적정 기준가(희귀도 반영)</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      돌(`item_stone`)을 기준으로, 등급별 배수로 자동 계산한 참고값이에요.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="text-[11px] font-semibold text-zinc-600">돌 기준가(G)</div>
                      <input
                        className="h-9 w-28 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                        inputMode="numeric"
                        value={refStoneGold}
                        onChange={(e) => setRefStoneGold(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="text-[11px] font-semibold text-zinc-600">등급 배수(성장)</div>
                      <input
                        className="h-9 w-28 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                        inputMode="decimal"
                        value={refRarityGrowth}
                        onChange={(e) => setRefRarityGrowth(e.target.value)}
                      />
                    </div>
                    <div className="pb-1 text-[11px] font-semibold text-zinc-500">
                      현재: 돌 {refTable.base.toLocaleString()}G · 배수 ×{refTable.growth}
                    </div>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-zinc-50">
                        <tr className="text-[11px] font-semibold text-zinc-600">
                          <th className="border-b border-zinc-200 px-3 py-2">이름</th>
                          <th className="border-b border-zinc-200 px-3 py-2">카테고리</th>
                          <th className="border-b border-zinc-200 px-3 py-2">등급</th>
                          <th className="border-b border-zinc-200 px-3 py-2 text-right">적정 기준가(G)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refTable.rows.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-sm text-zinc-500" colSpan={4}>
                              아이템을 불러오면 표가 채워져요.
                            </td>
                          </tr>
                        ) : (
                          refTable.rows.map((r) => (
                            <tr key={r.id} className="odd:bg-white even:bg-zinc-50/40">
                              <td className="border-b border-zinc-100 px-3 py-2">
                                <div className="font-semibold text-zinc-900">{r.name}</div>
                                <div className="text-[11px] text-zinc-500">{r.id}</div>
                              </td>
                              <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{r.category}</td>
                              <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                                {r.grade}. {r.gradeLabel}
                              </td>
                              <td className="border-b border-zinc-100 px-3 py-2 text-right font-semibold tabular-nums text-zinc-900">
                                {r.recommendedGold.toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                  disabled={!token || !!busy}
                  onClick={() =>
                    run("save-items-form", async () => {
                      const r = await adminFetch("PUT", "/api/admin/data/items", token, items);
                      setItemsText(JSON.stringify(items, null, 2));
                      return r;
                    })
                  }
                >
                  아이템 저장(파일)
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">마을 시설</div>
                <button
                  className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() =>
                    setWorkshops((prev) => [
                      ...prev,
                      {
                        id: `workshop_new_${prev.length + 1}`,
                        name: "새 시설",
                        drops: [{ itemId: items[0]?.id ?? "item_ore", weight: 1, minQty: 1, maxQty: 1, minTier: 1 }],
                      },
                    ])
                  }
                >
                  + 시설 추가
                </button>
              </div>

              <div className="mt-3 grid gap-3">
                {workshops.length === 0 ? (
                  <div className="text-sm text-zinc-500">등록된 시설이 없어.</div>
                ) : (
                  workshops.map((ws, widx) => {
                    const total = workshopDropTotalWeight(ws);
                    return (
                      <div key={`${ws.id}-${widx}`} className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">마을 시설</div>
                            <div className="text-xs text-zinc-500">드랍 가중치 합: {total}</div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                              onClick={() =>
                                setWorkshops((prev) =>
                                  prev.map((p, i) =>
                                    i === widx
                                      ? {
                                          ...p,
                                          drops: [
                                            ...p.drops,
                                            {
                                              itemId: items[0]?.id ?? "item_ore",
                                              weight: 1,
                                              minQty: 1,
                                              maxQty: 1,
                                            },
                                          ],
                                        }
                                      : p,
                                  ),
                                )
                              }
                            >
                              + 드랍 추가
                            </button>
                            <button
                              className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                              onClick={() => setWorkshops((prev) => prev.filter((_, i) => i !== widx))}
                            >
                              시설 삭제
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <div className="flex flex-col gap-1">
                            <div className="text-[11px] font-semibold text-zinc-600">id</div>
                            <input
                              className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                              value={ws.id}
                              onChange={(e) =>
                                setWorkshops((prev) =>
                                  prev.map((p, i) => (i === widx ? { ...p, id: e.target.value } : p)),
                                )
                              }
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="text-[11px] font-semibold text-zinc-600">name</div>
                            <input
                              className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                              value={ws.name}
                              onChange={(e) =>
                                setWorkshops((prev) =>
                                  prev.map((p, i) => (i === widx ? { ...p, name: e.target.value } : p)),
                                )
                              }
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2">
                          {ws.drops.map((d, didx) => {
                            const chance = total > 0 ? (Math.max(0, d.weight) / total) * 100 : 0;
                            const itemMissing = !itemIdSet.has(d.itemId);
                            return (
                              <div
                                key={`${ws.id}-${didx}`}
                                className={[
                                  "rounded-xl border p-3",
                                  itemMissing ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-white",
                                ].join(" ")}
                              >
                                <div className="grid gap-2 md:grid-cols-[1fr_90px_70px_90px_90px_auto]">
                                  <div className="flex flex-col gap-1">
                                    <div className="text-[11px] font-semibold text-zinc-600">
                                      itemId {itemMissing ? "(아이템 없음!)" : ""}
                                    </div>
                                    <input
                                      className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                      value={d.itemId}
                                      onChange={(e) =>
                                        setWorkshops((prev) =>
                                          prev.map((p, i) =>
                                            i === widx
                                              ? {
                                                  ...p,
                                                  drops: p.drops.map((dd, j) =>
                                                    j === didx ? { ...dd, itemId: e.target.value } : dd,
                                                  ),
                                                }
                                              : p,
                                          ),
                                        )
                                      }
                                    />
                                    <div className="text-xs text-zinc-600">확률: {Math.round(chance * 10) / 10}%</div>
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <div className="text-[11px] font-semibold text-zinc-600">weight</div>
                                    <input
                                      className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                      type="number"
                                      value={d.weight}
                                      onChange={(e) => {
                                        const v = normalizeNumber(e.target.value, 0);
                                        setWorkshops((prev) =>
                                          prev.map((p, i) =>
                                            i === widx
                                              ? {
                                                  ...p,
                                                  drops: p.drops.map((dd, j) => (j === didx ? { ...dd, weight: v } : dd)),
                                                }
                                              : p,
                                          ),
                                        );
                                      }}
                                    />
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <div className="text-[11px] font-semibold text-zinc-600">minTier</div>
                                    <input
                                      className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                      type="number"
                                      value={Math.max(1, Math.min(5, Math.floor(d.minTier ?? 1)))}
                                      onChange={(e) => {
                                        const v = Math.max(1, Math.min(5, Math.floor(normalizeNumber(e.target.value, 1))));
                                        setWorkshops((prev) =>
                                          prev.map((p, i) =>
                                            i === widx
                                              ? {
                                                  ...p,
                                                  drops: p.drops.map((dd, j) => (j === didx ? { ...dd, minTier: v } : dd)),
                                                }
                                              : p,
                                          ),
                                        );
                                      }}
                                      title="이 드랍이 활성화되는 최소 수집 시설 티어(1~5)"
                                    />
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <div className="text-[11px] font-semibold text-zinc-600">min</div>
                                    <input
                                      className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                      type="number"
                                      value={d.minQty}
                                      onChange={(e) => {
                                        const v = Math.max(1, Math.floor(normalizeNumber(e.target.value, 1)));
                                        setWorkshops((prev) =>
                                          prev.map((p, i) =>
                                            i === widx
                                              ? {
                                                  ...p,
                                                  drops: p.drops.map((dd, j) => (j === didx ? { ...dd, minQty: v } : dd)),
                                                }
                                              : p,
                                          ),
                                        );
                                      }}
                                    />
                                  </div>

                                  <div className="flex flex-col gap-1">
                                    <div className="text-[11px] font-semibold text-zinc-600">max</div>
                                    <input
                                      className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                      type="number"
                                      value={d.maxQty}
                                      onChange={(e) => {
                                        const v = Math.max(1, Math.floor(normalizeNumber(e.target.value, 1)));
                                        setWorkshops((prev) =>
                                          prev.map((p, i) =>
                                            i === widx
                                              ? {
                                                  ...p,
                                                  drops: p.drops.map((dd, j) => (j === didx ? { ...dd, maxQty: v } : dd)),
                                                }
                                              : p,
                                          ),
                                        );
                                      }}
                                    />
                                  </div>

                                  <div className="flex items-end justify-end">
                                    <button
                                      className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                                      onClick={() =>
                                        setWorkshops((prev) =>
                                          prev.map((p, i) =>
                                            i === widx ? { ...p, drops: p.drops.filter((_, j) => j !== didx) } : p,
                                          ),
                                        )
                                      }
                                    >
                                      드랍 삭제
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                  disabled={!token || !!busy}
                  onClick={() =>
                    run("save-workshops-form", async () => {
                      const r = await adminFetch("PUT", "/api/admin/data/workshops", token, workshops);
                      setWorkshopsText(JSON.stringify(workshops, null, 2));
                      return r;
                    })
                  }
                >
                  마을·시설 데이터 저장(파일)
                </button>
                <button
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                  disabled={!token || !!busy}
                  onClick={() =>
                    run("save-recipes-form", async () => {
                      const r = await adminFetch("PUT", "/api/admin/data/recipes", token, recipes);
                      setRecipesText(JSON.stringify(recipes, null, 2));
                      return r;
                    })
                  }
                >
                  레시피 저장(파일)
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">items.json</div>
              <button
                className="text-xs font-semibold text-zinc-700 underline decoration-zinc-300 underline-offset-4 disabled:opacity-50"
                disabled={!token || !!busy}
                onClick={() =>
                  run("save-items", async () => {
                    const json = JSON.parse(itemsText);
                    return await adminFetch("PUT", "/api/admin/data/items", token, json);
                  })
                }
              >
                저장
              </button>
            </div>
            <textarea
              className="mt-3 h-[520px] w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-zinc-200"
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
              spellCheck={false}
              placeholder='예: [{"id":"item_ore","name":"철광석","category":"재료","tradable":true}]'
            />
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">workshops.json</div>
              <button
                className="text-xs font-semibold text-zinc-700 underline decoration-zinc-300 underline-offset-4 disabled:opacity-50"
                disabled={!token || !!busy}
                onClick={() =>
                  run("save-workshops", async () => {
                    const json = JSON.parse(workshopsText);
                    return await adminFetch("PUT", "/api/admin/data/workshops", token, json);
                  })
                }
              >
                저장
              </button>
            </div>
            <textarea
              className="mt-3 h-[520px] w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-zinc-200"
              value={workshopsText}
              onChange={(e) => setWorkshopsText(e.target.value)}
              spellCheck={false}
              placeholder='예: [{"id":"workshop_mine","name":"광산","drops":[{"itemId":"item_ore","weight":70,"minQty":1,"maxQty":2}]}]'
            />
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">레시피(가공/2차 소모처)</div>
              <div className="mt-1 text-xs text-zinc-600">
                폼으로 빠르게 밸런싱하고, 저장 후 “DB에 적용”을 눌러 반영해.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!!busy}
                onClick={() =>
                  setRecipes((prev) => [
                    ...prev,
                    {
                      workshopName: recipeWorkshopNames[0] ?? "대장간",
                      name: `새 레시피 ${prev.length + 1}`,
                      inputs: [{ itemId: itemOptions[0]?.id ?? "item_ore", quantity: 1 }],
                      outputs: [{ itemId: itemOptions[0]?.id ?? "item_ore", weight: 0, minQty: 1, maxQty: 1 }],
                      rewardGold: 0,
                    },
                  ])
                }
              >
                + 레시피 추가
              </button>
              <button
                className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                disabled={!token || !!busy}
                onClick={() =>
                  run("save-recipes-form", async () => {
                    const r = await adminFetch("PUT", "/api/admin/data/recipes", token, recipes);
                    setRecipesText(JSON.stringify(recipes, null, 2));
                    return r;
                  })
                }
              >
                레시피 저장(파일)
              </button>
            </div>
          </div>

          <datalist id="item-id-datalist">
            {itemOptions.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </datalist>

          <div className="mt-4 grid gap-3">
            {Array.from(recipesByWorkshop.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([wsName, rows]) => (
                <div key={wsName} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{wsName}</div>
                    <div className="text-xs font-semibold text-zinc-500">{rows.length}개</div>
                  </div>

                  <div className="mt-3 grid gap-3">
                    {rows.map((r, idxInGroup) => {
                      const globalIdx = recipes.findIndex(
                        (x) => x === r,
                      );
                      const consume = isConsumeRecipe(r);
                      const outW = recipeOutputsTotalWeight(r);
                      const anyWeighted = (r.outputs ?? []).some((o) => (o.weight ?? 0) > 0);
                      const hasOutputs = (r.outputs ?? []).length > 0;
                      const totalHasNoOutputs = !consume && !hasOutputs;
                      const weightedHasBadSum = anyWeighted && outW <= 0;
                      const deterministicHasWeight = !anyWeighted && (r.outputs ?? []).some((o) => (o.weight ?? 0) > 0);
                      const badItem =
                        r.inputs.some((i) => !itemIdSet.has(i.itemId)) ||
                        (r.outputs ?? []).some((o) => !itemIdSet.has(o.itemId));

                      return (
                        <div
                          key={`${wsName}-${idxInGroup}`}
                          className={[
                            "rounded-xl border p-3",
                            badItem ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-white",
                          ].join(" ")}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={[
                                    "rounded-lg border px-2 py-0.5 text-[11px] font-semibold",
                                    consume
                                      ? "border-amber-200 bg-amber-50 text-amber-950"
                                      : "border-indigo-200 bg-indigo-50 text-indigo-900",
                                  ].join(" ")}
                                >
                                  {consume ? "2차(보상)" : "가공"}
                                </span>
                                <input
                                  className="h-9 w-[320px] max-w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                  value={r.name}
                                  onChange={(e) =>
                                    setRecipes((prev) =>
                                      prev.map((p, i) => (i === globalIdx ? { ...p, name: e.target.value } : p)),
                                    )
                                  }
                                  placeholder="레시피 이름"
                                />
                              </div>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <div className="flex flex-col gap-1">
                                  <div className="text-[11px] font-semibold text-zinc-600">workshopName</div>
                                  <input
                                    className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                    value={r.workshopName}
                                    onChange={(e) =>
                                      setRecipes((prev) =>
                                        prev.map((p, i) =>
                                          i === globalIdx ? { ...p, workshopName: e.target.value } : p,
                                        ),
                                      )
                                    }
                                    list="recipe-workshop-datalist"
                                    placeholder="예: 대장간 / 제련소 / 납품소"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <div className="text-[11px] font-semibold text-zinc-600">rewardGold (2차)</div>
                                  <input
                                    className="h-9 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                    type="number"
                                    min={0}
                                    value={Math.max(0, Math.floor(Number(r.rewardGold ?? 0)))}
                                    onChange={(e) => {
                                      const v = Math.max(0, Math.floor(normalizeNumber(e.target.value, 0)));
                                      setRecipes((prev) =>
                                        prev.map((p, i) =>
                                          i === globalIdx
                                            ? { ...p, rewardGold: v, outputs: v > 0 ? [] : p.outputs }
                                            : p,
                                        ),
                                      );
                                    }}
                                  />
                                  <div className="text-[11px] text-zinc-500">
                                    0이면 가공(아이템 생산), 1 이상이면 2차 소모처(골드 보상)
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs font-semibold text-zinc-700">입력(소모)</div>
                                    <button
                                      className="h-8 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                                      onClick={() =>
                                        setRecipes((prev) =>
                                          prev.map((p, i) =>
                                            i === globalIdx
                                              ? {
                                                  ...p,
                                                  inputs: [
                                                    ...(p.inputs ?? []),
                                                    { itemId: itemOptions[0]?.id ?? "item_ore", quantity: 1 },
                                                  ],
                                                }
                                              : p,
                                          ),
                                        )
                                      }
                                    >
                                      + 입력
                                    </button>
                                  </div>
                                  <div className="mt-2 grid gap-2">
                                    {(r.inputs ?? []).map((inp, j) => {
                                      const missing = !itemIdSet.has(inp.itemId);
                                      return (
                                        <div
                                          key={j}
                                          className={[
                                            "grid grid-cols-[1fr_90px_auto] items-center gap-2 rounded-xl border px-2 py-2",
                                            missing ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-zinc-50",
                                          ].join(" ")}
                                        >
                                          <input
                                            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                            value={inp.itemId}
                                            list="item-id-datalist"
                                            onChange={(e) =>
                                              setRecipes((prev) =>
                                                prev.map((p, i) =>
                                                  i === globalIdx
                                                    ? {
                                                        ...p,
                                                        inputs: p.inputs.map((x, k) =>
                                                          k === j ? { ...x, itemId: e.target.value } : x,
                                                        ),
                                                      }
                                                    : p,
                                                ),
                                              )
                                            }
                                          />
                                          <input
                                            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                            type="number"
                                            min={1}
                                            value={inp.quantity}
                                            onChange={(e) => {
                                              const v = Math.max(1, Math.floor(normalizeNumber(e.target.value, 1)));
                                              setRecipes((prev) =>
                                                prev.map((p, i) =>
                                                  i === globalIdx
                                                    ? {
                                                        ...p,
                                                        inputs: p.inputs.map((x, k) =>
                                                          k === j ? { ...x, quantity: v } : x,
                                                        ),
                                                      }
                                                    : p,
                                                ),
                                              );
                                            }}
                                          />
                                          <button
                                            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                                            onClick={() =>
                                              setRecipes((prev) =>
                                                prev.map((p, i) =>
                                                  i === globalIdx
                                                    ? { ...p, inputs: p.inputs.filter((_, k) => k !== j) }
                                                    : p,
                                                ),
                                              )
                                            }
                                          >
                                            삭제
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div className="rounded-xl border border-zinc-200 bg-white p-3">
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs font-semibold text-zinc-700">출력(생산)</div>
                                    <div className="text-[11px] text-zinc-600">
                                      {consume ? "2차는 출력 대신 rewardGold" : anyWeighted ? `가중치 합 ${outW}` : "확정 출력"}
                                    </div>
                                  </div>

                                  {consume ? (
                                    <div className="mt-2 text-sm text-zinc-600">
                                      출력은 비워두고, rewardGold로만 보상해.
                                    </div>
                                  ) : (
                                    <>
                                      <div className="mt-2 flex justify-end">
                                        <button
                                          className="h-8 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                                          onClick={() =>
                                            setRecipes((prev) =>
                                              prev.map((p, i) =>
                                                i === globalIdx
                                                  ? {
                                                      ...p,
                                                      outputs: [
                                                        ...(p.outputs ?? []),
                                                        {
                                                          itemId: itemOptions[0]?.id ?? "item_ore",
                                                          weight: 0,
                                                          minQty: 1,
                                                          maxQty: 1,
                                                        },
                                                      ],
                                                    }
                                                  : p,
                                              ),
                                            )
                                          }
                                        >
                                          + 출력
                                        </button>
                                      </div>
                                      <div className="mt-2 grid gap-2">
                                        {(r.outputs ?? []).map((out, j) => {
                                          const missing = !itemIdSet.has(out.itemId);
                                          return (
                                            <div
                                              key={j}
                                              className={[
                                                "grid gap-2 rounded-xl border px-2 py-2",
                                                missing ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-zinc-50",
                                              ].join(" ")}
                                            >
                                              <div className="grid grid-cols-[1fr_90px_auto] items-center gap-2">
                                                <input
                                                  className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                                  value={out.itemId}
                                                  list="item-id-datalist"
                                                  onChange={(e) =>
                                                    setRecipes((prev) =>
                                                      prev.map((p, i) =>
                                                        i === globalIdx
                                                          ? {
                                                              ...p,
                                                              outputs: p.outputs.map((x, k) =>
                                                                k === j ? { ...x, itemId: e.target.value } : x,
                                                              ),
                                                            }
                                                          : p,
                                                      ),
                                                    )
                                                  }
                                                />
                                                <input
                                                  className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                                  type="number"
                                                  min={0}
                                                  value={Math.max(0, Math.floor(Number(out.weight ?? 0)))}
                                                  onChange={(e) => {
                                                    const v = Math.max(0, Math.floor(normalizeNumber(e.target.value, 0)));
                                                    setRecipes((prev) =>
                                                      prev.map((p, i) =>
                                                        i === globalIdx
                                                          ? {
                                                              ...p,
                                                              outputs: p.outputs.map((x, k) =>
                                                                k === j ? { ...x, weight: v } : x,
                                                              ),
                                                            }
                                                          : p,
                                                      ),
                                                    );
                                                  }}
                                                  title="weight(0이면 확정 출력 모드에서 무시될 수 있어)"
                                                />
                                                <button
                                                  className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                                                  onClick={() =>
                                                    setRecipes((prev) =>
                                                      prev.map((p, i) =>
                                                        i === globalIdx
                                                          ? { ...p, outputs: p.outputs.filter((_, k) => k !== j) }
                                                          : p,
                                                      ),
                                                    )
                                                  }
                                                >
                                                  삭제
                                                </button>
                                              </div>
                                              <div className="grid grid-cols-2 gap-2">
                                                <input
                                                  className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                                  type="number"
                                                  min={1}
                                                  value={Math.max(1, Math.floor(Number(out.minQty ?? 1)))}
                                                  onChange={(e) => {
                                                    const v = Math.max(1, Math.floor(normalizeNumber(e.target.value, 1)));
                                                    setRecipes((prev) =>
                                                      prev.map((p, i) =>
                                                        i === globalIdx
                                                          ? {
                                                              ...p,
                                                              outputs: p.outputs.map((x, k) =>
                                                                k === j ? { ...x, minQty: v } : x,
                                                              ),
                                                            }
                                                          : p,
                                                      ),
                                                    );
                                                  }}
                                                  title="minQty"
                                                />
                                                <input
                                                  className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                                                  type="number"
                                                  min={1}
                                                  value={Math.max(1, Math.floor(Number(out.maxQty ?? 1)))}
                                                  onChange={(e) => {
                                                    const v = Math.max(1, Math.floor(normalizeNumber(e.target.value, 1)));
                                                    setRecipes((prev) =>
                                                      prev.map((p, i) =>
                                                        i === globalIdx
                                                          ? {
                                                              ...p,
                                                              outputs: p.outputs.map((x, k) =>
                                                                k === j ? { ...x, maxQty: v } : x,
                                                              ),
                                                            }
                                                          : p,
                                                      ),
                                                    );
                                                  }}
                                                  title="maxQty"
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>

                              {totalHasNoOutputs ? (
                                <div className="mt-2 text-xs font-semibold text-red-800">
                                  가공 레시피인데 outputs가 비어있어. (rewardGold=0이면 outputs가 필요해)
                                </div>
                              ) : null}
                              {consume && (r.outputs ?? []).length > 0 ? (
                                <div className="mt-2 text-xs font-semibold text-amber-900">
                                  2차(보상) 레시피는 outputs를 비우는 걸 권장해. (저장 시 자동으로 비워짐)
                                </div>
                              ) : null}
                              {weightedHasBadSum ? (
                                <div className="mt-2 text-xs font-semibold text-red-800">
                                  확률 출력인데 weight 합이 0이야. (최소 1 이상 필요)
                                </div>
                              ) : null}
                              {deterministicHasWeight ? (
                                <div className="mt-2 text-xs font-semibold text-amber-900">
                                  확정 출력 모드인데 weight가 들어있어. (0으로 두는 걸 추천)
                                </div>
                              ) : null}
                              {badItem ? (
                                <div className="mt-2 text-xs font-semibold text-amber-900">
                                  아이템 ID가 `items.json`에 없는 항목이 있어. (적용 시 에러 날 수 있음)
                                </div>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-start justify-end">
                              <button
                                className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-900"
                                onClick={() => setRecipes((prev) => prev.filter((_, i) => i !== globalIdx))}
                              >
                                레시피 삭제
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>

          <datalist id="recipe-workshop-datalist">
            {recipeWorkshopNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">recipes.json (원본 텍스트)</div>
            <button
              className="text-xs font-semibold text-zinc-700 underline decoration-zinc-300 underline-offset-4 disabled:opacity-50"
              disabled={!token || !!busy}
              onClick={() =>
                run("save-recipes", async () => {
                  const json = JSON.parse(recipesText);
                  return await adminFetch("PUT", "/api/admin/data/recipes", token, json);
                })
              }
            >
              저장
            </button>
          </div>
          <div className="mt-1 text-xs text-zinc-600">고급 사용자/일괄 편집용. 일반 밸런싱은 위 폼을 추천.</div>
          <textarea
            className="mt-3 h-[320px] w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-zinc-200"
            value={recipesText}
            onChange={(e) => setRecipesText(e.target.value)}
            spellCheck={false}
          />
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950">
          <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold text-white/70">
            결과
          </div>
          <pre className="max-h-[260px] overflow-auto px-4 py-4 text-xs leading-5 text-white/90">{pretty}</pre>
        </section>
      </main>
    </div>
  );
}

