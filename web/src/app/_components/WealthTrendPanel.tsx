"use client";

import { useEffect, useMemo, useState } from "react";

type PnlPoint = { day: string; delta: number; cumulative: number };
type PnlResp = {
  ok: true;
  days: number;
  points: PnlPoint[];
  summary: { txs: number; totalPnl: number; avgDaily: number };
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

function fmtInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return Math.round(x).toLocaleString();
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function sparkPath(values: number[], w: number, h: number, pad = 6) {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = Math.max(1, w - pad * 2);
  const innerH = Math.max(1, h - pad * 2);

  return values
    .map((v, i) => {
      const x = pad + (innerW * i) / Math.max(1, values.length - 1);
      const y = pad + innerH - (innerH * (v - min)) / span;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function WealthTrendPanel() {
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<PnlResp | null>(null);
  const [error, setError] = useState<any>(null);

  async function refresh(nextDays = days) {
    setBusy(true);
    setError(null);
    try {
      const r = await getJson<PnlResp>(`/api/me/pnl?days=${encodeURIComponent(String(nextDays))}`);
      setData(r);
    } catch (e) {
      setData(null);
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const series = useMemo(() => data?.points?.map((p) => p.cumulative) ?? [], [data]);
  const last = data?.points?.[data.points.length - 1] ?? null;
  const lastDelta = last ? last.delta : 0;
  const total = data?.summary?.totalPnl ?? 0;

  const w = 560;
  const h = 140;
  const path = sparkPath(series, w, h);
  const min = series.length ? Math.min(...series) : 0;
  const max = series.length ? Math.max(...series) : 0;

  const tone =
    total > 0 ? "text-emerald-700" : total < 0 ? "text-red-700" : "text-zinc-700";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">자산 추이(마켓 손익)</div>
          <div className="mt-1 text-sm text-zinc-600">
            거래 기준으로만 계산한 누적 손익이야. (매수: -총액, 매도: +정산금)
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            value={days}
            onChange={(e) => setDays(clamp(parseInt(e.target.value, 10) || 14, 1, 90))}
            disabled={busy}
          >
            <option value={7}>최근 7일</option>
            <option value={14}>최근 14일</option>
            <option value={30}>최근 30일</option>
            <option value={60}>최근 60일</option>
          </select>
          <button
            className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
            disabled={busy}
            onClick={() => void refresh(days)}
          >
            새로고침
          </button>
        </div>
      </div>

      {error ? (
        <pre className="mt-4 overflow-auto rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          {JSON.stringify(error, null, 2)}
        </pre>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="text-[11px] font-semibold text-zinc-600">누적 손익</div>
          <div className={`mt-1 text-lg font-semibold ${tone}`}>{fmtInt(total)}G</div>
          <div className="text-[11px] text-zinc-600">거래 {fmtInt(data?.summary?.txs ?? 0)}건</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="text-[11px] font-semibold text-zinc-600">오늘(마지막 일자) 변화</div>
          <div className="mt-1 text-lg font-semibold">{fmtInt(lastDelta)}G</div>
          <div className="text-[11px] text-zinc-600">평균/일 {fmtInt(data?.summary?.avgDaily ?? 0)}G</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="text-[11px] font-semibold text-zinc-600">범위</div>
          <div className="mt-1 text-sm font-semibold">
            {fmtInt(min)}G ~ {fmtInt(max)}G
          </div>
          <div className="text-[11px] text-zinc-600">누적 손익 기준</div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold">누적 손익 그래프</div>
        <div className="p-4">
          {series.length <= 1 ? (
            <div className="text-sm text-zinc-500">거래가 쌓이면 그래프가 그려져.</div>
          ) : (
            <svg viewBox={`0 0 ${w} ${h}`} className="h-[160px] w-full">
              <rect x="0" y="0" width={w} height={h} rx="12" fill="#fafafa" />
              <path d={path} fill="none" stroke="#18181b" strokeWidth="2.5" />
            </svg>
          )}
          <div className="mt-2 text-[11px] text-zinc-500">
            이 그래프는 “마켓 거래 기준” 손익만 보여줘. 추후 인벤 가치(평균단가)까지 합쳐 순자산 추정치로 확장 가능.
          </div>
        </div>
      </div>

      {data?.points?.length ? (
        <details className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900">일자별 상세</summary>
          <div className="mt-3 grid gap-2">
            {data.points.slice(-14).map((p) => (
              <div key={p.day} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                <div className="font-mono text-zinc-700">{p.day}</div>
                <div className="text-zinc-700">Δ {fmtInt(p.delta)}G</div>
                <div className="font-semibold text-zinc-900">누적 {fmtInt(p.cumulative)}G</div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

