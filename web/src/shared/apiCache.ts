type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 20_000;

export function apiCacheKey(url: string) {
  return url.split("#")[0] ?? url;
}

export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    inflight.clear();
    return;
  }
  const p = prefix.trim();
  for (const key of [...store.keys()]) {
    if (key.startsWith(p)) store.delete(key);
  }
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(p)) inflight.delete(key);
  }
}

export async function withApiCache<T>(
  url: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number; force?: boolean },
): Promise<T> {
  const key = apiCacheKey(url);
  const ttl = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();

  if (!opts?.force) {
    const hit = store.get(key) as CacheEntry<T> | undefined;
    if (hit && now - hit.fetchedAt < ttl) return hit.data;
    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
  }

  const promise = fetcher()
    .then((data) => {
      store.set(key, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** stale-while-revalidate — 캐시가 있으면 즉시 반환, TTL 지나면 백그라운드 갱신 */
export async function withApiCacheSwr<T>(
  url: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number; force?: boolean; onRevalidate?: (data: T) => void },
): Promise<T> {
  const key = apiCacheKey(url);
  const ttl = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  const hit = store.get(key) as CacheEntry<T> | undefined;

  if (!opts?.force && hit) {
    const fresh = now - hit.fetchedAt < ttl;
    if (fresh) return hit.data;

    if (!inflight.has(key)) {
      const promise = fetcher()
        .then((data) => {
          store.set(key, { data, fetchedAt: Date.now() });
          opts?.onRevalidate?.(data);
          return data;
        })
        .finally(() => {
          if (inflight.get(key) === promise) inflight.delete(key);
        });
      inflight.set(key, promise);
      void promise.catch(() => {});
    }

    return hit.data;
  }

  return withApiCache(url, fetcher, opts);
}

/** 자주 쓰는 GET TTL (ms) */
export const API_CACHE_TTL = {
  auth: 30_000,
  bootstrap: 15_000,
  summary: 15_000,
  dashboardLight: 20_000,
  meState: 12_000,
  meStateInventory: 12_000,
  meStateWeapons: 12_000,
  meStateArmor: 12_000,
  meStateMarket: 15_000,
  raidsEntry: 12_000,
  raidsList: 120_000,
  dungeonsList: 120_000,
  towerLeaderboard: 60_000,
  leaderboard: 60_000,
  leaderboardBoards: 120_000,
  minionPartyPick: 45_000,
  minionPanel: 20_000,
  pvpState: 15_000,
  pvpHistory: 30_000,
  friendsList: 30_000,
  runState: 4_000,
} as const;
