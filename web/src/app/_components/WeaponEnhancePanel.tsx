"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { EnhanceItemBurst, type EnhanceBurstVariant } from "@/app/_components/EnhanceItemBurst";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { weaponEnhanceMaxLevelForGrade } from "@/shared/weaponEnhanceLimits";
import {
  enhanceScrollQtyAtOrAboveTier,
  ENHANCE_SCROLL_ITEM_IDS,
  resolveWeaponUpgradeDeductions,
  weaponUpgradeCostForNextLevel,
} from "@/server/weaponUpgradeRules";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { apiGetJson, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";

type MeState = {
  ok: true;
  wallet: { goldAvailable: number; goldLocked: number };
  inventory: Array<{ itemId: string; name: string; quantity: number }>;
  weaponInstances?: WeaponRow[];
};

type WeaponRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  createdAt: string;
  grade?: number;
  gradeLabel?: string;
  options?: Array<{ kind: string; label: string; tier: number; tierLabel: string; displayValue: number }>;
};

type WeaponSortId = "newest" | "oldest" | "name_az" | "enh_high" | "enh_low";

const SCROLL_ITEM_IDS = [
  "item_enhance_scroll_low",
  "item_enhance_scroll_mid",
  "item_enhance_scroll_high",
] as const;

async function getJson<T>(url: string): Promise<T> {
  return apiGetJson<T>(url);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiPostJson<T>(url, body);
}

function fmtInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return Math.round(x).toLocaleString();
}

function compareLocaleKo(a: string, b: string) {
  return a.localeCompare(b, "ko", { sensitivity: "base" });
}

function sortWeapons(rows: WeaponRow[], by: WeaponSortId): WeaponRow[] {
  const out = rows.slice();
  const tie = (a: WeaponRow, b: WeaponRow) => compareLocaleKo(a.id, b.id);
  const byTime = (a: WeaponRow, b: WeaponRow) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  switch (by) {
    case "oldest":
      out.sort((a, b) => byTime(a, b) || tie(a, b));
      break;
    case "name_az":
      out.sort((a, b) => compareLocaleKo(a.name, b.name) || tie(a, b));
      break;
    case "enh_high":
      out.sort((a, b) => (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0) || byTime(b, a));
      break;
    case "enh_low":
      out.sort((a, b) => (a.enhanceLevel ?? 0) - (b.enhanceLevel ?? 0) || byTime(b, a));
      break;
    default:
      out.sort((a, b) => byTime(b, a) || tie(a, b));
  }
  return out;
}

function friendlyEnhanceError(e: unknown, itemNameById: Map<string, string>): string {
  const err = typeof e === "object" && e !== null && "error" in e ? String((e as { error: unknown }).error) : "";
  if (err === "INSUFFICIENT_GOLD") return "골드가 부족해.";
  if (err === "MAX_WEAPON_LEVEL") return "이 등급 무기의 최대 강화 단계에 도달했어.";
  if (err === "WEAPON_LOCKED") return "거래소 등록 중인 무기는 강화할 수 없어.";
  if (err.startsWith("INSUFFICIENT_MATERIAL:")) {
    const id = err.slice("INSUFFICIENT_MATERIAL:".length);
    return `재료 부족: ${itemNameById.get(id) ?? id}`;
  }
  if (err === "UNAUTHORIZED") return "로그인이 필요해. 화면 오른쪽 위에서 로그인해 주세요.";
  if (err) return err;
  return typeof e === "string" ? e : "강화에 실패했어.";
}

function nextUpgradeInfo(enhanceLevel: number, grade: number, itemNameById: Map<string, string>) {
  const cur = Math.max(0, Math.floor(enhanceLevel));
  const max = weaponEnhanceMaxLevelForGrade(grade);
  if (cur >= max) return { atMax: true as const, cost: null, label: `최대 +${max} 달성` };
  try {
    const cost = weaponUpgradeCostForNextLevel(cur);
    return { atMax: false as const, cost, label: `+${cur + 1} 강화` };
  } catch {
    return { atMax: false as const, cost: null, label: `+${cur + 1} 강화` };
  }
}

