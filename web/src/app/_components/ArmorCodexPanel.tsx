"use client";

import { useCallback, useEffect, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { itemGradeFrameClassName, itemGradeNameClassName } from "@/server/itemGrade";
import { apiGetJsonCached, apiPostJson } from "@/shared/sessionClient";
import { formatPanelError } from "@/shared/formatPanelError";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import { API_CACHE_TTL } from "@/shared/apiCache";
import {
  armorCodexBuffLabel,
  type ArmorCodexEntryView,
  type ArmorCodexTotals,
} from "@/shared/armorCodex";
import { CODEX_BUFF_RATIO } from "@/shared/weaponCodex";

type RegisterableArmor = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  quality: number;
  itemLevel: number;
  milestoneId: string;
  milestoneLabel: string;
  grade?: number;
  gradeLabel?: string;
  iconSrc?: string;
  previewBuff: { bonusPower: number; bonusHpMilli: number; bonusDefMilli: number };
};

type CodexPayload = {
  ok: true;
  catalog: ArmorCodexEntryView[];
  totals: ArmorCodexTotals;
  registerableArmors: RegisterableArmor[];
};

function claimKey(instanceId: string, milestoneId: string) {
  return `${instanceId}:${milestoneId}`;
}

export function ArmorCodexPanel() {
  const [data, setData] = useState<CodexPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetJsonCached<CodexPayload>("/api/codex/armor", {
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

  const register = async (armorInstanceId: string, milestoneId: string) => {
    const key = claimKey(armorInstanceId, milestoneId);
    setBusyKey(key);
    setMessage(null);
    setError(null);
    try {
      const res = await apiPostJson<{
        ok: boolean;
        error?: string;
        name?: string;
        milestoneLabel?: string;
      }>("/api/codex/armor/register", { armorInstanceId, milestoneId });
      if (!res.ok) throw new Error(res.error ?? "REGISTER_FAILED");
      setMessage(
        `${res.name ?? "방어구"} · ${res.milestoneLabel ?? "도감"} 등록 완료. 영구 버프가 적용되었습니다.`,
      );
      await load();
      window.dispatchEvent(new Event(GAME_FRAME_REFRESH_EVENT));
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setBusyKey(null);
    }
  };

  if (loading && !data) return <GamePanelLoading label="방어구 도감 불러오는 중…" />;
  if (error && !data) {
    return (
      <div className="space-y-2">
        <GamePanelError error={error} />
        <GameBtn variant="ghost" onClick={() => void load()}>
          다시 시도
        </GameBtn>
      </div>
    );
  }

  const totals = data?.totals;
  const catalog = data?.catalog ?? [];
  const registerable = data?.registerableArmors ?? [];

  return (
    <div className="space-y-3">
      <GamePanel className="p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--game-text)]">방어구 도감</h3>
            <p className="mt-1 text-[11px] text-[var(--game-muted)]">
              종류·단계별로 등록하면 HP·DEF·전투력 영구 버프가 누적됩니다. 기본 등록은 스탯의{" "}
              {Math.round(CODEX_BUFF_RATIO * 100)}%, 제련·품질·레벨·옵션 수치(예: HP 10% 이상) 단계는 베이스 스탯의
              8~18%입니다. 등록 시 해당 방어구는 소모됩니다.
            </p>
          </div>
          {totals ? (
            <div className="rounded-md border border-[var(--game-border)] bg-black/25 px-2.5 py-1.5 text-right">
              <div className="text-[10px] font-semibold text-[var(--game-muted)]">
                수집 {totals.registeredCount}/{totals.totalCount} ({totals.completionPct}%)
              </div>
              <div className="text-xs font-bold text-[var(--game-gold-bright)]">{armorCodexBuffLabel(totals)}</div>
            </div>
          ) : null}
        </div>
      </GamePanel>

      {message ? <GamePanelInfo>{message}</GamePanelInfo> : null}
      {error ? <GamePanelError error={error} /> : null}

      <GamePanel className="p-3">
        <h4 className="mb-2 text-xs font-bold text-[var(--game-text)]">도감 목록</h4>
        <div className="space-y-2">
          {catalog.map((entry) => {
            const expanded = expandedId === entry.baseItemId;
            const pct =
              entry.totalMilestones > 0
                ? Math.round((entry.registeredMilestoneCount / entry.totalMilestones) * 100)
                : 0;
            return (
              <div
                key={entry.baseItemId}
                className={`rounded-md border ${
                  entry.registeredMilestoneCount > 0
                    ? "border-[var(--game-gold)]/40 bg-[var(--game-gold)]/5"
                    : "border-[var(--game-border)] bg-black/20"
                }`}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 p-2 text-left"
                  onClick={() => setExpandedId(expanded ? null : entry.baseItemId)}
                >
                  <ItemIcon
                    itemId={entry.baseItemId}
                    iconSrc={entry.iconSrc}
                    size={40}
                    className={itemGradeFrameClassName(entry.grade ?? 1)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-xs font-bold ${itemGradeNameClassName(entry.grade ?? 1)}`}>
                      {entry.name}
                    </div>
                    <div className="text-[10px] text-[var(--game-muted)]">
                      {entry.slotLabel} · {entry.registeredMilestoneCount}/{entry.totalMilestones} 단계 ({pct}%)
                      {entry.registeredMilestoneCount > 0 ? ` · ${armorCodexBuffLabel(entry.buff)}` : ""}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--game-muted)]">{expanded ? "▲" : "▼"}</span>
                </button>
                {expanded ? (
                  <div className="grid gap-1 border-t border-[var(--game-border)]/60 p-2 sm:grid-cols-2">
                    {entry.milestones.map((m) => (
                      <div
                        key={m.milestoneId}
                        className={`rounded px-2 py-1.5 text-[10px] ${
                          m.registered ? "bg-[var(--game-gold)]/15" : "bg-black/25"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-[var(--game-text)]">{m.label}</span>
                          <span
                            className={
                              m.registered ? "text-[var(--game-gold-bright)]" : "text-[var(--game-muted)]"
                            }
                          >
                            {m.registered ? "완료" : "—"}
                          </span>
                        </div>
                        <div className="text-[var(--game-muted)]">{m.description}</div>
                        <div className="text-[var(--game-gold-bright)]">
                          {m.registered
                            ? armorCodexBuffLabel(m.buff)
                            : `예상 ${armorCodexBuffLabel(m.previewBuff)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </GamePanel>

      <GamePanel className="p-3">
        <h4 className="mb-2 text-xs font-bold text-[var(--game-text)]">등록 가능</h4>
        {registerable.length === 0 ? (
          <p className="text-[11px] text-[var(--game-muted)]">
            조건을 충족한 등록 가능 방어구가 없습니다. (착용·잠금 제외)
          </p>
        ) : (
          <div className="space-y-2">
            {registerable.map((a) => {
              const key = claimKey(a.id, a.milestoneId);
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--game-border)] bg-black/20 p-2"
                >
                  <ItemIcon
                    itemId={a.baseItemId}
                    iconSrc={a.iconSrc}
                    size={36}
                    className={itemGradeFrameClassName(a.grade ?? 1)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-bold ${itemGradeNameClassName(a.grade ?? 1)}`}>
                      {a.name} +{a.enhanceLevel}
                      {a.quality > 0 ? ` · 품질${a.quality}` : ""}
                      {a.itemLevel > 10 ? ` · Lv${a.itemLevel}` : ""}
                    </div>
                    <div className="text-[10px] text-[var(--game-muted)]">단계: {a.milestoneLabel}</div>
                    <div className="text-[10px] text-[var(--game-gold-bright)]">
                      버프: {armorCodexBuffLabel(a.previewBuff)}
                    </div>
                  </div>
                  <GameBtn
                    className="text-xs"
                    disabled={busyKey === key}
                    onClick={() => void register(a.id, a.milestoneId)}
                  >
                    {busyKey === key ? "등록 중…" : "등록"}
                  </GameBtn>
                </div>
              );
            })}
          </div>
        )}
      </GamePanel>
    </div>
  );
}
