"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { MinionEquipBagPanel } from "@/app/_components/MinionEquipBagPanel";
import { MinionEquipDetailPanel } from "@/app/_components/MinionEquipDetailPanel";
import { MinionEquipDoll } from "@/app/_components/MinionEquipDoll";
import { GameBtn, GamePanel, GamePanelTitle } from "@/app/_components/gameUi";
import { GamePanelError, GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { MINION_RECRUITED_EVENT, type MinionRecruitedDetail } from "@/shared/minionRecruit";
import {
  accessoryStackMatchesSlot,
  armorStackMatchesSlot,
  isAccessoryEquipSlot,
  isArmorEquipSlot,
  isMinionEquipSlotImplemented,
  MINION_ACCESSORY_SLOTS,
  MINION_EQUIP_SLOTS,
  MINION_EQUIP_SLOTS_ENABLED,
  minionEquipSlotsEnabledForPool,
  parseEquipDragPayload,
  type MinionEquipSlotId,
} from "@/shared/minionEquipSlots";
import type { MinionCombatBreakdown } from "@/shared/minionCombatStats";
import { armorSlotsFromMinionRow, computeMinionCombatBreakdown } from "@/shared/minionCombatStats";
import { buildMinionEquipmentViewWithTooltips } from "@/shared/minionEquipmentView";
import { slotToBagCategory, type EquipBagCategory } from "@/shared/minionEquipBag";
import { canMinionEquipWeaponForClass } from "@/shared/minionWeaponRules";
import { canMinionEquipItemByLevel, minEquipLevelForItem } from "@/shared/itemEquipLevel";
import { useGameFrameOptional } from "@/app/_components/GameFrameContext";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { API_CACHE_TTL } from "@/shared/apiCache";
import {
  MINION_NICKNAME_MAX_LEN,
  minionDisplayName,
  minionNicknameErrorMessage,
} from "@/shared/minionNickname";
import { invalidateCombatRosterCache } from "@/shared/combatRosterClient";
import { apiGetJson, apiGetJsonCachedSwr, apiPostJson, isUnauthorizedError } from "@/shared/sessionClient";
import { GAME_FRAME_REFRESH_EVENT } from "@/shared/gameNav";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";
import { MinionStatPanel } from "@/app/_components/MinionStatPanel";
import { MinionStatAllocatePanel } from "@/app/_components/MinionStatAllocatePanel";
import { MinionCreateFlow } from "@/app/_components/MinionCreateFlow";
import { KnightOrderPanel } from "@/app/_components/KnightOrderPanel";
import {
  MINION_ALT_CREATE_LEVEL,
  type MinionCreateEligibility,
} from "@/shared/minionCreate";
import { MinionSkillsModal } from "@/app/_components/MinionSkillsModal";
import type { KnightOrderView } from "@/shared/meDashboard";
import type { MinionBaseStats, MinionStatKey } from "@/shared/minionBaseStats";
import type { MinionCombatClass } from "@/shared/minionDerivedClass";
import type { MinionSkillView } from "@/shared/minionSkills";
import { serializeMinionSkillLevels } from "@/shared/minionSkills";

import { useEscapeClose } from "@/shared/useEscapeClose";

type EquippedArmorPiece = { itemId: string; instanceId?: string | null; name: string; grade?: number };
type EquippedAccessoryPiece = { itemId: string; name: string; grade: number };

type EquippedArmorView = {
  helmet: EquippedArmorPiece | null;
  armor: EquippedArmorPiece | null;
  pants: EquippedArmorPiece | null;
  shoes: EquippedArmorPiece | null;
};

const EMPTY_EQUIPPED_ARMOR: EquippedArmorView = {
  helmet: null,
  armor: null,
  pants: null,
  shoes: null,
};

type ArmorSlotKey = "helmet" | "armor" | "pants" | "shoes";

function promotionErrorMessage(code: string): string {
  switch (code) {
    case "NO_SWORD_EQUIPPED":
      return "검을 착용한 상태에서만 1차 전직(검사)할 수 있습니다.";
    case "NO_STATS_FOR_PROMOTION":
      return "스탯을 1점 이상 배분한 뒤 2차 전직할 수 있습니다.";
    case "PROMOTION_NOT_AVAILABLE":
      return "지금은 전직할 수 없습니다.";
    default:
      return code;
  }
}

type MinionTraitRow = { type: string; rank: number; xp: number };
type MinionRow = {
  id: string;
  level: number;
  supportsLeveling?: boolean;
  experience: number;
  xpToNext: number;
  xpProgress: number;
  unspentStatPoints: number;
  unspentSkillPoints?: number;
  isMaxLevel: boolean;
  baseStats: MinionBaseStats;
  jobType: string;
  combatClass?: MinionCombatClass;
  combatClassLabel: string;
  displayName?: string;
  nickname?: string | null;
  promotionTier?: number;
  canPromoteFirst?: boolean;
  canPromoteSecond?: boolean;
  canPromoteThird?: boolean;
  nextPromotionLabel?: string | null;
  skills?: MinionSkillView[];
  equippedWeaponInstanceId: string | null;
  equippedWeapon: {
    id: string;
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    grade?: number;
    optionBonus?: number;
  } | null;
  equippedHelmetItemId?: string | null;
  equippedChestItemId?: string | null;
  equippedPantsItemId?: string | null;
  equippedArmor?: EquippedArmorView;
  equippedAccessories?: Partial<Record<(typeof MINION_ACCESSORY_SLOTS)[number], EquippedAccessoryPiece | null>>;
  equippedBootsItemId?: string | null;
  combatStats?: MinionCombatBreakdown;
  combatPower?: number;
  traits: MinionTraitRow[];
};

function skillLevelsJsonFromViews(skills: MinionSkillView[] | undefined) {
  if (!skills?.length) return null;
  const levels: Record<string, number> = {};
  for (const s of skills) {
    if (s.level > 0) levels[s.id] = s.level;
  }
  return serializeMinionSkillLevels(levels);
}

function combatBreakdownFromMinionRow(m: MinionRow | null): MinionCombatBreakdown | null {
  if (!m) return null;
  const fighterRank = m.traits.find((t) => t.type === "FIGHTER")?.rank ?? 0;
  return computeMinionCombatBreakdown({
    level: m.level,
    fighterRank,
    baseStats: m.baseStats,
    combatClass: m.combatClass,
    skillLevelsJson: skillLevelsJsonFromViews(m.skills),
    weapon: m.equippedWeapon
      ? {
          baseItemId: m.equippedWeapon.baseItemId,
          enhanceLevel: m.equippedWeapon.enhanceLevel,
          optionBonus: m.equippedWeapon.optionBonus ?? 0,
        }
      : null,
    armor: armorSlotsFromMinionRow({
      equippedHelmetItemId: m.equippedHelmetItemId,
      equippedChestItemId: m.equippedChestItemId,
      equippedPantsItemId: m.equippedPantsItemId,
      equippedBootsItemId: m.equippedBootsItemId,
      equippedArmor: m.equippedArmor,
    }),
  });
}

function armorInstanceIdForSlot(m: MinionRow, slotId: MinionEquipSlotId): string | null {
  const a = m.equippedArmor;
  if (!a) return null;
  if (slotId === "helmet") return a.helmet?.instanceId ?? null;
  if (slotId === "armor") return a.armor?.instanceId ?? null;
  if (slotId === "pants") return a.pants?.instanceId ?? null;
  if (slotId === "shoes") return a.shoes?.instanceId ?? null;
  return null;
}

function stackItemIdForSlot(m: MinionRow, slotId: MinionEquipSlotId): string | null {
  if (isAccessoryEquipSlot(slotId)) return m.equippedAccessories?.[slotId]?.itemId ?? null;
  return armorItemIdForSlot(m, slotId);
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

function legacyArmorItemIdsFromView(armor: EquippedArmorView) {
  return {
    equippedHelmetItemId: armor.helmet?.itemId ?? null,
    equippedChestItemId: armor.armor?.itemId ?? null,
    equippedPantsItemId: armor.pants?.itemId ?? null,
    equippedBootsItemId: armor.shoes?.itemId ?? null,
  };
}

function armorSlotKey(slotId: MinionEquipSlotId): ArmorSlotKey | null {
  if (slotId === "helmet" || slotId === "armor" || slotId === "pants" || slotId === "shoes") return slotId;
  return null;
}

function recomputeMinionRow(m: MinionRow): MinionRow {
  const combatStats = combatBreakdownFromMinionRow(m);
  return {
    ...m,
    combatStats: combatStats ?? undefined,
    combatPower: combatStats?.combatPower,
  };
}

function patchMinionWeaponEquip(
  minions: MinionRow[],
  minionId: string,
  weaponInstanceId: string | null,
  weapons: WeaponInstanceRow[],
): MinionRow[] {
  const weapon = weaponInstanceId ? weapons.find((w) => w.id === weaponInstanceId) ?? null : null;
  return minions.map((m) => {
    let next = m;
    if (weaponInstanceId && m.equippedWeaponInstanceId === weaponInstanceId && m.id !== minionId) {
      next = recomputeMinionRow({ ...m, equippedWeaponInstanceId: null, equippedWeapon: null });
    }
    if (m.id !== minionId) return next;
    return recomputeMinionRow({
      ...next,
      equippedWeaponInstanceId: weaponInstanceId,
      equippedWeapon: weapon
        ? {
            id: weapon.id,
            baseItemId: weapon.baseItemId,
            name: weapon.name,
            enhanceLevel: weapon.enhanceLevel,
            grade: weapon.grade,
          }
        : null,
    });
  });
}

function patchMinionAccessorySlot(
  minions: MinionRow[],
  minionId: string,
  slotId: (typeof MINION_ACCESSORY_SLOTS)[number],
  piece: EquippedAccessoryPiece | null,
): MinionRow[] {
  return minions.map((m) => {
    if (m.id !== minionId) return m;
    const accessories = { ...(m.equippedAccessories ?? {}), [slotId]: piece };
    return recomputeMinionRow({ ...m, equippedAccessories: accessories });
  });
}

function patchMinionArmorSlot(
  minions: MinionRow[],
  minionId: string,
  slotId: MinionEquipSlotId,
  piece: EquippedArmorPiece | null,
  armorInstanceId?: string | null,
): MinionRow[] {
  const slotKey = armorSlotKey(slotId);
  if (!slotKey) return minions;

  let rows = minions;
  if (armorInstanceId) {
    rows = rows.map((m) => {
      const armor = { ...(m.equippedArmor ?? EMPTY_EQUIPPED_ARMOR) };
      let changed = false;
      for (const key of ["helmet", "armor", "pants", "shoes"] as const) {
        if (armor[key]?.instanceId === armorInstanceId) {
          armor[key] = null;
          changed = true;
        }
      }
      if (!changed) return m;
      return recomputeMinionRow({ ...m, equippedArmor: armor, ...legacyArmorItemIdsFromView(armor) });
    });
  }

  return rows.map((m) => {
    if (m.id !== minionId) return m;
    const armor = { ...(m.equippedArmor ?? EMPTY_EQUIPPED_ARMOR), [slotKey]: piece };
    return recomputeMinionRow({ ...m, equippedArmor: armor, ...legacyArmorItemIdsFromView(armor) });
  });
}

function patchInventoryStackQuantity(
  stacks: StackRow[],
  itemId: string,
  delta: number,
): StackRow[] {
  return stacks
    .map((s) => (s.itemId === itemId ? { ...s, quantity: s.quantity + delta } : s))
    .filter((s) => s.quantity > 0);
}

type EquipOptionRow = {
  kind: string;
  optionId?: string;
  label: string;
  tier: number;
  tierLabel: string;
  displayValue: number;
  hidden?: boolean;
  locked?: boolean;
};

type WeaponInstanceRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  createdAt?: string;
  grade?: number;
  gradeLabel?: string;
  identified?: boolean;
  options?: EquipOptionRow[];
  icon?: string | null;
  iconSrc?: string;
};

type ArmorInstanceRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel?: number;
  createdAt?: string;
  grade?: number;
  gradeLabel?: string;
  identified?: boolean;
  options?: EquipOptionRow[];
  icon?: string | null;
  iconSrc?: string;
};

