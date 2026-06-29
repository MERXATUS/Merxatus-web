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
  CODEX_BUFF_RATIO,
  codexBuffLabel,
  type WeaponCodexEntryView,
  type WeaponCodexTotals,
} from "@/shared/weaponCodex";

type RegisterableWeapon = {
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
  previewBuff: { bonusPower: number; bonusAtkMilli: number; bonusMagicMilli: number };
};

type CodexPayload = {
  ok: true;
  catalog: WeaponCodexEntryView[];
  totals: WeaponCodexTotals;
  registerableWeapons: RegisterableWeapon[];
};

function buffPreviewText(buff: {
  bonusPower: number;
  bonusAtkMilli: number;
  bonusMagicMilli: number;
}) {
  return codexBuffLabel(buff);
}

function claimKey(instanceId: string, milestoneId: string) {
  return `${instanceId}:${milestoneId}`;
}

export function WeaponCodexPanel() {
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
      const res = await apiGetJsonCached<CodexPayload>("/api/codex/weapons", {
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

  const register = async (weaponInstanceId: string, milestoneId: string) => {
    const key = claimKey(weaponInstanceId, milestoneId);
    setBusyKey(key);
    setMessage(null);
    setError(null);
    try {
      const res = await apiPostJson<{
        ok: boolean;
        error?: string;
        name?: string;
        milestoneLabel?: string;
      }>("/api/codex/weapons/register", { weaponInstanceId, milestoneId });
      if (!res.ok) throw new Error(res.error ?? "REGISTER_FAILED");
      setMessage(
        `${res.name ?? "무기"} · ${res.milestoneLabel ?? "도감"} 등록 완료. 영구 버프가 적용되었습니다.`,
      );
      await load();
      window.dispatchEvent(new Event(GAME_FRAME_REFRESH_EVENT));
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setBusyKey(null);
    }
  };

  if (loading && !data) return <GamePanelLoading label="무기 도감 불러오는 중…" />;
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
  const registerable = data?.registerableWeapons ?? [];

  return (
    <div className="space-y-3">
      <GamePanel className="p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--game-text)]">무기 도감</h3>
            <p className="mt-1 text-[11px] text-[var(--game-muted)]">
              종류·단계별로 등록하면 영구 계정 버프가 누적됩니다. 기본 등록은 스탯의{" "}
              {Math.round(CODEX_BUFF_RATIO * 100)}%, 제련·품질·레벨·옵션 수치(예: 물리 공격력 10% 이상) 단계는
              베이스 스탯의 8~18%입니다. 등록 시 해당 무기는 소모됩니다.
            </p>
          </div>
          {totals ? (
            <div className="rounded-md border border-[var(--game-border)] bg-black/25 px-2.5 py-1.5 text-right">
              <div className="text-[10px] font-semibold text-[var(--game-muted)]">
                수집 {totals.registeredCount}/{totals.totalCount} ({totals.completionPct}%)
              </div>
              <div className="text-xs font-bold text-[var(--game-gold-bright)]">{codexBuffLabel(totals)}</div>
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
                      {entry.registeredMilestoneCount}/{entry.totalMilestones} 단계 ({pct}%)
                      {entry.registeredMilestoneCount > 0 ? ` · ${buffPreviewText(entry.buff)}` : ""}
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
                          {m.registered ? buffPreviewText(m.buff) : `예상 ${buffPreviewText(m.previewBuff)}`}
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
            조건을 충족한 등록 가능 무기가 없습니다. (착용·잠금·거래 등록 제외)
          </p>
        ) : (
          <div className="space-y-2">
            {registerable.map((w) => {
              const key = claimKey(w.id, w.milestoneId);
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--game-border)] bg-black/20 p-2"
                >
                  <ItemIcon
                    itemId={w.baseItemId}
                    iconSrc={w.iconSrc}
                    size={36}
                    className={itemGradeFrameClassName(w.grade ?? 1)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-bold ${itemGradeNameClassName(w.grade ?? 1)}`}>
                      {w.name} +{w.enhanceLevel}
                      {w.quality > 0 ? ` · 품질${w.quality}` : ""}
                      {w.itemLevel > 10 ? ` · Lv${w.itemLevel}` : ""}
                    </div>
                    <div className="text-[10px] text-[var(--game-muted)]">단계: {w.milestoneLabel}</div>
                    <div className="text-[10px] text-[var(--game-gold-bright)]">
                      버프: {buffPreviewText(w.previewBuff)}
                    </div>
                  </div>
                  <GameBtn
                    className="text-xs"
                    disabled={busyKey === key}
                    onClick={() => void register(w.id, w.milestoneId)}
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
