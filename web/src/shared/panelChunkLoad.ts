/** 동적 패널 청크 — prefetch 실패·HMR 불일치 시 앱이 죽지 않게 */

export function isChunkLoadError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = (e as { name?: string }).name;
  if (name === "ChunkLoadError") return true;
  const msg = (e as { message?: string }).message;
  return typeof msg === "string" && /loading chunk|chunkloaderror|failed to fetch dynamically imported module/i.test(msg);
}

/** 탭 진입 시 dynamic() 로더 — 1회 재시도 */
export async function loadPanelChunk<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (e) {
    if (!isChunkLoadError(e)) throw e;
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    return loader();
  }
}

const inflightPrefetch = new Set<string>();
const donePrefetch = new Set<string>();

/** hover prefetch — 실패해도 UI에 노출하지 않음 */
export function prefetchPanelChunk(id: string, loader: () => Promise<unknown>) {
  if (typeof window === "undefined") return;
  if (donePrefetch.has(id) || inflightPrefetch.has(id)) return;
  inflightPrefetch.add(id);
  void loadPanelChunk(loader)
    .then(() => {
      donePrefetch.add(id);
    })
    .catch(() => {
      /* dev 컴파일 지연·stale chunk — 탭 클릭 시 dynamic()이 재시도 */
    })
    .finally(() => {
      inflightPrefetch.delete(id);
    });
}
