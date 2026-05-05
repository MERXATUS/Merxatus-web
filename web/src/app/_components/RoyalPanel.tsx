"use client";

import { useEffect, useMemo, useState } from "react";
import { itemGradeLabel, itemGradeNameClassName } from "@/server/itemGrade";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

function formatErr(e: unknown) {
  if (!e) return "오류";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e && "error" in e && typeof (e as any).error === "string") {
    const code = (e as any).error as string;
    if (code === "INFAMY_TOO_HIGH_FOR_ROYAL") return "악명이 높아 황실을 이용할 수 없어요.";
    return code;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

type RoyalRow = {
  itemId: string;
  name: string;
  category: string;
  grade: number;
  buyPricePerUnit: number;
  sellPricePerUnit: number;
  ownedQty: number;
};
type RoyalPrices = {
  ok: true;
  honorPoints: number;
  honorTitle: string | null;
  locked: boolean;
  lockedReason: "INFAMY_TOO_HIGH_FOR_ROYAL" | null;
  goldAvailable: number;
  items: RoyalRow[];
};

export function RoyalPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [royal, setRoyal] = useState<RoyalPrices | null>(null);
  const [qtyByItemId, setQtyByItemId] = useState<Record<string, number>>({});

  const header = useMemo(() => {
    return {
      title: "황실",
      subtitle: `명예 ${royal?.honorPoints?.toLocaleString?.() ?? "—"}${royal?.honorTitle ? ` · 칭호 ${royal.honorTitle}` : ""}`,
    };
  }, [royal?.honorPoints, royal?.honorTitle]);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const r = await getJson<RoyalPrices>("/api/royal/prices");
      setRoyal(r);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  function qtyFor(itemId: string) {
    const q = qtyByItemId[itemId];
    return typeof q === "number" && Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-amber-950">{header.title}</div>
          <div className="mt-1 text-xs text-amber-900/80">{header.subtitle}</div>
          <div className="mt-2 text-[11px] font-semibold text-amber-800/90">레어 재료까지 · 고정가 매입/매도 · 거래 시 명예</div>
        </div>
        <button
          className="h-9 rounded-xl border border-amber-200 bg-white px-3 text-xs font-semibold text-amber-950 hover:bg-amber-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => void refresh()}
        >
          새로고침
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          오류: {formatErr(error)}
        </div>
      ) : null}

      <div className="rounded-3xl border border-amber-200/70 bg-gradient-to-b from-white to-amber-50/70 p-4 shadow-sm">
        {royal?.locked ? (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            악명이 높아 현재 <span className="font-semibold">황실 거래(구매/판매)</span>가 잠겨 있어요.
          </div>
        ) : null}
        <div className="grid gap-2">
          {(royal?.items ?? []).length === 0 ? (
            <div className="rounded-2xl border border-amber-200/70 bg-white px-3 py-3 text-sm text-amber-950/80">
              황실 가격표가 비어 있어요. (먼저 `POST /api/dev/seed` 또는 관리자 apply를 실행하세요.)
            </div>
          ) : (
            (royal?.items ?? []).map((row) => {
              const q = qtyFor(row.itemId);
              const gold = royal?.goldAvailable ?? 0;
              const maxBuy = row.buyPricePerUnit > 0 ? Math.max(1, Math.floor(gold / row.buyPricePerUnit)) : 1;
              return (
                <div
                  key={row.itemId}
                  className="grid grid-cols-12 items-center gap-2 rounded-2xl border border-amber-200/60 bg-white px-3 py-2"
                >
                  <div className="col-span-5 min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className={`truncate text-sm font-semibold ${itemGradeNameClassName(row.grade)}`}>
                        {row.name}
                      </div>
                      <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
                        {itemGradeLabel(row.grade)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] font-semibold tabular-nums text-zinc-700">
                      <span>판매가 {row.sellPricePerUnit.toLocaleString()}G</span>
                      <span className="mx-1 text-zinc-400">·</span>
                      <span className="text-zinc-600">구매가 {row.buyPricePerUnit.toLocaleString()}G</span>
                    </div>
                  </div>
                  <div className="col-span-3 text-right text-xs font-semibold tabular-nums text-zinc-800" />
                  <div className="col-span-2">
                    <input
                      className="h-9 w-full rounded-xl border border-amber-200 bg-white px-2 text-xs font-semibold text-zinc-900"
                      inputMode="numeric"
                      value={String(q)}
                      onChange={(e) => {
                        const n = Math.max(1, Math.floor(Number(e.target.value || 1)));
                        setQtyByItemId((prev) => ({ ...prev, [row.itemId]: n }));
                      }}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <div className="flex items-center gap-2 pr-1 text-[11px] font-semibold text-zinc-600">
                      <span className="tabular-nums">보유 {Math.max(0, row.ownedQty ?? 0).toLocaleString()}</span>
                      <button
                        className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-[10px] font-semibold text-amber-950 hover:bg-amber-50 disabled:opacity-50"
                        disabled={busy || !!royal?.locked}
                        onClick={() => setQtyByItemId((prev) => ({ ...prev, [row.itemId]: maxBuy }))}
                        title="현재 골드로 살 수 있는 최대 수량"
                      >
                        MAX
                      </button>
                    </div>
                    <button
                      className="h-9 rounded-xl border border-amber-200 bg-white px-3 text-xs font-semibold text-amber-950 hover:bg-amber-50 disabled:opacity-50"
                      disabled={busy || !!royal?.locked}
                      onClick={() =>
                        void (async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            await postJson("/api/royal/buy", { itemId: row.itemId, quantity: q });
                            await refresh();
                          } catch (e) {
                            setError(e);
                          } finally {
                            setBusy(false);
                          }
                        })()
                      }
                    >
                      구매
                    </button>
                    <button
                      className="h-9 rounded-xl bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                      disabled={busy || !!royal?.locked}
                      onClick={() =>
                        void (async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            await postJson("/api/royal/sell", { itemId: row.itemId, quantity: q });
                            await refresh();
                          } catch (e) {
                            setError(e);
                          } finally {
                            setBusy(false);
                          }
                        })()
                      }
                    >
                      판매
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