type StackRow = {
  itemId: string;
  name: string;
  quantity: number;
  grade?: number;
  gradeLabel?: string;
  category?: string;
  icon?: string | null;
  iconSrc?: string;
};

async function getJson<T>(url: string): Promise<T> {
  return apiGetJson<T>(url);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiPostJson<T>(url, body);
}

function minionTitle(m: Pick<MinionRow, "displayName" | "combatClassLabel" | "nickname">) {
  return m.displayName ?? minionDisplayName(m.nickname, m.combatClassLabel);
}

function minionDisplayLabel(m: Pick<MinionRow, "displayName" | "combatClassLabel" | "nickname" | "level">) {
  return `Lv${m.level} · ${minionTitle(m)}`;
}

function minionRosterTitle(m: Pick<MinionRow, "displayName" | "combatClassLabel" | "nickname">) {
  return minionTitle(m);
}

function MinionNicknameField(props: {
  minionId: string;
  displayName: string;
  combatClassLabel: string;
  nickname?: string | null;
  level: number;
  busy?: boolean;
  compact?: boolean;
  onSave: (minionId: string, nickname: string | null) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.nickname ?? "");

  useEffect(() => {
    if (!editing) setDraft(props.nickname ?? "");
  }, [props.nickname, editing]);

  if (!editing) {
    return (
      <div className={`minion-nickname-field${props.compact ? " minion-nickname-field--compact" : ""}`}>
        <div className="minion-nickname-field__meta">
          <div className="minion-nickname-field__title">
            {props.displayName}
            <span className="minion-nickname-field__level">Lv {props.level}</span>
          </div>
          {props.nickname?.trim() ? (
            <div className="minion-nickname-field__job">{props.combatClassLabel}</div>
          ) : null}
        </div>
        <GameBtn
          variant="ghost"
          className="minion-nickname-field__edit"
          disabled={props.busy}
          onClick={() => setEditing(true)}
        >
          이름
        </GameBtn>
      </div>
    );
  }

  return (
    <div className={`minion-nickname-field minion-nickname-field--edit${props.compact ? " minion-nickname-field--compact" : ""}`}>
      <input
        className="minion-nickname-field__input"
        value={draft}
        maxLength={MINION_NICKNAME_MAX_LEN}
        placeholder={props.combatClassLabel}
        disabled={props.busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            void Promise.resolve(props.onSave(props.minionId, draft.trim() || null)).then(() =>
              setEditing(false),
            );
          }
          if (e.key === "Escape") {
            setEditing(false);
            setDraft(props.nickname ?? "");
          }
        }}
        autoFocus
      />
      <div className="minion-nickname-field__actions">
        <GameBtn
          className="minion-nickname-field__save"
          disabled={props.busy}
          onClick={() =>
            void Promise.resolve(props.onSave(props.minionId, draft.trim() || null)).then(() =>
              setEditing(false),
            )
          }
        >
          저장
        </GameBtn>
        <GameBtn
          variant="ghost"
          disabled={props.busy}
          onClick={() => {
            setEditing(false);
            setDraft(props.nickname ?? "");
          }}
        >
          취소
        </GameBtn>
        {props.nickname?.trim() ? (
          <GameBtn
            variant="ghost"
            disabled={props.busy}
            onClick={() => void Promise.resolve(props.onSave(props.minionId, null)).then(() => setEditing(false))}
          >
            초기화
          </GameBtn>
        ) : null}
      </div>
      <p className="minion-nickname-field__hint">
        {MINION_NICKNAME_MAX_LEN}자 이하 · 한글·영문·숫자·_ - .
      </p>
    </div>
  );
}

