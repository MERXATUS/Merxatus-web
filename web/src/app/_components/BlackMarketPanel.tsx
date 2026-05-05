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
    if (code === "HONOR_TOO_HIGH_FOR_BLACKMARKET") return "명예가 높아 암시장을 이용할 수 없어요.";
    return code;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

type BlackRow = {
  itemId: string;
  name: string;
  category: string;
  grade: number;
  pricePerUnit: number;
  eventApplied: boolean;
  ownedQty: number;
};

type BlackPrices = {
  ok: true;
  honorPoints: number;
  locked: boolean;
  lockedReason: "HONOR_TOO_HIGH_FOR_BLACKMARKET" | null;
  infamyPoints: number;
  maxGrade: number;
  event: { kind: "BOOM" | "CRASH"; multiplier: number; startsAt: string; endsAt: string } | null;
  goldAvailable: number;
  items: BlackRow[];
};

export function BlackMarketPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [black, setBlack] = useState<BlackPrices | null>(null);
  const [qtyByItemId, setQtyByItemId] = useState<Record<string, number>>({});

  const header = useMemo(() => {
    const ev = black?.event;
    const evText = ev ? `${ev.kind === "BOOM" ? "폭등" : "폭락"} ×${ev.multiplier}` : "이벤트 없음";
    return {
      title: "지하도시(암시장)",
      subtitle: `악명 ${black?.infamyPoints?.toLocaleString?.() ?? "—"} · 거래가능 등급 ≤ ${black?.maxGrade ?? "—"} · ${evText}`,
    };
  }, [black?.infamyPoints, black?.maxGrade, black?.event]);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const r = await getJson<BlackPrices>("/api/blackmarket/prices");
      setBlack(r);
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
          <div className="text-sm font-semibold text-zinc-100">{header.title}</div>
          <div className="mt-1 text-xs text-zinc-300">{header.subtitle}</div>
          <div className="mt-2 text-[11px] font-semibold text-zinc-300">이벤트 기반 변동 시세 · 거래 시 악명 · 악명으로 상위 등급 해금</div>
        </div>
        <button
          className="h-9 rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 text-xs font-semibold text-zinc-100 hover:bg-zinc-900/60 disabled:opacity-50"
          disabled={busy}
          onClick={() => void refresh()}
        >
          새로고침
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          오류: {formatErr(error)}
        </div>
      ) : null}

      <div
        className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 p-4 text-zinc-100 shadow-sm"
        style={{
          backgroundImage:
            "radial-gradient(1200px 500px at 20% 0%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 400px at 90% 20%, rgba(34,197,94,0.12), transparent 55%), radial-gradient(900px 600px at 40% 110%, rgba(244,63,94,0.10), transparent 60%), repeating-radial-gradient(circle at 10% 20%, rgba(255,255,255,0.04) 0 1px, transparent 1px 3px)",
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.35),rgba(0,0,0,0.70))]" />
        <div className="relative grid gap-2">
          {black?.locked ? (
            <div className="mb-2 rounded-2xl border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-200">
              명예가 높아 현재 <span className="font-semibold">암시장 거래(구매/판매)</span>가 잠겨 있어요.
            </div>
          ) : null}
          {(black?.items ?? []).length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-black/30 px-3 py-3 text-sm text-zinc-300">
              거래 가능한 아이템이 없어요.
            </div>
          ) : (
            (black?.items ?? []).map((row) => {
              const q = qtyFor(row.itemId);
              const gold = black?.goldAvailable ?? 0;
              const maxBuy = row.pricePerUnit > 0 ? Math.max(1, Math.floor(gold / row.pricePerUnit)) : 1;
              return (
                <div
                  key={row.itemId}
                  className="grid grid-cols-12 items-center gap-2 rounded-2xl border border-zinc-800 bg-black/30 px-3 py-2 backdrop-blur-[2px]"
                >
                  <div className="col-span-5 min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className={`truncate text-sm font-semibold ${itemGradeNameClassName(row.grade)}`}>
                        {row.name}
                      </div>
                      <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold text-zinc-100">
                        {itemGradeLabel(row.grade)}
                      </span>
                      {row.eventApplied ? (
                        <span className="shrink-0 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200">
                          이벤트
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold tabular-nums text-zinc-200">
                      시세 {row.pricePerUnit.toLocaleString()}G
                    </div>
                  </div>
                  <div className="col-span-3 text-right text-xs font-semibold tabular-nums text-zinc-100" />
                  <div className="col-span-2">
                    <input
                      className="h-9 w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-2 text-xs font-semibold text-zinc-100"
                      inputMode="numeric"
                      value={String(q)}
                      onChange={(e) => {
                        const n = Math.max(1, Math.floor(Number(e.target.value || 1)));
                        setQtyByItemId((prev) => ({ ...prev, [row.itemId]: n }));
                      }}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <div className="flex items-center gap-2 pr-1 text-[11px] font-semibold text-zinc-300">
                      <span className="tabular-nums">보유 {Math.max(0, row.ownedQty ?? 0).toLocaleString()}</span>
                      <button
                        className="rounded-lg border border-zinc-700 bg-zinc-950/60 px-2 py-1 text-[10px] font-semibold text-zinc-100 hover:bg-zinc-900/60 disabled:opacity-50"
                        disabled={busy || !!black?.locked}
                        onClick={() => setQtyByItemId((prev) => ({ ...prev, [row.itemId]: maxBuy }))}
                        title="현재 골드로 살 수 있는 최대 수량"
                      >
                        MAX
                      </button>
                    </div>
                    <button
                      className="h-9 rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 text-xs font-semibold text-zinc-100 hover:bg-zinc-900/60 disabled:opacity-50"
                      disabled={busy || !!black?.locked}
                      onClick={() =>
                        void (async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            await postJson("/api/blackmarket/buy", { itemId: row.itemId, quantity: q });
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
                      className="h-9 rounded-xl bg-fuchsia-600 px-3 text-xs font-semibold text-white hover:bg-fuchsia-700 disabled:opacity-50"
                      disabled={busy || !!black?.locked}
                      onClick={() =>
                        void (async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            await postJson("/api/blackmarket/sell", { itemId: row.itemId, quantity: q });
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

