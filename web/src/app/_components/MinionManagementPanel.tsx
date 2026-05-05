"use client";

import { useEffect, useMemo, useState } from "react";
import { itemGradeNameClassName, minionLetterGradeBadgeClassName } from "@/server/itemGrade";
import {
  allowedWeaponKindsLabelForJob,
  canMinionEquipWeapon,
} from "@/shared/minionWeaponRules";

type MinionTraitRow = { type: string; rank: number; xp: number };
type MinionRow = {
  id: string;
  level: number;
  /** S A B C D */
  grade: string;
  jobType: string;
  equippedWeaponInstanceId: string | null;
  equippedWeapon: { id: string; baseItemId: string; name: string; enhanceLevel: number; grade?: number } | null;
  assignedWorkshop?: { workshopId: string; workshopName: string; workshopKind: string } | null;
  traits: MinionTraitRow[];
  nextUpgradeCost: { gold: number; materials: Array<{ itemId: string; quantity: number }> } | null;
  maxLevel?: number;
  nextWeaponUpgradeCost: { gold: number; materials: Array<{ itemId: string; quantity: number }> } | null;
};

type InventoryRow = { itemId: string; name: string; category: string; quantity: number; grade?: number };
type WeaponInstanceRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  createdAt: string;
  grade?: number;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

function getUserIdFromStorage() {
  try {
    return localStorage.getItem("dev_userId") ?? "";
  } catch {
    return "";
  }
}

const jobOptions = [
  { id: "UNASSIGNED", label: "미배정" },
  { id: "MINER", label: "광부" },
  { id: "FISHER", label: "낚시꾼" },
  { id: "LUMBERJACK", label: "나무꾼" },
  { id: "HERBALIST", label: "약초꾼" },
  { id: "BLACKSMITH", label: "대장장이" },
  { id: "JEWELER", label: "세공사" },
  { id: "ALCHEMIST", label: "연금술사" },
  { id: "COOK", label: "요리사" },
  { id: "SCRAPPER", label: "고물상" },
  { id: "WARRIOR", label: "전사" },
  { id: "ARCHER", label: "궁수" },
  { id: "MAGE", label: "마법사" },
] as const;

