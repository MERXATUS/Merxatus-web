export const FORGE_OPEN_REQUEST_KEY = "merxatus_forge_open_v1";
export const FORGE_OPEN_EVENT = "merxatus_forge_open";

export type ForgeOpenRequest = {
  mode?: "enhance" | "craft";
  kind: "weapon" | "armor";
  instanceId: string;
};

export function notifyOpenForge(req: ForgeOpenRequest) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FORGE_OPEN_REQUEST_KEY, JSON.stringify(req));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(FORGE_OPEN_EVENT));
}

export function consumeForgeOpenRequest(): ForgeOpenRequest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FORGE_OPEN_REQUEST_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FORGE_OPEN_REQUEST_KEY);
    const parsed = JSON.parse(raw) as ForgeOpenRequest;
    if (!parsed?.instanceId || (parsed.kind !== "weapon" && parsed.kind !== "armor")) return null;
    return parsed;
  } catch {
    return null;
  }
}
