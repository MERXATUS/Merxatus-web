import { create } from "zustand";

export type PlayerInventoryStack = {
  itemId: string;
  name: string;
  quantity: number;
  lockedQuantity?: number;
  availableQuantity?: number;
};

export type PlayerWeaponInstance = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  quality?: number;
  qualityCraftCount?: number;
  itemLevel?: number;
  userLocked?: boolean;
  grade?: number;
  gradeLabel?: string;
  identified?: boolean;
  options?: unknown[];
  equippedByMinion?: { id: string; label: string } | null;
};

export type PlayerArmorInstance = PlayerWeaponInstance;

type PlayerEquipmentStore = {
  inventory: PlayerInventoryStack[];
  weaponInstances: PlayerWeaponInstance[];
  armorInstances: PlayerArmorInstance[];
  setEquipment: (data: {
    inventory?: PlayerInventoryStack[];
    weaponInstances?: PlayerWeaponInstance[];
    armorInstances?: PlayerArmorInstance[];
  } | null) => void;
  removeInstances: (targets: Array<{ kind: "weapon" | "armor"; instanceId: string }>) => void;
  patchWeaponEnhance: (instanceId: string, enhanceLevel: number) => void;
  patchArmorEnhance: (instanceId: string, enhanceLevel: number) => void;
  patchStackQty: (itemId: string, delta: number) => void;
};

export const usePlayerEquipmentStore = create<PlayerEquipmentStore>((set, get) => ({
  inventory: [],
  weaponInstances: [],
  armorInstances: [],
  setEquipment: (data) => {
    if (!data) {
      set({ inventory: [], weaponInstances: [], armorInstances: [] });
      return;
    }
    set((prev) => ({
      inventory: data.inventory ?? prev.inventory,
      weaponInstances: data.weaponInstances ?? prev.weaponInstances,
      armorInstances: data.armorInstances ?? prev.armorInstances,
    }));
  },
  removeInstances: (targets) => {
    const weaponDrop = new Set(
      targets.filter((t) => t.kind === "weapon").map((t) => t.instanceId),
    );
    const armorDrop = new Set(targets.filter((t) => t.kind === "armor").map((t) => t.instanceId));
    set((prev) => ({
      weaponInstances: prev.weaponInstances.filter((w) => !weaponDrop.has(w.id)),
      armorInstances: prev.armorInstances.filter((a) => !armorDrop.has(a.id)),
    }));
  },
  patchWeaponEnhance: (instanceId, enhanceLevel) => {
    set((prev) => ({
      weaponInstances: prev.weaponInstances.map((w) =>
        w.id === instanceId ? { ...w, enhanceLevel } : w,
      ),
    }));
  },
  patchArmorEnhance: (instanceId, enhanceLevel) => {
    set((prev) => ({
      armorInstances: prev.armorInstances.map((a) =>
        a.id === instanceId ? { ...a, enhanceLevel } : a,
      ),
    }));
  },
  patchStackQty: (itemId, delta) => {
    set((prev) => ({
      inventory: prev.inventory
        .map((row) => {
          if (row.itemId !== itemId) return row;
          const qty = Math.max(0, row.quantity + delta);
          return { ...row, quantity: qty };
        })
        .filter((row) => row.quantity > 0),
    }));
  },
}));