export function MinionManagementPanel() {
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);
  const [minions, setMinions] = useState<MinionRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [weaponInstances, setWeaponInstances] = useState<WeaponInstanceRow[]>([]);
  /** 미니언별 장비 선택 모달 */
  const [equipModalMinionId, setEquipModalMinionId] = useState<string | null>(null);

  useEffect(() => {
    setUserId(getUserIdFromStorage());
    function onChanged() {
      setUserId(getUserIdFromStorage());
    }
    window.addEventListener("dev_user_changed", onChanged);
    window.addEventListener("storage", onChanged);
    void getJson<{ ok: true; user: { id: string } | null }>("/api/auth/me")
      .then((r) => {
        if (r?.user?.id) {
          try {
            localStorage.setItem("dev_userId", r.user.id);
          } catch {
            /* ignore */
          }
          setUserId(r.user.id);
          window.dispatchEvent(new Event("dev_user_changed"));
        }
      })
      .catch(() => {
        /* 미로그인 */
      });
    return () => {
      window.removeEventListener("dev_user_changed", onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, []);

  async function refresh() {
    try {
      const [ml, me] = await Promise.all([
        getJson<{ ok: boolean; minions: MinionRow[] }>(`/api/minions/list`),
        getJson<{ ok: boolean; inventory: InventoryRow[] }>(`/api/me/state`),
      ]);
      if (ml?.ok) setMinions(ml.minions ?? []);
      if ((me as any)?.ok) {
        setInventory((me as any).inventory ?? []);
        setWeaponInstances((me as any).weaponInstances ?? []);
      }
    } catch (e) {
      setError(e);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const weapons = useMemo(() => weaponInstances, [weaponInstances]);
  const equipModalMinion = useMemo(
    () => (equipModalMinionId ? minions.find((x) => x.id === equipModalMinionId) ?? null : null),
    [equipModalMinionId, minions],
  );

  const eligibleWeaponsForModal = useMemo(() => {
    if (!equipModalMinion) return [];
    return weapons.filter((w) => canMinionEquipWeapon(equipModalMinion.jobType, w.baseItemId));
  }, [weapons, equipModalMinion]);

  const equippedWeaponJobMismatch = useMemo(() => {
    if (!equipModalMinion?.equippedWeapon) return false;
    return !canMinionEquipWeapon(equipModalMinion.jobType, equipModalMinion.equippedWeapon.baseItemId);
  }, [equipModalMinion]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEquipModalMinionId(null);
    }
    if (equipModalMinionId) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [equipModalMinionId]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">미니언 관리</div>
          <div className="text-sm text-zinc-600">등급·직업은 부화 시 정해져. 무기 장착 · 배치 확인</div>
        </div>
        <button
          className="h-9 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
          disabled={!!busy}
          onClick={() => void refresh()}
        >
          새로고침
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          오류: {typeof error === "string" ? error : JSON.stringify(error)}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-xs font-semibold text-zinc-600">강화 재료(인벤)</div>
          <div className="mt-2 grid gap-1 text-sm">
            {["item_stone", "item_ore"].map((id) => {
              const row = inventory.find((x) => x.itemId === id);
              return (
                <div key={id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2">
                  <div className={`text-sm font-semibold ${itemGradeNameClassName(row?.grade ?? 1)}`}>
                    {row?.name ?? id}
                  </div>
                  <div className="text-xs font-semibold text-zinc-600">x{row?.quantity ?? 0}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-zinc-600">내 미니언</div>
        <div className="mt-2 grid gap-2">
          {minions.length === 0 ? (
            <div className="text-sm text-zinc-500">미니언이 없어.</div>
          ) : (
            minions.map((m) => {
              return (
                <div key={m.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        미니언 Lv{m.level}
                        <span className={minionLetterGradeBadgeClassName(m.grade)}>
                          등급 {m.grade ?? "—"}
                        </span>
                        {typeof m.maxLevel === "number" && m.level >= m.maxLevel ? (
                          <span className="text-[11px] font-semibold text-amber-700">만렙</span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">{m.id}</div>
                      {m.assignedWorkshop ? (
                        <div className="mt-2 text-xs text-zinc-600">
                          배치:{" "}
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-800">
                            {m.assignedWorkshop.workshopName}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-zinc-600">
                          배치:{" "}
                          <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-xs font-semibold text-zinc-500">
                            미배치
                          </span>
                        </div>
                      )}
                      <div className="mt-2 text-xs text-zinc-600">
                        직업:{" "}
                        <span className="font-semibold text-zinc-900">
                          {jobOptions.find((x) => x.id === m.jobType)?.label ?? m.jobType}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-zinc-600">
                        무기:{" "}
                        {m.equippedWeapon ? (
                          <>
                            <span className={`font-semibold ${itemGradeNameClassName(m.equippedWeapon.grade ?? 1)}`}>
                              {m.equippedWeapon.name}
                            </span>
                            {m.equippedWeapon.enhanceLevel > 0 ? (
                              <span className="font-semibold text-zinc-700">{` +${m.equippedWeapon.enhanceLevel}`}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="font-semibold text-zinc-900">없음</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="h-9 rounded-xl bg-zinc-900 px-4 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={!!busy}
                        onClick={() => setEquipModalMinionId(m.id)}
                      >
                        장비 착용
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {equipModalMinionId && equipModalMinion ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="equip-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEquipModalMinionId(null);
          }}
        >
          <div
            className="max-h-[min(80vh,560px)] w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
              <div>
                <div id="equip-modal-title" className="text-sm font-semibold text-zinc-900">
                  장비 선택
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  미니언 Lv{equipModalMinion.level} · 직업:{" "}
                  {jobOptions.find((j) => j.id === equipModalMinion.jobType)?.label ?? equipModalMinion.jobType} ·
                  착용 가능: {allowedWeaponKindsLabelForJob(equipModalMinion.jobType)}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  현재{" "}
                  {equipModalMinion.equippedWeapon ? (
                    <span className="font-medium text-zinc-700">{equipModalMinion.equippedWeapon.name}</span>
                  ) : (
                    "미착용"
                  )}
                </div>
                {equippedWeaponJobMismatch ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                    지금 착용 중인 무기는 이 직업과 맞지 않습니다. 착용 해제한 뒤 직업에 맞는 무기를 골라 주세요.
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100"
                onClick={() => setEquipModalMinionId(null)}
              >
                닫기
              </button>
            </div>

            <div className="max-h-[min(60vh,440px)] overflow-y-auto px-2 py-2">
              <button
                type="button"
                className={`mb-1 w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                  !equipModalMinion.equippedWeaponInstanceId
                    ? "border-amber-300 bg-amber-50"
                    : "border-zinc-200 bg-white hover:bg-zinc-50"
                }`}
                disabled={!!busy}
                onClick={async () => {
                  setBusy("equip-weapon");
                  setError(null);
                  try {
                    await postJson("/api/minions/weapon/equip", {
                      minionId: equipModalMinion.id,
                      weaponInstanceId: null,
                    });
                    await refresh();
                    setEquipModalMinionId(null);
                  } catch (err) {
                    setError(err);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <span className="font-semibold text-zinc-800">착용 해제</span>
                <div className="text-[11px] text-zinc-500">무기를 벗깁니다.</div>
              </button>

              {equipModalMinion.jobType === "UNASSIGNED" ? (
                <div className="px-3 py-6 text-center text-sm text-zinc-600">
                  직업이 미배정이면 무기를 착용할 수 없습니다. (착용 해제만 가능)
                </div>
              ) : weapons.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-zinc-500">보유한 무기 인스턴스가 없습니다.</div>
              ) : eligibleWeaponsForModal.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-zinc-600">
                  이 직업이 착용할 수 있는 무기가 인벤에 없습니다. (필요:{" "}
                  {allowedWeaponKindsLabelForJob(equipModalMinion.jobType)})
                </div>
              ) : (
                eligibleWeaponsForModal.map((w) => {
                  const isEquipped = equipModalMinion.equippedWeaponInstanceId === w.id;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      className={`mb-1 w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                        isEquipped
                          ? "border-amber-300 bg-amber-50"
                          : "border-zinc-200 bg-white hover:bg-zinc-50"
                      }`}
                      disabled={!!busy}
                      onClick={async () => {
                        setBusy("equip-weapon");
                        setError(null);
                        try {
                          await postJson("/api/minions/weapon/equip", {
                            minionId: equipModalMinion.id,
                            weaponInstanceId: w.id,
                          });
                          await refresh();
                          setEquipModalMinionId(null);
                        } catch (err) {
                          setError(err);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`font-semibold ${itemGradeNameClassName(w.grade ?? 1)}`}>
                          {w.name}
                          {w.enhanceLevel > 0 ? (
                            <span className="text-zinc-700">{` +${w.enhanceLevel}`}</span>
                          ) : null}
                        </span>
                        {isEquipped ? (
                          <span className="shrink-0 text-[11px] font-bold text-amber-800">착용 중</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-zinc-500">{w.id}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

