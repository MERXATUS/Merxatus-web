"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { MinionEquipBagPanel } from "@/app/_components/MinionEquipBagPanel";
import { MinionEquipDetailPanel } from "@/app/_components/MinionEquipDetailPanel";
import { MinionEquipDoll } from "@/app/_components/MinionEquipDoll";
import { GameBtn, GamePanel, GamePanelTitle } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { isDungeonMinionJob, MINION_JOB_LABEL } from "@/server/minionJobs";
import { MINION_RECRUITED_EVENT, type MinionRecruitedDetail } from "@/shared/minionRecruit";
import {
  armorStackMatchesSlot,
  isArmorEquipSlot,
  isMinionEquipSlotImplemented,
  MINION_EQUIP_SLOTS,
  MINION_EQUIP_SLOTS_ENABLED,
  parseEquipDragPayload,
  type MinionEquipSlotId,
} from "@/shared/minionEquipSlots";
import type { MinionCombatBreakdown } from "@/shared/minionCombatStats";
import type { MinionEquipmentView } from "@/shared/minionEquipSlots";
import { slotToBagCategory, type EquipBagCategory } from "@/shared/minionEquipBag";
import { canMinionEquipWeapon } from "@/shared/minionWeaponRules";
import { MinionStatPanel } from "@/app/_components/MinionStatPanel";

import { useEscapeClose } from "@/shared/useEscapeClose";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { apiGetJson, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";

type EquippedArmorPiece = { itemId: string; name: string; grade?: number } | null;

type MinionTraitRow = { type: string; rank: number; xp: number };
type MinionRow = {
  id: string;
  level: number;
  jobType: string;
  equippedWeaponInstanceId: string | null;
  equippedWeapon: {
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    grade?: number;
  } | null;
  equippedArmor?: {
    helmet: EquippedArmorPiece;
    armor: EquippedArmorPiece;
    pants: EquippedArmorPiece;
    shoes: EquippedArmorPiece;
  };
  combatStats?: MinionCombatBreakdown;
  assignedWorkshop?: { workshopId: string; workshopName: string; workshopKind: string } | null;
  traits: MinionTraitRow[];
};

function buildEquipmentView(m: MinionRow | null): MinionEquipmentView {
  if (!m) return {};
  const view: MinionEquipmentView = {};
  if (m.equippedWeapon) {
    view.weapon = {
      baseItemId: m.equippedWeapon.baseItemId,
      name: m.equippedWeapon.name,
      enhanceLevel: m.equippedWeapon.enhanceLevel,
      grade: m.equippedWeapon.grade,
    };
  }
  const armor = m.equippedArmor;
  if (armor?.helmet) {
    view.helmet = { baseItemId: armor.helmet.itemId, name: armor.helmet.name, enhanceLevel: 0, grade: armor.helmet.grade };
  }
  if (armor?.armor) {
    view.armor = { baseItemId: armor.armor.itemId, name: armor.armor.name, enhanceLevel: 0, grade: armor.armor.grade };
  }
  if (armor?.pants) {
    view.pants = { baseItemId: armor.pants.itemId, name: armor.pants.name, enhanceLevel: 0, grade: armor.pants.grade };
  }
  if (armor?.shoes) {
    view.shoes = { baseItemId: armor.shoes.itemId, name: armor.shoes.name, enhanceLevel: 0, grade: armor.shoes.grade };
  }
  return view;
}

function armorItemIdForSlot(m: MinionRow, slotId: MinionEquipSlotId): string | null {
  const a = m.equippedArmor;
  if (!a) return null;
  if (slotId === "helmet") return a.helmet?.itemId ?? null;
  if (slotId === "armor") return a.armor?.itemId ?? null;
  if (slotId === "pants") return a.pants?.itemId ?? null;
  if (slotId === "shoes") return a.shoes?.itemId ?? null;
  return null;
}

type WeaponInstanceRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  createdAt: string;
  grade?: number;
  icon?: string | null;
  iconSrc?: string;
};

type StackRow = {
  itemId: string;
  name: string;
  quantity: number;
  grade?: number;
  category?: string;
  icon?: string | null;
  iconSrc?: string;
};

type MinionTab = "gather" | "dungeon";

async function getJson<T>(url: string): Promise<T> {
  return apiGetJson<T>(url);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiPostJson<T>(url, body);
}

function jobLabel(jobType: string) {
  return (MINION_JOB_LABEL as Record<string, string>)[jobType] ?? jobType;
}

function slotLabel(slotId: MinionEquipSlotId) {
  return MINION_EQUIP_SLOTS.find((s) => s.id === slotId)?.label ?? slotId;
}

