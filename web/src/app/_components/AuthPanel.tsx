"use client";

import { useEffect, useState } from "react";

type MeResp = { ok: true; user: { id: string; username: string } | null };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

function setDevUserId(userId: string) {
  try {
    localStorage.setItem("dev_userId", userId);
    window.dispatchEvent(new Event("dev_user_changed"));
  } catch {}
}

export function AuthPanel() {
  const [me, setMe] = useState<MeResp["user"]>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<any>(null);

  async function refresh() {
    try {
      const r = await getJson<MeResp>("/api/auth/me");
      setMe(r.user ?? null);
      if (r.user?.id) setDevUserId(r.user.id);
    } catch (e) {
      setMe(null);
      setError(e);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

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
                void postJson("/api/auth/logout", {}).then(
                  () => {
                    setDevUserId("");
                    setMe(null);
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
              void postJson<{ ok: true; user: { id: string; username: string } }>("/api/auth/login", {
                username,
              }).then(
                (r) => {
                  setMe(r.user);
                  setDevUserId(r.user.id);
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

      {error ? (
        <pre className="mt-3 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
          {JSON.stringify(error, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

