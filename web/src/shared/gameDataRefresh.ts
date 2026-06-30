import { API_CACHE_TTL } from "@/shared/apiCache";
import type { GameDataScope } from "@/shared/gameFramePatch";
import {
  usePlayerEquipmentStore,
  type PlayerArmorInstance,
  type PlayerInventoryStack,
  type PlayerWeaponInstance,
} from "@/shared/stores/playerEquipmentStore";
import { useWalletStore } from "@/shared/stores/walletStore";
import { apiGetJsonCached, BOOTSTRAP_FETCH_TIMEOUT_MS } from "@/shared/sessionClient";
import type { MeBootstrap, MeSummary } from "@/shared/meSummary";

function scopesNeedBootstrap(scopes: GameDataScope[]) {
  return scopes.includes("all") || scopes.includes("wallet") || scopes.includes("summary");
}

function scopesNeedInventory(scopes: GameDataScope[]) {
  return scopes.includes("all") || scopes.includes("inventory") || scopes.includes("enhance");
}

function scopesNeedWeapons(scopes: GameDataScope[]) {
  return scopes.includes("all") || scopes.includes("weapons") || scopes.includes("enhance");
}

function scopesNeedArmor(scopes: GameDataScope[]) {
  return scopes.includes("all") || scopes.includes("armor") || scopes.includes("enhance");
}

function scopesNeedMarket(scopes: GameDataScope[]) {
  return scopes.includes("all") || scopes.includes("market");
}

/** GameFrame·패널 공통 — scope별 API 재조회 후 zustand 반영 */
export async function refreshGameDataScopes(
  scopes: GameDataScope[],
  opts?: {
    force?: boolean;
    onBootstrap?: (data: MeBootstrap) => void;
  },
) {
  const unique = [...new Set(scopes)];
  if (unique.length === 0) return;

  const tasks: Promise<void>[] = [];

  if (scopesNeedBootstrap(unique)) {
    tasks.push(
      (async () => {
        const summary = await apiGetJsonCached<MeSummary>("/api/me/summary", {
          ttlMs: API_CACHE_TTL.summary,
          timeoutMs: BOOTSTRAP_FETCH_TIMEOUT_MS,
          force: opts?.force,
        });
        if (!summary?.ok) return;
        useWalletStore.getState().setWallet({
          goldAvailable: summary.wallet.goldAvailable,
          goldLocked: summary.wallet.goldLocked,
          todayNetGold: summary.todayNetGold,
        });
        opts?.onBootstrap?.({ ok: true, summary });
      })(),
    );
  }

  if (scopesNeedInventory(unique)) {
    tasks.push(
      apiGetJsonCached<{ ok: boolean; inventory?: PlayerInventoryStack[] }>(
        "/api/me/state?scope=inventory",
        {
          ttlMs: API_CACHE_TTL.meStateInventory,
          force: opts?.force,
          timeoutMs: BOOTSTRAP_FETCH_TIMEOUT_MS,
        },
      ).then((data) => {
        if (!data?.ok) return;
        usePlayerEquipmentStore.getState().setEquipment({ inventory: data.inventory ?? [] });
      }),
    );
  }

  if (scopesNeedWeapons(unique)) {
    tasks.push(
      apiGetJsonCached<{ ok: boolean; weaponInstances?: PlayerWeaponInstance[] }>(
        "/api/me/state?scope=weapons",
        {
          ttlMs: API_CACHE_TTL.meStateWeapons,
          force: opts?.force,
          timeoutMs: BOOTSTRAP_FETCH_TIMEOUT_MS,
        },
      ).then((data) => {
        if (!data?.ok) return;
        usePlayerEquipmentStore.getState().setEquipment({ weaponInstances: data.weaponInstances ?? [] });
      }),
    );
  }

  if (scopesNeedArmor(unique)) {
    tasks.push(
      apiGetJsonCached<{ ok: boolean; armorInstances?: PlayerArmorInstance[] }>(
        "/api/me/state?scope=armor",
        {
          ttlMs: API_CACHE_TTL.meStateArmor,
          force: opts?.force,
          timeoutMs: BOOTSTRAP_FETCH_TIMEOUT_MS,
        },
      ).then((data) => {
        if (!data?.ok) return;
        usePlayerEquipmentStore.getState().setEquipment({ armorInstances: data.armorInstances ?? [] });
      }),
    );
  }

  if (scopesNeedMarket(unique)) {
    tasks.push(
      apiGetJsonCached("/api/me/state?scope=market", {
        ttlMs: API_CACHE_TTL.meStateMarket,
        force: opts?.force,
        timeoutMs: BOOTSTRAP_FETCH_TIMEOUT_MS,
      }).then(() => {}),
    );
  }

  await Promise.all(tasks);
}
