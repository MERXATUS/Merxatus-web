"use client";

import { useCallback, useEffect, useState } from "react";
import { GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelLoading } from "@/app/_components/panelFeedback";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { apiGetJsonCached } from "@/shared/sessionClient";
import { formatPanelError } from "@/shared/formatPanelError";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import { API_CACHE_TTL } from "@/shared/apiCache";
import { setCodexBuffLabel, type SetCodexBuffSlice } from "@/shared/equipmentSetCodex";
import type { SetCodexEntryView } from "@/shared/equipmentSetCodexViews";

type SetCodexPayload = {
  ok: true;
  catalog: SetCodexEntryView[];
  totals: SetCodexBuffSlice & { unlockedTierCount: number };
};

export function SetCodexPanel() {
  const [data, setData] = useState<SetCodexPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetJsonCached<SetCodexPayload>("/api/codex/sets", {
        ttlMs: API_CACHE_TTL.meState,
      });
      if (!res.ok) throw new Error("LOAD_FAILED");
      setData(res);
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onRefresh);
  }, [load]);

  if (loading && !data) return <GamePanelLoading label="세트 도감 불러오는 중…" />;
  if (error && !data) return <GamePanelError error={error} />;

  const totals = data?.totals;
  const catalog = data?.catalog ?? [];

  return (
    <div className="space-y-3">
      <GamePanel className="p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--game-text)]">세트 완성 도감</h3>
            <p className="mt-1 text-[11px] text-[var(--game-muted)]">
              무기·방어구 도감 진행도에 따라 세트 단계 보너스가 자동 해금됩니다. 장비 소모 없이 영구
              적용됩니다.
            </p>
          </div>
          {totals ? (
            <div className="rounded-md border border-[var(--game-border)] bg-black/25 px-2.5 py-1.5 text-right">
              <div className="text-[10px] font-semibold text-[var(--game-muted)]">
                해금 단계 {totals.unlockedTierCount}개
              </div>
              <div className="text-xs font-bold text-[var(--game-gold-bright)]">{setCodexBuffLabel(totals)}</div>
            </div>
          ) : null}
        </div>
      </GamePanel>

      <GamePanel className="p-3">
        <h4 className="mb-2 text-xs font-bold text-[var(--game-text)]">세트 목록</h4>
        <div className="space-y-2">
          {catalog.map((entry) => {
            const expanded = expandedId === entry.setId;
            return (
              <div
                key={entry.setId}
                className={`rounded-md border ${
                  entry.unlockedTierCount > 0
                    ? "border-[var(--game-gold)]/40 bg-[var(--game-gold)]/5"
                    : "border-[var(--game-border)] bg-black/20"
                }`}
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-2 p-2 text-left"
                  onClick={() => setExpandedId(expanded ? null : entry.setId)}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-bold ${itemGradeNameClassName(entry.grade)}`}>
                      {entry.name} 세트
                      <span className="ml-1 text-[10px] font-normal text-[var(--game-muted)]">
                        {entry.realm}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--game-muted)]">{entry.tagline}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--game-gold-bright)]">
                      {entry.registeredSlots}/{entry.totalSlots} ({entry.completionPct}%)
                      {entry.unlockedTierCount > 0 ? ` · ${setCodexBuffLabel(entry.buff)}` : ""}
                    </div>
                    <div className="codex-set-progress mt-1">
                      <div
                        className="codex-set-progress__bar"
                        style={{ width: `${Math.min(100, entry.completionPct)}%` }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-[var(--game-muted)]">{expanded ? "▲" : "▼"}</span>
                </button>
                {expanded ? (
                  <div className="grid gap-1 border-t border-[var(--game-border)]/60 p-2 sm:grid-cols-2">
                    {entry.tiers.map((t) => (
                      <div
                        key={t.tierId}
                        className={`rounded px-2 py-1.5 text-[10px] ${
                          t.unlocked ? "bg-[var(--game-gold)]/15" : "bg-black/25"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-[var(--game-text)]">{t.label}</span>
                          <span
                            className={
                              t.unlocked ? "text-[var(--game-gold-bright)]" : "text-[var(--game-muted)]"
                            }
                          >
                            {t.unlocked ? "해금" : "—"}
                          </span>
                        </div>
                        <div className="text-[var(--game-muted)]">{t.description}</div>
                        <div className="text-[var(--game-gold-bright)]">{setCodexBuffLabel(t.buff)}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </GamePanel>
    </div>
  );
}