export function MinionManagementPanel(props: { initialTab?: MinionTab } = {}) {
  const { user, loading: sessionLoading } = useSessionUser();
  const [tab, setTab] = useState<MinionTab>(props.initialTab ?? "gather");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [minions, setMinions] = useState<MinionRow[]>([]);
  const [maxGatherOwned, setMaxGatherOwned] = useState(10);
  const [maxDungeonOwned, setMaxDungeonOwned] = useState(10);
  const [weaponInstances, setWeaponInstances] = useState<WeaponInstanceRow[]>([]);
  const [inventoryStacks, setInventoryStacks] = useState<StackRow[]>([]);
  const [equipModeMinionId, setEquipModeMinionId] = useState<string | null>(null);
  const [bagCategory, setBagCategory] = useState<EquipBagCategory>("weapon");
  const [activeSlot, setActiveSlot] = useState<MinionEquipSlotId>("weapon");
  const [notice, setNotice] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const equipMode = equipModeMinionId != null;

  useEffect(() => {
    if (props.initialTab) setTab(props.initialTab);
  }, [props.initialTab]);

  async function refresh() {
    if (!user) return;
    try {
      const [ml, me] = await Promise.all([
        getJson<{ ok: boolean; minions: MinionRow[]; maxGatherOwned?: number; maxDungeonOwned?: number }>(
          "/api/minions/list",
        ),
        getJson<{
          ok: boolean;
          weaponInstances?: WeaponInstanceRow[];
          inventory?: Array<StackRow & { category?: string }>;
        }>("/api/me/state"),
      ]);
      if (ml?.ok) {
        setMinions(ml.minions ?? []);
        setMaxGatherOwned(ml.maxGatherOwned ?? 10);
        setMaxDungeonOwned(ml.maxDungeonOwned ?? 10);
      }
      if (me?.ok) {
        setWeaponInstances(me.weaponInstances ?? []);
        setInventoryStacks(
          (me.inventory ?? []).map((it) => ({
            itemId: it.itemId,
            name: it.name,
            quantity: it.quantity,
            grade: it.grade,
            category: it.category,
            icon: it.icon,
            iconSrc: it.iconSrc,
          })),
        );
      }
    } catch (e) {
      if (!isUnauthorizedError(e)) setError(e);
    } finally {
      setInitialLoading(false);
    }
  }

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setInitialLoading(false);
      setMinions([]);
      setWeaponInstances([]);
      setInventoryStacks([]);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionLoading]);

  useEffect(() => {
    function onRecruited(e: Event) {
      const detail = (e as CustomEvent<MinionRecruitedDetail>).detail;
      if (!detail?.minionId) return;
      void refresh().then(() => {
        setTab(isDungeonMinionJob(detail.jobType) ? "dungeon" : "gather");
        setSelectedId(detail.minionId);
      });
    }
    window.addEventListener(MINION_RECRUITED_EVENT, onRecruited);
    return () => window.removeEventListener(MINION_RECRUITED_EVENT, onRecruited);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gatherMinions = useMemo(
    () => minions.filter((m) => !isDungeonMinionJob(m.jobType)),
    [minions],
  );
  const dungeonMinions = useMemo(
    () => minions.filter((m) => isDungeonMinionJob(m.jobType)),
    [minions],
  );

  const roster = tab === "gather" ? gatherMinions : dungeonMinions;

  const selected = useMemo(
    () => (selectedId ? roster.find((m) => m.id === selectedId) ?? minions.find((m) => m.id === selectedId) ?? null : null),
    [roster, selectedId, minions],
  );

  const equipMinion = useMemo(
    () => (equipModeMinionId ? minions.find((m) => m.id === equipModeMinionId) ?? null : null),
    [equipModeMinionId, minions],
  );

  useEffect(() => {
    if (minions.length === 0) return;
    setTab((prev) => {
      const current = prev === "gather" ? gatherMinions : dungeonMinions;
      if (current.length > 0) return prev;
      if (dungeonMinions.length > 0) return "dungeon";
      if (gatherMinions.length > 0) return "gather";
      return prev;
    });
  }, [minions.length, gatherMinions, dungeonMinions]);

  useEffect(() => {
    if (equipMode) return;
    if (roster.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((cur) => {
      if (cur && roster.some((m) => m.id === cur)) return cur;
      return roster[0]!.id;
    });
  }, [roster, tab, equipMode]);

  const weapons = useMemo(() => weaponInstances, [weaponInstances]);

  const equipmentView = useMemo(
    () => buildEquipmentView(equipMode ? equipMinion : selected),
    [equipMinion, selected, equipMode],
  );

  const detailCombatStats = useMemo(() => {
    const m = equipMode ? equipMinion : selected;
    return m?.combatStats ?? null;
  }, [equipMinion, selected, equipMode]);

  async function equipArmorForMinion(minionId: string, slotId: MinionEquipSlotId, itemId: string | null) {
    if (!isArmorEquipSlot(slotId)) return;
    setBusy("equip-armor");
    setError(null);
    try {
      await postJson("/api/minions/armor/equip", { minionId, slotId, itemId });
      await refresh();
      setNotice(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function unequipActiveSlot() {
    if (!equipMinion) return;
    if (activeSlot === "weapon") {
      await equipWeaponForMinion(equipMinion.id, null);
      return;
    }
    if (isArmorEquipSlot(activeSlot)) {
      await equipArmorForMinion(equipMinion.id, activeSlot, null);
    }
  }

  async function equipWeaponForMinion(minionId: string, weaponInstanceId: string | null) {
    setBusy("equip-weapon");
    setError(null);
    try {
      await postJson("/api/minions/weapon/equip", { minionId, weaponInstanceId });
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  function openEquipMode(minionId: string) {
    setEquipModeMinionId(minionId);
    setSelectedId(minionId);
    setActiveSlot("weapon");
    setBagCategory("weapon");
    setNotice(null);
  }

  const closeEquipMode = useCallback(() => {
    setEquipModeMinionId(null);
    setNotice(null);
  }, []);

  useEscapeClose(equipMode, closeEquipMode);

  async function applyEquipPayload(slotId: MinionEquipSlotId, raw: string) {
    if (!equipMinion) return;
    const payload = parseEquipDragPayload(raw);
    if (!payload) return;

    if (slotId === "weapon") {
      if (payload.kind === "weapon") {
        if (!canMinionEquipWeapon(equipMinion.jobType, payload.baseItemId)) {
          setNotice("이 직업은 해당 무기를 착용할 수 없습니다.");
          return;
        }
        await equipWeaponForMinion(equipMinion.id, payload.weaponInstanceId);
        return;
      }
      setNotice("무기 슬롯에는 무기만 착용할 수 있습니다.");
      return;
    }

    if (payload.kind === "stack" && armorStackMatchesSlot(slotId, payload.itemId)) {
      if (!isMinionEquipSlotImplemented(slotId) || !isArmorEquipSlot(slotId)) {
        setNotice(`${slotLabel(slotId)} 착용 기능은 곧 추가됩니다.`);
        return;
      }
      await equipArmorForMinion(equipMinion.id, slotId, payload.itemId);
      return;
    }
    setNotice("이 슬롯에 맞지 않는 장비입니다.");
  }

  const detailMinion = equipMode ? equipMinion : selected;

  return (
    <GamePanel className={`minion-shell ${equipMode ? "minion-shell--equip" : ""}`}>
      <div className="minion-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <GamePanelTitle hint={equipMode ? "왼쪽 가방 · 오른쪽 착용 슬롯" : "수집·던전 탭으로 분리"}>
              {equipMode ? "장비 착용" : "미니언 관리"}
            </GamePanelTitle>
            <p className="mt-1 text-xs text-[var(--game-muted)]">
              {equipMode
                ? `${detailMinion ? jobLabel(detailMinion.jobType) : ""} — 슬롯 선택 후 왼쪽에서 장비를 고르세요`
                : "등급·직업은 고용 시 확정 · 장비는 슬롯에서 착용"}
            </p>
          </div>
          <GameBtn variant="ghost" disabled={!!busy} onClick={() => void refresh()}>
            새로고침
          </GameBtn>
        </div>
      </div>

      {error ? <GamePanelError error={error} className="mt-0" /> : null}

      {sessionLoading ? (
        <GamePanelLoading label="세션 확인 중…" />
      ) : !user ? (
        <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
      ) : initialLoading ? (
        <GamePanelLoading label="미니언 정보를 불러오는 중…" />
      ) : (
        <>
      {!equipMode ? (
        <div className="minion-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "gather"}
            className={`minion-tab ${tab === "gather" ? "minion-tab--active" : ""}`}
            onClick={() => setTab("gather")}
          >
            일꾼 (수집)
            <span className="minion-tab__count">
              {gatherMinions.length}/{maxGatherOwned}명
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "dungeon"}
            className={`minion-tab ${tab === "dungeon" ? "minion-tab--active" : ""}`}
            onClick={() => setTab("dungeon")}
          >
            용병 (던전)
            <span className="minion-tab__count">
              {dungeonMinions.length}/{maxDungeonOwned}명
            </span>
          </button>
        </div>
      ) : null}

      <div className={`minion-layout ${equipMode ? "minion-layout--equip" : ""}`}>
        <aside
          className={equipMode ? "minion-equip-bag-aside" : "minion-roster"}
          aria-label={equipMode ? "장비 가방" : tab === "gather" ? "수집 미니언 목록" : "던전 미니언 목록"}
        >
          {equipMode && equipMinion ? (
            <MinionEquipBagPanel
              category={bagCategory}
              onCategoryChange={setBagCategory}
              weapons={weapons}
              inventory={inventoryStacks}
              minionJobType={equipMinion.jobType}
              equippedWeaponInstanceId={equipMinion.equippedWeaponInstanceId}
              equippedStackItemId={armorItemIdForSlot(equipMinion, activeSlot)}
              activeSlot={activeSlot}
              busy={!!busy}
              onPick={(raw) => void applyEquipPayload(activeSlot, raw)}
              onUnequip={() => void unequipActiveSlot()}
              onBack={closeEquipMode}
            />
          ) : roster.length === 0 ? (
            <div className="space-y-2 text-sm text-[var(--game-muted)]">
              <p>
                {tab === "gather"
                  ? "수집·작업장용 미니언이 없습니다. 인벤에서 고용권을 사용해 보세요."
                  : "던전용 미니언(전사·궁수·마법사)이 없습니다."}
              </p>
            </div>
          ) : (
            roster.map((m) => {
              const isSelected = m.id === selectedId;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`minion-roster-card ${isSelected ? "minion-roster-card--selected" : ""}`}
                  onClick={() => setSelectedId(m.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--game-text)]">
                      {tab === "gather" ? jobLabel(m.jobType) : `Lv${m.level} · ${jobLabel(m.jobType)}`}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--game-muted)]">
                    {m.combatStats ? (
                      <span className="font-semibold text-[var(--game-gold-bright)]">
                        전투력 {m.combatStats.combatPower.toLocaleString()}
                      </span>
                    ) : null}
                    {m.equippedWeapon ? (
                      <>
                        <ItemIcon itemId={m.equippedWeapon.baseItemId} size={20} />
                        <span className={itemGradeNameClassName(m.equippedWeapon.grade ?? 1)}>
                          {m.equippedWeapon.name}
                          {m.equippedWeapon.enhanceLevel > 0 ? ` +${m.equippedWeapon.enhanceLevel}` : ""}
                        </span>
                      </>
                    ) : (
                      <span>무기 미착용</span>
                    )}
                  </div>
                  {m.assignedWorkshop ? (
                    <div className="mt-1 text-[10px] text-emerald-300/90">배치: {m.assignedWorkshop.workshopName}</div>
                  ) : null}
                </button>
              );
            })
          )}
        </aside>

        <main className={`minion-detail ${equipMode ? "minion-detail--equip" : ""}`}>
          {!detailMinion ? (
            <div className="minion-detail-empty">목록에서 미니언을 선택하세요.</div>
          ) : equipMode && equipMinion ? (
            <MinionEquipDetailPanel
              minion={equipMinion}
              equipment={equipmentView}
              combatStats={detailCombatStats}
              activeSlot={activeSlot}
              onSlotClick={(slotId) => {
                setActiveSlot(slotId);
                setBagCategory(slotToBagCategory(slotId));
              }}
              onSlotDrop={(slotId, raw) => void applyEquipPayload(slotId, raw)}
              onDone={closeEquipMode}
              busy={!!busy}
              notice={notice}
            />
          ) : (
            <div className="minion-detail-grid">
              <MinionEquipDoll
                equipment={equipmentView}
                clickableSlots={MINION_EQUIP_SLOTS_ENABLED}
                onSlotClick={() => openEquipMode(selected!.id)}
              />

              <div className="min-w-0 space-y-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--game-text)]">
                      {jobLabel(selected!.jobType)}
                    </h3>
                  </div>
                  {tab === "dungeon" && isDungeonMinionJob(selected!.jobType) ? (
                    <p className="mt-0.5 text-xs text-[var(--game-muted)]">Lv {selected!.level}</p>
                  ) : null}
                </div>

                {detailCombatStats ? <MinionStatPanel stats={detailCombatStats} compact /> : null}

                {selected!.traits.length > 0 ? (
                  <div>
                    <div className="game-stat-label mb-1">특성</div>
                    <ul className="flex flex-wrap gap-1.5">
                      {selected!.traits.map((t) => (
                        <li
                          key={t.type}
                          className="rounded-md border border-[var(--game-border)] bg-black/25 px-2 py-0.5 text-[11px] text-[var(--game-muted)]"
                        >
                          {t.type} R{t.rank}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {selected!.assignedWorkshop ? (
                  <p className="text-xs text-emerald-300/90">작업장 배치: {selected!.assignedWorkshop.workshopName}</p>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                  <GameBtn onClick={() => openEquipMode(selected!.id)} disabled={!!busy}>
                    장비 착용
                  </GameBtn>
                </div>

                <p className="text-[10px] leading-relaxed text-[var(--game-muted)]">
                  「장비 착용」을 누르면 왼쪽이 장비 가방으로 바뀝니다. 무기·방어구를 슬롯에 착용하세요.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
        </>
      )}
    </GamePanel>
  );
}
