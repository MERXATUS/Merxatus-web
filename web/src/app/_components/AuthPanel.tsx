"use client";

import { GamePanelError } from "@/app/_components/panelFeedback";
import { useSessionUser } from "@/app/_components/SessionProvider";

import { useEffect, useState } from "react";
import { apiPostJson, notifySessionChanged } from "@/shared/sessionClient";

export function AuthPanel() {
  const { user: me, refresh } = useSessionUser();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">로그인(간단)</div>
          <div className="mt-1 text-sm text-zinc-600">
            지금은 닉네임으로 바로 로그인해. 나중에 Google 로그인으로 교체/연동 가능하게 구조를 잡을 거야.
          </div>
        </div>
        <div className="text-xs text-zinc-500">세션: HttpOnly 쿠키</div>
      </div>

      {me ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            현재 유저: <span className="font-semibold">{me.username}</span>{" "}
            <span className="font-mono text-xs text-zinc-500">({me.id})</span>
          </div>
          <div className="flex gap-2">
            <button
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-50"
              disabled={!!busy}
              onClick={() => void refresh()}
            >
              새로고침
            </button>
            <button
              className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
              disabled={!!busy}
              onClick={() => {
                setBusy("logout");
                setError(null);
                void apiPostJson("/api/auth/logout", {}).then(
                  () => {
                    notifySessionChanged();
                    setBusy(null);
                  },
                  (e) => {
                    setError(e);
                    setBusy(null);
                  },
                );
              }}
            >
              로그아웃
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="닉네임 (예: yj030)"
            maxLength={32}
          />
          <button
            className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!!busy || !username.trim()}
            onClick={() => {
              setBusy("login");
              setError(null);
              void apiPostJson<{ ok: true; user: { id: string; username: string } }>("/api/auth/login", {
                username,
              }).then(
                () => {
                  notifySessionChanged();
                  setBusy(null);
                },
                (e) => {
                  setError(e);
                  setBusy(null);
                },
              );
            }}
          >
            로그인
          </button>
        </div>
      )}

      {error ? <GamePanelError error={error} className="mt-3" /> : null}
    </section>
  );
}
