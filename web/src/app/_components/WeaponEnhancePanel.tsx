"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { EnhanceMotionOverlay } from "@/app/_components/EnhanceMotionOverlay";
import { EnhanceReveal } from "@/app/_components/EnhanceReveal";
import { GameBtn, GamePanel } from "@/app/_components/gameUi";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { weaponEnhanceMaxLevel, weaponUpgradeCostForNextLevel } from "@/server/weaponUpgradeRules";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { apiGetJson, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";

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
  if (err === "MAX_WEAPON_LEVEL") return "이미 최대 강화 단계야.";
  if (err === "WEAPON_LOCKED") return "거래소 등록 중인 무기는 강화할 수 없어.";
  if (err.startsWith("INSUFFICIENT_MATERIAL:")) {
    const id = err.slice("INSUFFICIENT_MATERIAL:".length);
    return `재료 부족: ${itemNameById.get(id) ?? id}`;
  }
  if (err === "UNAUTHORIZED") return "로그인이 필요해. 화면 오른쪽 위에서 로그인해 주세요.";
  if (err) return err;
  return typeof e === "string" ? e : "강화에 실패했어.";
}

function nextUpgradeInfo(enhanceLevel: number, itemNameById: Map<string, string>) {
  const cur = Math.max(0, Math.floor(enhanceLevel));
  const max = weaponEnhanceMaxLevel();
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
  from: number;
  to: number;
};

type EnhanceMotionState = {
  weaponId: string;
  weaponName: string;
  baseItemId: string;
  fromLevel: number;
  toLevel: number;
};

type EnhanceRevealState = {
  weaponName: string;
  baseItemId: string;
  fromLevel: number;
  toLevel: number;
};

export function WeaponEnhancePanel() {
  const { user, loading: sessionLoading } = useSessionUser();
  const [me, setMe] = useState<MeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [enhanceMotion, setEnhanceMotion] = useState<EnhanceMotionState | null>(null);
  const [enhanceReveal, setEnhanceReveal] = useState<EnhanceRevealState | null>(null);
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

  const nameById = useMemo(() => new Map((me?.inventory ?? []).map((x) => [x.itemId, x.name])), [me]);

  const materialQty = useCallback(
    (itemId: string) => me?.inventory?.find((x) => x.itemId === itemId)?.quantity ?? 0,
    [me],
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

  const maxLevel = weaponEnhanceMaxLevel();

  function startEnhanceMotion(weapon: WeaponRow) {
    const fromLevel = Math.max(0, Math.floor(weapon.enhanceLevel ?? 0));
    if (fromLevel >= maxLevel) return;
    const payload: EnhanceMotionState = {
      weaponId: weapon.id,
      weaponName: weapon.name,
      baseItemId: weapon.baseItemId,
      fromLevel,
      toLevel: fromLevel + 1,
    };
    pendingEnhanceRef.current = payload;
    setEnhanceMotion(payload);
    setError(null);
  }

  const onEnhanceMotionComplete = useCallback(async () => {
    if (enhanceRunInFlightRef.current) return;
    const m = pendingEnhanceRef.current;
    if (!m) return;
    enhanceRunInFlightRef.current = true;
    pendingEnhanceRef.current = null;
    setEnhanceMotion(null);
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<UpgradeApiOk>("/api/inventory/weapon-instance/upgrade", {
        weaponInstanceId: m.weaponId,
      });
      if (!r?.ok) throw r;
      setEnhanceReveal({
        weaponName: m.weaponName,
        baseItemId: m.baseItemId,
        fromLevel: r.from,
        toLevel: r.to,
      });
      await load();
    } catch (e) {
      setError(friendlyEnhanceError(e, nameById));
    } finally {
      enhanceRunInFlightRef.current = false;
      setBusy(false);
    }
  }, [load, nameById]);

  const upgrade = selected ? nextUpgradeInfo(selected.enhanceLevel ?? 0, nameById) : null;
  const motionBusy = !!enhanceMotion || enhanceRunInFlightRef.current;

  return (
    <>
    <GamePanel className="enhance-forge">
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

      {error ? <div className="market-alert market-alert--error">{error}</div> : null}

      {sessionLoading ? (
        <GamePanelLoading label="세션 확인 중…" />
      ) : !user ? (
        <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
      ) : (
      <>
      <div className="enhance-forge__layout">
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
                        <div className="enhance-forge__pick-fill" style={{ width: `${Math.min(100, (lv / maxLevel) * 100)}%` }} />
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
              <div className="enhance-forge__hero">
                <ItemIcon itemId={selected.baseItemId} size={88} className="item-icon enhance-forge__hero-icon" />
                <div className="enhance-forge__hero-info">
                  <p className="game-label">강화 대상</p>
                  <h3 className={`enhance-forge__hero-name ${itemGradeNameClassName(selected.grade ?? 1)}`}>
                    {selected.name}
                  </h3>
                  <p className="enhance-forge__hero-level">
                    <span className="enhance-forge__level-now">+{selected.enhanceLevel ?? 0}</span>
                    {!upgrade?.atMax ? (
                      <>
                        <span className="enhance-forge__level-arrow">→</span>
                        <span className="enhance-forge__level-next">+{(selected.enhanceLevel ?? 0) + 1}</span>
                      </>
                    ) : null}
                  </p>
                  <div className="enhance-forge__level-track">
                    <div
                      className="enhance-forge__level-fill"
                      style={{ width: `${Math.min(100, ((selected.enhanceLevel ?? 0) / maxLevel) * 100)}%` }}
                    />
                  </div>
                  <p className="enhance-forge__hero-meta">
                    {selected.gradeLabel ?? ""} · 최대 +{maxLevel}
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
                    {upgrade.cost.materials.map((m) => (
                      <li key={m.itemId}>
                        <span>{nameById.get(m.itemId) ?? m.itemId}</span>
                        <span className={materialQty(m.itemId) >= m.quantity ? "" : "enhance-forge__cost-warn"}>
                          {fmtInt(materialQty(m.itemId))} / {fmtInt(m.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <button
                type="button"
                className="enhance-forge__action"
                disabled={!!busy || motionBusy || upgrade?.atMax}
                onClick={() => selected && startEnhanceMotion(selected)}
              >
                {busy || !!enhanceMotion ? "강화 중…" : upgrade?.atMax ? "최대 강화" : "강화하기"}
              </button>
            </>
          )}
        </div>
      </div>
      </>
      )}
    </GamePanel>

      <EnhanceMotionOverlay
        active={!!enhanceMotion}
        weaponName={enhanceMotion?.weaponName ?? ""}
        fromLevel={enhanceMotion?.fromLevel ?? 0}
        toLevel={enhanceMotion?.toLevel ?? 0}
        onComplete={() => void onEnhanceMotionComplete()}
      />

      {enhanceReveal ? (
        <EnhanceReveal
          weaponName={enhanceReveal.weaponName}
          baseItemId={enhanceReveal.baseItemId}
          fromLevel={enhanceReveal.fromLevel}
          toLevel={enhanceReveal.toLevel}
          onClose={() => setEnhanceReveal(null)}
        />
      ) : null}
    </>
  );
}
