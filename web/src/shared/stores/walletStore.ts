import { create } from "zustand";

type WalletSnapshot = {
  goldAvailable: number;
  goldLocked: number;
  todayNetGold: number;
};

type WalletStore = WalletSnapshot & {
  goldAvailableDisplay: number | null;
  setWallet: (w: Partial<WalletSnapshot> | null) => void;
  /** 낙관적 차감/증가 — 롤백 함수 반환 */
  optimisticGoldDelta: (delta: number) => () => void;
};

export const useWalletStore = create<WalletStore>((set, get) => ({
  goldAvailable: 0,
  goldLocked: 0,
  todayNetGold: 0,
  goldAvailableDisplay: null,
  setWallet: (w) => {
    if (!w) {
      set({
        goldAvailable: 0,
        goldLocked: 0,
        todayNetGold: 0,
        goldAvailableDisplay: null,
      });
      return;
    }
    set((prev) => ({
      goldAvailable: w.goldAvailable ?? prev.goldAvailable,
      goldLocked: w.goldLocked ?? prev.goldLocked,
      todayNetGold: w.todayNetGold ?? prev.todayNetGold,
      goldAvailableDisplay: w.goldAvailable ?? prev.goldAvailableDisplay,
    }));
  },
  optimisticGoldDelta: (delta) => {
    const base = get().goldAvailableDisplay ?? get().goldAvailable;
    const next = Math.max(0, Math.floor(base + delta));
    set({ goldAvailableDisplay: next });
    return () => set({ goldAvailableDisplay: base });
  },
}));

export function selectGoldAvailable(state: WalletStore) {
  return state.goldAvailableDisplay ?? state.goldAvailable;
}
