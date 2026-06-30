import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LEGACY_PATH_TO_TAB: Record<string, string> = {
  "/market": "market",
  "/dungeon": "dungeon",
  "/dungeons": "dungeon",
  "/raid": "raid",
  "/tower": "tower",
  "/pvp": "pvp",
  "/ranking": "ranking",
  "/enhance": "enhance",
  "/inventory": "inventory",
  "/codex": "codex",
};

export function middleware(request: NextRequest) {
  const tab = LEGACY_PATH_TO_TAB[request.nextUrl.pathname];
  if (!tab) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("tab", tab);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/market",
    "/dungeon",
    "/dungeons",
    "/raid",
    "/tower",
    "/pvp",
    "/ranking",
    "/enhance",
    "/inventory",
    "/codex",
  ],
};