type UpgradeApiOk = {
  ok: true;
  weaponInstanceId: string;
  success: boolean;
  from: number;
  to: number;
  successRate: number;
};

type EnhanceMotionState = {
  weaponId: string;
  baseItemId: string;
  fromLevel: number;
  toLevel: number;
  variant: EnhanceBurstVariant;
};

function validateEnhanceAfford(input: {
  enhanceLevel: number;
  grade: number;
  goldAvailable: number;
  materialQty: (itemId: string) => number;
  itemNames: Map<string, string>;
}): string | null {
  const cur = Math.max(0, Math.floor(input.enhanceLevel));
  const max = weaponEnhanceMaxLevelForGrade(input.grade);
  if (cur >= max) return "이 등급 무기의 최대 강화 단계에 도달했어.";

  let cost;
  try {
    cost = weaponUpgradeCostForNextLevel(cur);
  } catch {
    return "이 등급 무기의 최대 강화 단계에 도달했어.";
  }

  if (input.goldAvailable < cost.gold) return "골드가 부족해.";
  const deductions = resolveWeaponUpgradeDeductions(cost.materials, input.materialQty);
  if (!deductions) {
    const missing = cost.materials.find(
      (m) => enhanceScrollQtyAtOrAboveTier(m.itemId, input.materialQty) < m.quantity,
    ) ?? cost.materials[0];
    if (missing) return `재료 부족: ${input.itemNames.get(missing.itemId) ?? missing.itemId}`;
  }
  return null;
}

