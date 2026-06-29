import { API_CACHE_TTL } from "@/shared/apiCache";
import { apiGetJsonCached, apiGetJsonCachedSwr } from "@/shared/sessionClient";

export type MeEquipmentState = {
  inventory: Awaited<ReturnType<typeof fetchScope<"inventory">>>;
  weapons: Awaited<ReturnType<typeof fetchScope<"weapons">>>;
  armor: Awaited<ReturnType<typeof fetchScope<"armor">>>;
};

type MeStateResponse = { ok: boolean };

async function fetchScope(scope: "inventory" | "weapons" | "armor") {
  const ttl =
    scope === "inventory"
      ? API_CACHE_TTL.meStateInventory
      : scope === "weapons"
        ? API_CACHE_TTL.meStateWeapons
        : API_CACHE_TTL.meStateArmor;
  return apiGetJsonCached<MeStateResponse>(`/api/me/state?scope=${scope}`, { ttlMs: ttl });
}

export async function loadMeEquipmentState(opts?: {
  force?: boolean;
  swr?: boolean;
  onRevalidate?: (state: MeEquipmentState) => void;
}): Promise<MeEquipmentState> {
  const fetchOne = (scope: "inventory" | "weapons" | "armor") => {
    const url = `/api/me/state?scope=${scope}`;
    const ttl =
      scope === "inventory"
        ? API_CACHE_TTL.meStateInventory
        : scope === "weapons"
          ? API_CACHE_TTL.meStateWeapons
          : API_CACHE_TTL.meStateArmor;
    if (opts?.swr) {
      return apiGetJsonCachedSwr<MeStateResponse>(url, {
        ttlMs: ttl,
        force: opts?.force,
        onRevalidate: (partial) => {
          if (!opts?.onRevalidate) return;
          /* 개별 scope 갱신 시 전체 재조합은 호출측 refresh에서 처리 */
          void partial;
        },
      });
    }
    return apiGetJsonCached<MeStateResponse>(url, { ttlMs: ttl, force: opts?.force });
  };

  const [inventory, weapons, armor] = await Promise.all([
    fetchOne("inventory"),
    fetchOne("weapons"),
    fetchOne("armor"),
  ]);
  const bundle = { inventory, weapons, armor };
  return bundle;
}

/** 탭 hover prefetch */
export function prefetchMeEquipmentState() {
  void loadMeEquipmentState({ swr: true }).catch(() => {});
}