function slotLabel(slotId: MinionEquipSlotId) {
  return MINION_EQUIP_SLOTS.find((s) => s.id === slotId)?.label ?? slotId;
}

export function MinionManagementPanel(props: EmbeddedPanelProps = {}) {
  const embedded = props.embedded ?? false;
  const { user, loading: sessionLoading } = useSessionUser();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [minions, setMinions] = useState<MinionRow[]>([]);
  const [maxDungeonOwned, setMaxDungeonOwned] = useState(10);
  const [weaponInstances, setWeaponInstances] = useState<WeaponInstanceRow[]>([]);
  const [armorInstances, setArmorInstances] = useState<ArmorInstanceRow[]>([]);
  const [inventoryStacks, setInventoryStacks] = useState<StackRow[]>([]);
  const [equipModeMinionId, setEquipModeMinionId] = useState<string | null>(null);
  const [bagCategory, setBagCategory] = useState<EquipBagCategory>("weapon");
  const [activeSlot, setActiveSlot] = useState<MinionEquipSlotId>("weapon");
  const [notice, setNotice] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [knightOrder, setKnightOrder] = useState<KnightOrderView | null>(null);
  const [representativeMinionId, setRepresentativeMinionId] = useState<string | null>(null);
  const [skillsModalMinionId, setSkillsModalMinionId] = useState<string | null>(null);
  const [minionCreate, setMinionCreate] = useState<MinionCreateEligibility>({
    canCreate: false,
    minionCount: 0,
    maxOwned: 10,
    highestLevel: 0,
    requiredLevel: MINION_ALT_CREATE_LEVEL,
    isFirstSlot: true,
  });
  const frame = useGameFrameOptional();
  const equipInFlightRef = useRef(false);

  const equipMode = equipModeMinionId != null;

  async function refresh(opts?: { force?: boolean }) {
    if (!user) return;
    try {
      const r = await apiGetJsonCachedSwr<{
        ok: boolean;
        minions: MinionRow[];
        maxGatherOwned?: number;
        maxDungeonOwned?: number;
        weaponInstances?: WeaponInstanceRow[];
        armorInstances?: ArmorInstanceRow[];
        inventory?: Array<StackRow & { category?: string }>;
        knightOrder?: KnightOrderView;
        representativeMinionId?: string | null;
        minionCreate?: MinionCreateEligibility;
      }>("/api/minions/panel", { ttlMs: API_CACHE_TTL.minionPanel, force: opts?.force });
      if (r?.ok) {
        if (r.minionCreate) setMinionCreate(r.minionCreate);
        setRepresentativeMinionId(r.representativeMinionId ?? null);
        setKnightOrder(r.knightOrder ?? null);
        setMinions(r.minions ?? []);
        setMaxDungeonOwned(r.maxDungeonOwned ?? 10);
        setWeaponInstances(r.weaponInstances ?? []);
        setArmorInstances(r.armorInstances ?? []);
        setInventoryStacks(
          (r.inventory ?? []).map((it) => ({
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
      setArmorInstances([]);
      setInventoryStacks([]);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionLoading]);

  useEffect(() => {
    if (!embedded) return;
    const onFrameRefresh = () => void refresh();
    window.addEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    return () => window.removeEventListener(GAME_FRAME_REFRESH_EVENT, onFrameRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);

  useEffect(() => {
    function onRecruited(e: Event) {
      const detail = (e as CustomEvent<MinionRecruitedDetail>).detail;
      if (!detail?.minionId) return;
      void refresh().then(() => {
        setSelectedId(detail.minionId);
      });
    }
    window.addEventListener(MINION_RECRUITED_EVENT, onRecruited);
    return () => window.removeEventListener(MINION_RECRUITED_EVENT, onRecruited);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roster = useMemo(() => minions, [minions]);

  const selected = useMemo(
    () => (selectedId ? roster.find((m) => m.id === selectedId) ?? null : null),
    [roster, selectedId],
  );

  const equipMinion = useMemo(
    () => (equipModeMinionId ? minions.find((m) => m.id === equipModeMinionId) ?? null : null),
    [equipModeMinionId, minions],
  );

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
  }, [roster, equipMode]);

  const weapons = useMemo(() => weaponInstances, [weaponInstances]);

  const blockedArmorInstanceIds = useMemo(() => {
    const blocked = new Set<string>();
    for (const m of minions) {
      if (equipMinion && m.id === equipMinion.id) continue;
      const a = m.equippedArmor;
      if (!a) continue;
      for (const piece of [a.helmet, a.armor, a.pants, a.shoes]) {
        if (piece?.instanceId) blocked.add(piece.instanceId);
      }
    }
    return blocked;
  }, [minions, equipMinion]);

  const equipmentView = useMemo(() => {
    const m = equipMode ? equipMinion : selected;
    if (!m) return {};
    return buildMinionEquipmentViewWithTooltips(
      {
        equippedWeapon: m.equippedWeapon
          ? {
              id: m.equippedWeapon.id,
              baseItemId: m.equippedWeapon.baseItemId,
              name: m.equippedWeapon.name,
              enhanceLevel: m.equippedWeapon.enhanceLevel,
              grade: m.equippedWeapon.grade,
            }
          : null,
        equippedArmor: m.equippedArmor,
        equippedAccessories: m.equippedAccessories,
      },
      { weaponInstances, armorInstances },
    );
  }, [equipMinion, selected, equipMode, weaponInstances, armorInstances]);

  const detailCombatStats = useMemo(
    () => combatBreakdownFromMinionRow(equipMode ? equipMinion : selected),
    [equipMinion, selected, equipMode],
  );

  const skillsModalMinion = useMemo(
    () => (skillsModalMinionId ? (minions.find((m) => m.id === skillsModalMinionId) ?? null) : null),
    [minions, skillsModalMinionId],
  );

  function schedulePanelRefresh() {
    void refresh({ force: true });
  }

  async function equipArmorForMinion(
    minionId: string,
    slotId: MinionEquipSlotId,
    opts: { itemId?: string | null; armorInstanceId?: string | null },
  ) {
    if (!isArmorEquipSlot(slotId)) return;
    if (equipInFlightRef.current) return;
    equipInFlightRef.current = true;
    setError(null);

    const itemId = opts.itemId ?? null;
    const armorInstanceId = opts.armorInstanceId ?? null;
    const slotKey = armorSlotKey(slotId);
    const prevMinions = minions;
    const prevStacks = inventoryStacks;
    const currentMinion = minions.find((m) => m.id === minionId);

    let piece: EquippedArmorPiece | null = null;
    if (armorInstanceId) {
      const inst = armorInstances.find((a) => a.id === armorInstanceId);
      if (inst) {
        piece = {
          itemId: inst.baseItemId,
          instanceId: inst.id,
          name: inst.name,
          grade: inst.grade ?? 1,
        };
      }
    } else if (itemId) {
      const stack = inventoryStacks.find((s) => s.itemId === itemId);
      piece = {
        itemId,
        instanceId: null,
        name: stack?.name ?? itemId,
        grade: stack?.grade ?? 1,
      };
    }

    if (slotKey) {
      setMinions(patchMinionArmorSlot(minions, minionId, slotId, piece, armorInstanceId));
      if (itemId && !armorInstanceId) {
        setInventoryStacks(patchInventoryStackQuantity(inventoryStacks, itemId, -1));
      } else if (!piece && slotKey) {
        const prevPiece = currentMinion?.equippedArmor?.[slotKey];
        if (prevPiece?.itemId && !prevPiece.instanceId) {
          setInventoryStacks(patchInventoryStackQuantity(inventoryStacks, prevPiece.itemId, 1));
        }
      }
    }

    try {
      await postJson("/api/minions/armor/equip", {
        minionId,
        slotId,
        itemId,
        armorInstanceId,
      });
      setNotice(null);
      schedulePanelRefresh();
    } catch (err) {
      setMinions(prevMinions);
      setInventoryStacks(prevStacks);
      setError(err);
    } finally {
      equipInFlightRef.current = false;
    }
  }

  async function equipAccessoryForMinion(
    minionId: string,
    slotId: MinionEquipSlotId,
    itemId: string | null,
  ) {
    if (!isAccessoryEquipSlot(slotId)) return;
    if (equipInFlightRef.current) return;
    equipInFlightRef.current = true;
    setError(null);

    const prevMinions = minions;
    const prevStacks = inventoryStacks;
    const currentMinion = minions.find((m) => m.id === minionId);
    let piece: EquippedAccessoryPiece | null = null;
    if (itemId) {
      const stack = inventoryStacks.find((s) => s.itemId === itemId);
      piece = {
        itemId,
        name: stack?.name ?? itemId,
        grade: stack?.grade ?? 1,
      };
    }

    setMinions(patchMinionAccessorySlot(minions, minionId, slotId, piece));
    if (itemId) {
      setInventoryStacks(patchInventoryStackQuantity(inventoryStacks, itemId, -1));
    } else {
      const prevPiece = currentMinion?.equippedAccessories?.[slotId];
      if (prevPiece?.itemId) {
        setInventoryStacks(patchInventoryStackQuantity(inventoryStacks, prevPiece.itemId, 1));
      }
    }

    try {
      await postJson("/api/minions/accessory/equip", { minionId, slotId, itemId });
      setNotice(null);
      schedulePanelRefresh();
    } catch (err) {
      setMinions(prevMinions);
      setInventoryStacks(prevStacks);
      setError(err);
    } finally {
      equipInFlightRef.current = false;
    }
  }

  async function unequipActiveSlot() {
    if (!equipMinion) return;
    if (activeSlot === "weapon") {
      await equipWeaponForMinion(equipMinion.id, null);
      return;
    }
    if (isArmorEquipSlot(activeSlot)) {
      await equipArmorForMinion(equipMinion.id, activeSlot, {});
      return;
    }
    if (isAccessoryEquipSlot(activeSlot)) {
      await equipAccessoryForMinion(equipMinion.id, activeSlot, null);
    }
  }

  async function equipWeaponForMinion(minionId: string, weaponInstanceId: string | null) {
    if (equipInFlightRef.current) return;
    equipInFlightRef.current = true;
    setError(null);

    const prevMinions = minions;
    setMinions(patchMinionWeaponEquip(minions, minionId, weaponInstanceId, weaponInstances));

    try {
      await postJson("/api/minions/weapon/equip", { minionId, weaponInstanceId });
      schedulePanelRefresh();
    } catch (err) {
      setMinions(prevMinions);
      setError(err);
    } finally {
      equipInFlightRef.current = false;
    }
  }

  async function saveMinionNickname(minionId: string, nickname: string | null) {
    setBusy("nickname");
    setError(null);
    try {
      const r = await postJson<{
        ok: boolean;
        nickname?: string | null;
        displayName?: string;
        combatClassLabel?: string;
        error?: string;
      }>("/api/minions/nickname", { minionId, nickname });
      if (!r?.ok) {
        setError(minionNicknameErrorMessage(r?.error ?? "UNKNOWN"));
        return;
      }
      setMinions((prev) =>
        prev.map((m) =>
          m.id === minionId
            ? {
                ...m,
                nickname: r.nickname ?? null,
                displayName: r.displayName ?? minionDisplayName(r.nickname, m.combatClassLabel),
                combatClassLabel: r.combatClassLabel ?? m.combatClassLabel,
              }
            : m,
        ),
      );
      invalidateCombatRosterCache();
      setNotice(nickname ? "이름을 변경했어요." : "이름을 초기화했어요.");
      await frame?.refreshSummary({ force: true });
    } catch (err) {
      const code =
        err && typeof err === "object" && "error" in err
          ? String((err as { error?: string }).error)
          : err instanceof Error
            ? err.message
            : String(err);
      setError(minionNicknameErrorMessage(code));
    } finally {
      setBusy(null);
    }
  }

  async function setRepresentativeMinion(minionId: string) {
    setBusy("representative");
    setError(null);
    try {
      await apiPostJson("/api/minions/representative", { minionId });
      setRepresentativeMinionId(minionId);
      setNotice("홈 화면 대표 미니언으로 지정했어요.");
      await frame?.refreshSummary({ force: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function promoteMinion(minionId: string) {
    setBusy("promote");
    setError(null);
    try {
      const r = await postJson<{ ok: boolean; combatClassLabel?: string; error?: string }>(
        "/api/minions/promote",
        { minionId },
      );
      if (r?.ok) {
        await refresh();
        setNotice(r.combatClassLabel ? `${r.combatClassLabel}(으)로 전직했어요!` : "전직했어요!");
      }
    } catch (err) {
      const code =
        err && typeof err === "object" && "error" in err
          ? String((err as { error?: string }).error)
          : err instanceof Error
            ? err.message
            : String(err);
      setError(promotionErrorMessage(code));
    } finally {
      setBusy(null);
    }
  }

  async function allocateStatsForMinion(
    minionId: string,
    stats: Partial<Record<MinionStatKey, number>>,
  ) {
    setBusy("allocate-stats");
    setError(null);
    try {
      const r = await postJson<{
        ok: boolean;
        minionId: string;
        combatClassLabel: string;
        unspentStatPoints: number;
      }>("/api/minions/stats/allocate", { minionId, stats });
      if (r?.ok) {
        await refresh();
        setNotice("스탯을 배분했어요.");
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function allocateSkillsForMinion(minionId: string, skills: Record<string, number>) {
    setBusy("allocate-skills");
    setError(null);
    try {
      const r = await postJson<{ ok: boolean }>("/api/minions/skills/allocate", { minionId, skills });
      if (r?.ok) {
        await refresh();
        setNotice("스킬을 배분했어요.");
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function resetStatsForMinion(minionId: string) {
    setBusy("reset-stats");
    setError(null);
    try {
      const r = await postJson<{ ok: boolean }>("/api/minions/stats/reset", { minionId });
      if (r?.ok) {
        await refresh();
        setNotice("스탯 배분을 초기화했어요.");
      }
    } catch (err) {
      const code =
        err && typeof err === "object" && "error" in err
          ? String((err as { error?: string }).error)
          : err instanceof Error
            ? err.message
            : String(err);
      setError(new Error(code === "NOTHING_TO_RESET" ? "초기화할 스탯이 없습니다." : code));
    } finally {
      setBusy(null);
    }
  }

  async function resetSkillsForMinion(minionId: string) {
    setBusy("reset-skills");
    setError(null);
    try {
      const r = await postJson<{ ok: boolean }>("/api/minions/skills/reset", { minionId });
      if (r?.ok) {
        await refresh();
        setNotice("스킬 배분을 초기화했어요.");
      }
    } catch (err) {
      const code =
        err && typeof err === "object" && "error" in err
          ? String((err as { error?: string }).error)
          : err instanceof Error
            ? err.message
            : String(err);
      setError(new Error(code === "NOTHING_TO_RESET" ? "초기화할 스킬 포인트가 없습니다." : code));
    } finally {
      setBusy(null);
    }
  }

  function openEquipMode(minionId: string) {
    setSkillsModalMinionId(null);
    setEquipModeMinionId(minionId);
    setSelectedId(minionId);
    setActiveSlot("weapon");
    setBagCategory("weapon");
    setNotice(null);
  }

  function openSkillsMode(minionId: string) {
    setEquipModeMinionId(null);
    setSkillsModalMinionId(minionId);
    setSelectedId(minionId);
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

    const rejectIfLevelTooLow = (baseItemId: string) => {
      if (canMinionEquipItemByLevel(equipMinion.level, baseItemId)) return false;
      const required = minEquipLevelForItem(baseItemId);
      setNotice(`착용하려면 Lv${required} 이상이 필요합니다. (현재 Lv${equipMinion.level})`);
      return true;
    };

    if (slotId === "weapon") {
      if (payload.kind === "weapon") {
        const combatClass = (equipMinion.combatClass ?? "ADVENTURER") as MinionCombatClass;
        if (!canMinionEquipWeaponForClass(combatClass, payload.baseItemId)) {
          setNotice("현재 직업은 해당 무기를 착용할 수 없습니다.");
          return;
        }
        if (rejectIfLevelTooLow(payload.baseItemId)) return;
        await equipWeaponForMinion(equipMinion.id, payload.weaponInstanceId);
        return;
      }
      setNotice("무기 슬롯에는 무기만 착용할 수 있습니다.");
      return;
    }

    if (payload.kind === "armor" && armorStackMatchesSlot(slotId, payload.baseItemId)) {
      if (!isMinionEquipSlotImplemented(slotId) || !isArmorEquipSlot(slotId)) {
        setNotice(`${slotLabel(slotId)} 착용 기능은 곧 추가됩니다.`);
        return;
      }
      if (rejectIfLevelTooLow(payload.baseItemId)) return;
      await equipArmorForMinion(equipMinion.id, slotId, { armorInstanceId: payload.armorInstanceId });
      return;
    }

    if (payload.kind === "stack" && accessoryStackMatchesSlot(slotId, payload.itemId)) {
      if (!isMinionEquipSlotImplemented(slotId) || !isAccessoryEquipSlot(slotId)) {
        setNotice(`${slotLabel(slotId)} 착용 기능은 곧 추가됩니다.`);
        return;
      }
      if (rejectIfLevelTooLow(payload.itemId)) return;
      await equipAccessoryForMinion(equipMinion.id, slotId, payload.itemId);
      return;
    }

    if (payload.kind === "stack" && armorStackMatchesSlot(slotId, payload.itemId)) {
      if (!isMinionEquipSlotImplemented(slotId) || !isArmorEquipSlot(slotId)) {
        setNotice(`${slotLabel(slotId)} 착용 기능은 곧 추가됩니다.`);
        return;
      }
      if (rejectIfLevelTooLow(payload.itemId)) return;
      await equipArmorForMinion(equipMinion.id, slotId, { itemId: payload.itemId });
      return;
    }
    setNotice("이 슬롯에 맞지 않는 장비입니다.");
  }

  const detailMinion = equipMode ? equipMinion : selected;
  const detailEquipSlots = useMemo(
    () => (detailMinion ? minionEquipSlotsEnabledForPool() : MINION_EQUIP_SLOTS_ENABLED),
    [detailMinion],
  );

  return (
    <GamePanel className={`minion-shell ${embedded ? "minion-shell--fit panel-fit" : ""} ${equipMode ? "minion-shell--equip" : ""}`}>
      {!embedded ? (
        <div className="minion-hero">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <GamePanelTitle hint={equipMode ? "왼쪽 가방 · 오른쪽 착용 슬롯" : `전투 미니언 ${roster.length}/${maxDungeonOwned}명`}>
                {equipMode ? "장비 착용" : "미니언 관리"}
              </GamePanelTitle>
              <p className="mt-1 text-xs text-[var(--game-muted)]">
                {equipMode
                  ? `${detailMinion ? minionDisplayLabel(detailMinion) : ""} — 슬롯 선택 후 가방에서 착용`
                  : `캐릭터 생성 · 부캐는 Lv${MINION_ALT_CREATE_LEVEL} 이상 후 · 장비는 슬롯에서 착용`}
              </p>
            </div>
            <GameBtn variant="ghost" disabled={!!busy} onClick={() => void refresh()}>
              새로고침
            </GameBtn>
          </div>
        </div>
      ) : equipMode ? (
        <p className="mb-1 text-[10px] text-[var(--game-muted)]">
          {detailMinion ? minionDisplayLabel(detailMinion) : ""} — 슬롯 선택 후 가방에서 착용
        </p>
      ) : null}

      {error ? <GamePanelError error={error} className="mt-0" /> : null}

      {!embedded && sessionLoading ? (
        <GamePanelLoading label="세션 확인 중…" />
      ) : !embedded && !user ? (
        <GamePanelInfo>로그인이 필요합니다. 화면 오른쪽 위에서 Google 로그인을 진행해 주세요.</GamePanelInfo>
      ) : initialLoading ? (
        <GamePanelLoading label="미니언 정보를 불러오는 중…" />
      ) : !user ? null : (
        <>
      {!equipMode ? (
        <MinionCreateFlow
          eligibility={minionCreate}
          busyId={busy}
          setBusy={setBusy}
          onError={setError}
          onNotice={setNotice}
          onCreated={async () => {
            await refresh();
            void frame?.refreshSummary({ force: true });
          }}
          compact={embedded}
        />
      ) : null}
      {!equipMode && knightOrder ? (
        <KnightOrderPanel knightOrder={knightOrder} compact className="minion-shell__knight" />
      ) : null}
      <div className={`minion-layout ${equipMode ? "minion-layout--equip" : ""} ${embedded ? "minion-layout--fit" : ""}`}>
        <aside
          className={equipMode ? "minion-equip-bag-aside" : "minion-roster"}
          aria-label={equipMode ? "장비 가방" : "던전 미니언 목록"}
        >
          {equipMode && equipMinion ? (
            <MinionEquipBagPanel
              category={bagCategory}
              onCategoryChange={setBagCategory}
              weapons={weapons}
              armorInstances={armorInstances}
              inventory={inventoryStacks}
              minionCombatClass={equipMinion.combatClass ?? "ADVENTURER"}
              minionLevel={equipMinion.level}
              equippedWeaponInstanceId={equipMinion.equippedWeaponInstanceId}
              equippedStackItemId={stackItemIdForSlot(equipMinion, activeSlot)}
              equippedArmorInstanceId={armorInstanceIdForSlot(equipMinion, activeSlot)}
              blockedArmorInstanceIds={blockedArmorInstanceIds}
              activeSlot={activeSlot}
              busy={!!busy}
              bagCategories={["weapon", "armor"]}
              compact={embedded}
              onPick={(raw) => void applyEquipPayload(activeSlot, raw)}
              onUnequip={() => void unequipActiveSlot()}
              onBack={closeEquipMode}
            />
          ) : roster.length === 0 ? (
            <div className="space-y-2 text-sm text-[var(--game-muted)]">
              <p>전투 미니언이 없습니다. 인벤에서 고용권을 사용해 보세요.</p>
            </div>
          ) : (
            roster.map((m) => {
              const isSelected = m.id === selectedId;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`minion-roster-card ${isSelected ? "minion-roster-card--selected" : ""} ${embedded ? "minion-roster-card--fit" : ""}`}
                  onClick={() => setSelectedId(m.id)}
                >
                  {embedded ? (
                    <>
                      <div className="minion-roster-card__fit-name">{minionRosterTitle(m)}</div>
                      <div className="minion-roster-card__fit-meta">
                        {m.supportsLeveling !== false ? (
                          <span className="minion-roster-card__fit-lv">Lv{m.level}</span>
                        ) : null}
                        {(m.combatPower ?? m.combatStats?.combatPower) != null ? (
                          <span className="minion-roster-card__fit-power">
                            {(m.combatPower ?? m.combatStats!.combatPower).toLocaleString()}
                          </span>
                        ) : null}
                        {m.unspentStatPoints > 0 ? (
                          <span className="minion-roster-card__stat-badge">{m.unspentStatPoints}P</span>
                        ) : null}
                        {(m.unspentSkillPoints ?? 0) > 0 ? (
                          <span className="minion-roster-card__skill-badge">스{m.unspentSkillPoints}</span>
                        ) : null}
                      </div>
                    </>
                  ) : (
                  <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="minion-roster-card__name text-sm font-semibold text-[var(--game-text)]">
                      {minionDisplayLabel(m)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {m.unspentStatPoints > 0 ? (
                        <span className="minion-roster-card__stat-badge">{m.unspentStatPoints}P</span>
                      ) : null}
                      {(m.unspentSkillPoints ?? 0) > 0 ? (
                        <span className="minion-roster-card__skill-badge">스{m.unspentSkillPoints}</span>
                      ) : null}
                    </span>
                  </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--game-muted)]">
                        {(m.combatPower ?? m.combatStats?.combatPower) != null ? (
                          <span className="font-semibold text-[var(--game-gold-bright)]">
                            전투력 {(m.combatPower ?? m.combatStats!.combatPower).toLocaleString()}
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
                  </>
                  )}
                </button>
              );
            })
          )}
        </aside>

        <main
          className={[
            "minion-detail",
            equipMode ? "minion-detail--equip" : "",
            embedded && !equipMode ? "minion-detail--fit" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {!detailMinion ? (
            <div className="minion-detail-empty">목록에서 미니언을 선택하세요.</div>
          ) : equipMode && equipMinion ? (
            <MinionEquipDetailPanel
              minion={equipMinion}
              equipment={equipmentView}
              combatStats={detailCombatStats}
              clickableSlots={detailEquipSlots}
              activeSlot={activeSlot}
              compact={embedded}
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
            embedded ? (
              <div className="minion-detail-stack--fit">
                <div className="minion-detail-head--fit">
                  <MinionEquipDoll
                    compact
                    equipment={equipmentView}
                    visibleSlots={detailEquipSlots}
                    clickableSlots={detailEquipSlots}
                    onSlotClick={() => openEquipMode(selected!.id)}
                  />
                  <div className="minion-detail-head__meta">
                    <MinionNicknameField
                      minionId={selected!.id}
                      displayName={minionTitle(selected!)}
                      combatClassLabel={selected!.combatClassLabel}
                      nickname={selected!.nickname}
                      level={selected!.level}
                      busy={!!busy}
                      compact
                      onSave={saveMinionNickname}
                    />
                    {detailCombatStats ? (
                      <MinionStatPanel stats={detailCombatStats} minimal />
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <GameBtn className="minion-detail-head__equip-btn" onClick={() => openEquipMode(selected!.id)} disabled={!!busy}>
                      장비
                    </GameBtn>
                    {selected!.skills && selected!.skills.length > 0 ? (
                      <GameBtn
                        className="minion-detail-head__equip-btn"
                        variant={(selected!.unspentSkillPoints ?? 0) > 0 ? "primary" : "ghost"}
                        onClick={() => openSkillsMode(selected!.id)}
                        disabled={!!busy}
                      >
                        스킬{(selected!.unspentSkillPoints ?? 0) > 0 ? ` ${selected!.unspentSkillPoints}P` : ""}
                      </GameBtn>
                    ) : null}
                    <GameBtn
                      variant="ghost"
                      className="minion-detail-head__equip-btn text-[10px]"
                      disabled={!!busy || representativeMinionId === selected!.id}
                      onClick={() => void setRepresentativeMinion(selected!.id)}
                    >
                      {representativeMinionId === selected!.id ? "홈 대표" : "대표 지정"}
                    </GameBtn>
                  </div>
                </div>

                {selected!.baseStats ? (
                  <MinionStatAllocatePanel
                    minionId={selected!.id}
                    baseStats={selected!.baseStats}
                    unspentStatPoints={selected!.unspentStatPoints ?? 0}
                    level={selected!.level}
                    experience={selected!.experience ?? 0}
                    xpToNext={selected!.xpToNext ?? 0}
                    xpProgress={selected!.xpProgress ?? 0}
                    isMaxLevel={selected!.isMaxLevel ?? false}
                    canPromoteFirst={selected!.canPromoteFirst}
                    canPromoteSecond={selected!.canPromoteSecond}
                    canPromoteThird={selected!.canPromoteThird}
                    nextPromotionLabel={selected!.nextPromotionLabel}
                    busy={busy === "allocate-stats" || busy === "reset-stats"}
                    promoteBusy={busy === "promote"}
                    compact
                    onApply={(stats) => allocateStatsForMinion(selected!.id, stats)}
                    onReset={() => resetStatsForMinion(selected!.id)}
                    onPromote={() => promoteMinion(selected!.id)}
                  />
                ) : null}
              </div>
            ) : (
            <div className="minion-detail-grid">
              <MinionEquipDoll
                compact={embedded}
                equipment={equipmentView}
                visibleSlots={detailEquipSlots}
                clickableSlots={detailEquipSlots}
                onSlotClick={() => openEquipMode(selected!.id)}
              />

              <div className="min-w-0 space-y-3">
                <MinionNicknameField
                  minionId={selected!.id}
                  displayName={minionTitle(selected!)}
                  combatClassLabel={selected!.combatClassLabel}
                  nickname={selected!.nickname}
                  level={selected!.level}
                  busy={!!busy}
                  onSave={saveMinionNickname}
                />

                {selected!.baseStats ? (
                  <MinionStatAllocatePanel
                    minionId={selected!.id}
                    baseStats={selected!.baseStats}
                    unspentStatPoints={selected!.unspentStatPoints ?? 0}
                    level={selected!.level}
                    experience={selected!.experience ?? 0}
                    xpToNext={selected!.xpToNext ?? 0}
                    xpProgress={selected!.xpProgress ?? 0}
                    isMaxLevel={selected!.isMaxLevel ?? false}
                    canPromoteFirst={selected!.canPromoteFirst}
                    canPromoteSecond={selected!.canPromoteSecond}
                    canPromoteThird={selected!.canPromoteThird}
                    nextPromotionLabel={selected!.nextPromotionLabel}
                    busy={busy === "allocate-stats" || busy === "reset-stats"}
                    promoteBusy={busy === "promote"}
                    onApply={(stats) => allocateStatsForMinion(selected!.id, stats)}
                    onReset={() => resetStatsForMinion(selected!.id)}
                    onPromote={() => promoteMinion(selected!.id)}
                  />
                ) : null}

                {detailCombatStats ? (
                  <MinionStatPanel stats={detailCombatStats} compact />
                ) : null}

                {!embedded && selected!.traits.length > 0 ? (
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

                <div className="flex flex-wrap gap-2 pt-1">
                  <GameBtn onClick={() => openEquipMode(selected!.id)} disabled={!!busy}>
                    장비 착용
                  </GameBtn>
                  {selected!.skills && selected!.skills.length > 0 ? (
                    <GameBtn
                      variant={(selected!.unspentSkillPoints ?? 0) > 0 ? "primary" : "ghost"}
                      onClick={() => openSkillsMode(selected!.id)}
                      disabled={!!busy}
                    >
                      스킬{(selected!.unspentSkillPoints ?? 0) > 0 ? ` ${selected!.unspentSkillPoints}P` : ""}
                    </GameBtn>
                  ) : null}
                  <GameBtn
                    variant="ghost"
                    disabled={!!busy || representativeMinionId === selected!.id}
                    onClick={() => void setRepresentativeMinion(selected!.id)}
                  >
                    {representativeMinionId === selected!.id ? "홈 대표 미니언" : "홈 대표로 지정"}
                  </GameBtn>
                </div>

                {!embedded ? (
                  <p className="text-[10px] leading-relaxed text-[var(--game-muted)]">
                    「장비 착용」을 누르면 왼쪽이 장비 가방으로 바뀝니다. 무기·방어구를 슬롯에 착용하세요.
                  </p>
                ) : null}
              </div>
            </div>
            )
          )}
        </main>
      </div>
        </>
      )}
      {skillsModalMinion?.skills && skillsModalMinion.skills.length > 0 ? (
        <MinionSkillsModal
          open
          minionId={skillsModalMinion.id}
          combatClassLabel={skillsModalMinion.combatClassLabel}
          displayName={minionTitle(skillsModalMinion)}
          level={skillsModalMinion.level}
          skills={skillsModalMinion.skills}
          unspentSkillPoints={skillsModalMinion.unspentSkillPoints ?? 0}
          busy={busy === "allocate-skills" || busy === "reset-skills"}
          onClose={() => setSkillsModalMinionId(null)}
          onApply={
            (skillsModalMinion.unspentSkillPoints ?? 0) > 0
              ? (skills) => allocateSkillsForMinion(skillsModalMinion.id, skills)
              : undefined
          }
          onReset={() => resetSkillsForMinion(skillsModalMinion.id)}
        />
      ) : null}
    </GamePanel>
  );
}