export function WeaponEnhancePanel({ embedded = false }: EmbeddedPanelProps = {}) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [me, setMe] = useState<MeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [enhanceMotion, setEnhanceMotion] = useState<EnhanceMotionState | null>(null);
  const [enhanceOutcome, setEnhanceOutcome] = useState<{
    variant: EnhanceBurstVariant;
    from: number;
    to: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<WeaponSortId>("enh_high");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pendingEnhanceRef = useRef<EnhanceMotionState | null>(null);
  const enhanceRunInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!user) {
      setMe(null);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await getJson<MeState>("/api/me/state");
      setMe(r);
    } catch (e) {
      setMe(null);
      if (!isUnauthorizedError(e)) setError(friendlyEnhanceError(e, new Map()));
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    if (sessionLoading) return;
    void load();
  }, [load, sessionLoading]);

  useEffect(() => {
    if (!embedded) return;
    const onFrameRefresh = () => void load();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
  }, [embedded, load]);

  const nameById = useMemo(() => new Map((me?.inventory ?? []).map((x) => [x.itemId, x.name])), [me]);

  const stackQty = useCallback(
    (itemId: string) => me?.inventory?.find((x) => x.itemId === itemId)?.quantity ?? 0,
    [me],
  );

  const materialQty = useCallback(
    (itemId: string) => {
      if (ENHANCE_SCROLL_ITEM_IDS.includes(itemId as (typeof ENHANCE_SCROLL_ITEM_IDS)[number])) {
        return enhanceScrollQtyAtOrAboveTier(itemId, stackQty);
      }
      return stackQty(itemId);
    },
    [stackQty],
  );

  const weapons = useMemo(() => {
    const rows = (me?.weaponInstances ?? []) as WeaponRow[];
    const qq = q.trim().toLowerCase();
    const filtered = rows.filter((w) => {
      if (!qq) return true;
      return w.name.toLowerCase().includes(qq) || w.id.toLowerCase().includes(qq) || w.baseItemId.toLowerCase().includes(qq);
    });
    return sortWeapons(filtered, sort);
  }, [me, q, sort]);

  useEffect(() => {
    if (weapons.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !weapons.some((w) => w.id === selectedId)) {
      setSelectedId(weapons[0]!.id);
    }
  }, [weapons, selectedId]);

  const selected = useMemo(() => weapons.find((w) => w.id === selectedId) ?? null, [weapons, selectedId]);

  const onEnhanceMotionComplete = useCallback(() => {
    setEnhanceMotion(null);
    pendingEnhanceRef.current = null;
    window.setTimeout(() => setEnhanceOutcome(null), 2200);
  }, []);

  const runEnhance = useCallback(
    async (weapon: WeaponRow) => {
      if (enhanceRunInFlightRef.current || enhanceMotion) return;

      const affordErr = validateEnhanceAfford({
        enhanceLevel: weapon.enhanceLevel ?? 0,
        grade: weapon.grade ?? 1,
        goldAvailable: me?.wallet?.goldAvailable ?? 0,
        materialQty: stackQty,
        itemNames: nameById,
      });
      if (affordErr) {
        setError(affordErr);
        return;
      }

      enhanceRunInFlightRef.current = true;
      setBusy(true);
      setError(null);
      setEnhanceOutcome(null);
      setEnhanceMotion(null);

      try {
        const r = await postJson<UpgradeApiOk>("/api/inventory/weapon-instance/upgrade", {
          weaponInstanceId: weapon.id,
        });
        if (!r?.ok) throw r;

        await load();

        const variant: EnhanceBurstVariant = r.success ? "success" : "fail";
        const payload: EnhanceMotionState = {
          weaponId: weapon.id,
          baseItemId: weapon.baseItemId,
          fromLevel: r.from,
          toLevel: r.to,
          variant,
        };
        pendingEnhanceRef.current = payload;
        setEnhanceMotion(payload);
        setEnhanceOutcome({ variant, from: r.from, to: r.to });
      } catch (e) {
        setError(friendlyEnhanceError(e, nameById));
      } finally {
        enhanceRunInFlightRef.current = false;
        setBusy(false);
      }
    },
    [enhanceMotion, load, me?.wallet?.goldAvailable, nameById, stackQty],
  );

  const selectedMax = selected ? weaponEnhanceMaxLevelForGrade(selected.grade ?? 1) : 0;
  const upgrade = selected ? nextUpgradeInfo(selected.enhanceLevel ?? 0, selected.grade ?? 1, nameById) : null;
  const motionBusy = !!enhanceMotion;
  const canAfford =
    selected && me
      ? validateEnhanceAfford({
          enhanceLevel: selected.enhanceLevel ?? 0,
          grade: selected.grade ?? 1,
          goldAvailable: me.wallet.goldAvailable,
          materialQty: stackQty,
          itemNames: nameById,
        }) == null
      : false;

  const displayFrom = enhanceOutcome?.from ?? selected?.enhanceLevel ?? 0;
  const displayTo = enhanceOutcome
    ? enhanceOutcome.to
    : upgrade?.atMax
      ? displayFrom
      : displayFrom + 1;
  const showLevelArrow =
    !upgrade?.atMax &&
    (enhanceOutcome == null ||
      (enhanceOutcome.variant === "success" && enhanceOutcome.to > enhanceOutcome.from));

  return (
    <>
    <GamePanel className={`enhance-forge ${embedded ? "enhance-forge--fit panel-fit" : ""}`}>
      {!embedded ? (
        <div className="enhance-forge__resources">
          <div className="enhance-forge__resource enhance-forge__resource--gold">
            <span className="enhance-forge__resource-label">보유 골드</span>
            <span className="enhance-forge__resource-val">{me ? `${fmtInt(me.wallet.goldAvailable)} G` : "…"}</span>
          </div>
          {SCROLL_ITEM_IDS.map((itemId) => (
            <div key={itemId} className="enhance-forge__resource">
              <span className="enhance-forge__resource-label">{nameById.get(itemId) ?? itemId}</span>
              <span className="enhance-forge__resource-val">{fmtInt(materialQty(itemId))}</span>
            </div>
          ))}
          <GameBtn variant="ghost" disabled={busy || motionBusy} onClick={() => void load()}>
            {busy ? "…" : "새로고침"}
          </GameBtn>
        </div>
      ) : (
        <div className="enhance-forge__resources enhance-forge__resources--compact">
          {SCROLL_ITEM_IDS.map((itemId) => (
            <div key={itemId} className="enhance-forge__resource">
              <span className="enhance-forge__resource-label">{nameById.get(itemId) ?? itemId}</span>
              <span className="enhance-forge__resource-val">{fmtInt(materialQty(itemId))}</span>
            </div>
          ))}
        </div>
      )}

      {error ? <div className="market-alert market-alert--error">{error}</div> : null}

      {!embedded && sessionLoading ? (
        <GamePanelLoading label="세션 확인 중…" />
      ) : !embedded && !user ? (
        <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
      ) : (embedded || user) ? (
      <>
      <div className={`enhance-forge__layout ${embedded ? "enhance-forge__layout--fit" : ""}`}>
        <aside className="enhance-forge__list-panel">
          <div className="enhance-forge__toolbar">
            <input
              className="market-input market-input--search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="무기 검색…"
            />
            <select className="market-input market-input--select" value={sort} onChange={(e) => setSort(e.target.value as WeaponSortId)}>
              <option value="enh_high">강화 높은 순</option>
              <option value="enh_low">강화 낮은 순</option>
              <option value="newest">최신 획득</option>
              <option value="oldest">오래된 순</option>
              <option value="name_az">이름순</option>
            </select>
          </div>

          <div className="enhance-forge__list">
            {weapons.length === 0 ? (
              <p className="market-empty">강화할 무기가 없어요.</p>
            ) : (
              weapons.map((w) => {
                const lv = w.enhanceLevel ?? 0;
                const cap = weaponEnhanceMaxLevelForGrade(w.grade ?? 1);
                const active = w.id === selectedId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={`enhance-forge__pick ${active ? "enhance-forge__pick--active" : ""}`}
                    onClick={() => setSelectedId(w.id)}
                  >
                    <ItemIcon itemId={w.baseItemId} size={40} className="item-icon shrink-0" />
                    <div className="min-w-0 flex-1 text-left">
                      <div className={`truncate text-sm font-bold ${itemGradeNameClassName(w.grade ?? 1)}`}>
                        {w.name}
                        {lv > 0 ? <span className="text-[var(--game-muted)]"> +{lv}</span> : null}
                      </div>
                      <div className="enhance-forge__pick-bar">
                        <div className="enhance-forge__pick-fill" style={{ width: `${Math.min(100, cap > 0 ? (lv / cap) * 100 : 0)}%` }} />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="enhance-forge__detail">
          {!selected ? (
            <p className="market-empty">왼쪽에서 무기를 선택하세요.</p>
          ) : (
            <>
              <div
                className={`enhance-forge__hero${enhanceOutcome?.variant === "success" ? " enhance-forge__hero--success" : ""}${enhanceOutcome?.variant === "fail" ? " enhance-forge__hero--fail" : ""}${enhanceMotion?.weaponId === selected.id ? " enhance-forge__hero--enhancing" : ""}`.trim()}
              >
                <EnhanceItemBurst
                  active={enhanceMotion?.weaponId === selected.id}
                  variant={enhanceMotion?.variant ?? "success"}
                  className="enhance-forge__hero-burst"
                  onComplete={onEnhanceMotionComplete}
                >
                  <ItemIcon itemId={selected.baseItemId} size={88} className="item-icon enhance-forge__hero-icon" />
                </EnhanceItemBurst>
                <div className="enhance-forge__hero-info">
                  <p className="game-label">강화 대상</p>
                  <h3 className={`enhance-forge__hero-name ${itemGradeNameClassName(selected.grade ?? 1)}`}>
                    {selected.name}
                  </h3>
                  <p className="enhance-forge__hero-level">
                    <span className="enhance-forge__level-now">+{displayFrom}</span>
                    {showLevelArrow ? (
                      <>
                        <span className="enhance-forge__level-arrow">→</span>
                        <span
                          className={
                            enhanceOutcome?.variant === "fail"
                              ? "enhance-forge__level-next enhance-forge__level-next--fail"
                              : "enhance-forge__level-next"
                          }
                        >
                          +{displayTo}
                        </span>
                      </>
                    ) : null}
                  </p>
                  {enhanceOutcome?.variant === "success" ? (
                    <p className="enhance-forge__success-msg" role="status">
                      강화 성공!
                    </p>
                  ) : null}
                  {enhanceOutcome?.variant === "fail" ? (
                    <p className="enhance-forge__fail-msg" role="status">
                      강화 실패… 재료는 소모됐어요.
                    </p>
                  ) : null}
                  <div className="enhance-forge__level-track">
                    <div
                      className="enhance-forge__level-fill"
                      style={{ width: `${Math.min(100, selectedMax > 0 ? ((selected.enhanceLevel ?? 0) / selectedMax) * 100 : 0)}%` }}
                    />
                  </div>
                  <p className="enhance-forge__hero-meta">
                    {selected.gradeLabel ?? ""} · 최대 +{selectedMax}
                  </p>
                </div>
              </div>

              {(selected.options?.length ?? 0) > 0 ? (
                <div className="enhance-forge__options">
                  {(selected.options ?? []).map((op, i) => (
                    <span key={`${op.kind}-${i}`} className="enhance-forge__option-chip">
                      <span className="font-semibold">{op.tierLabel}</span> {op.label}{" "}
                      <span className="tabular-nums">
                        {op.displayValue >= 0 ? "+" : ""}
                        {op.displayValue}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="enhance-forge__cost-panel">
                <p className="enhance-forge__cost-title">{upgrade?.atMax ? upgrade.label : `${upgrade?.label ?? "다음 강화"} 비용`}</p>
                {upgrade?.atMax ? (
                  <p className="enhance-forge__cost-hint">이 무기는 더 이상 강화할 수 없어요.</p>
                ) : upgrade?.cost ? (
                  <ul className="enhance-forge__cost-list">
                    <li>
                      <span>골드</span>
                      <span className="enhance-forge__cost-gold">{fmtInt(upgrade.cost.gold)} G</span>
                    </li>
                    <li>
                      <span>성공 확률</span>
                      <span
                        className={
                          upgrade.cost.successRate >= 70
                            ? "enhance-forge__rate-ok"
                            : upgrade.cost.successRate >= 40
                              ? "enhance-forge__rate-mid"
                              : "enhance-forge__rate-low"
                        }
                      >
                        {upgrade.cost.successRate}%
                      </span>
                    </li>
                    {upgrade.cost.materials.map((m) => (
                      <li key={m.itemId}>
                        <span>{nameById.get(m.itemId) ?? m.itemId}</span>
                        <span className={materialQty(m.itemId) >= m.quantity ? "" : "enhance-forge__cost-warn"}>
                          {fmtInt(materialQty(m.itemId))} / {fmtInt(m.quantity)}
                          {ENHANCE_SCROLL_ITEM_IDS.includes(m.itemId as (typeof ENHANCE_SCROLL_ITEM_IDS)[number])
                            ? " (상위 주문서 가능)"
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <button
                type="button"
                className="enhance-forge__action"
                disabled={!!busy || motionBusy || upgrade?.atMax || !canAfford}
                onClick={() => selected && void runEnhance(selected)}
              >
                {busy ? "확인 중…" : motionBusy ? "연출 중…" : upgrade?.atMax ? "최대 강화" : "강화하기"}
              </button>
            </>
          )}
        </div>
      </div>
      </>
      ) : null}
    </GamePanel>
    </>
  );
}
