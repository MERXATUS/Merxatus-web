"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatMsg = {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

function getUserIdFromStorage() {
  try {
    return localStorage.getItem("dev_userId") ?? "";
  } catch {
    return "";
  }
}

export function ChatPanel() {
  const [userId, setUserId] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUserId(getUserIdFromStorage());
    function onChanged() {
      setUserId(getUserIdFromStorage());
    }
    window.addEventListener("dev_user_changed", onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener("dev_user_changed", onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!userId) return;
    try {
      const qs = new URLSearchParams({ channel: "world", limit: "80" });
      if (userId) qs.set("userId", userId);
      const r = await getJson<{ ok: boolean; messages: ChatMsg[] }>(`/api/chat/messages?${qs.toString()}`);
      if (r?.ok && Array.isArray(r.messages)) setMessages(r.messages);
      setError(null);
    } catch {
      /* 폴링 실패는 조용히 무시 */
    }
  }, [userId]);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!userId) return;
    const t = setInterval(() => void fetchMessages(), 3500);
    return () => clearInterval(t);
  }, [userId, fetchMessages]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    if (!userId || busy) return;
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/chat/send", { channel: "world", body: text, userId: userId || undefined });
      setDraft("");
      await fetchMessages();
    } catch (e: unknown) {
      const o = e as { error?: string };
      const msg = o?.error;
      setError(
        msg === "UNAUTHORIZED"
          ? "로그인이 필요해요. 왼쪽 빠른 메뉴에서 로그인하거나 계정을 선택해 주세요."
          : msg === "CHAT_BACKEND_UNAVAILABLE"
            ? "채팅 백엔드가 아직 준비되지 않았어요. 터미널에서 npx prisma generate 후 dev 서버를 다시 켜 주세요."
            : msg ?? "전송 실패",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">세계 채팅</div>
        <span className="text-[10px] font-semibold text-zinc-400">폴링 ~3.5초</span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">로그인한 유저만 읽기·쓰기 가능해요.</p>

      {error ? (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">
          {error}
        </div>
      ) : null}

      <div
        ref={listRef}
        className="mt-3 flex h-52 flex-col gap-2 overflow-y-auto rounded-xl border border-zinc-100 bg-zinc-50 px-2 py-2"
      >
        {!userId ? (
          <div className="flex flex-1 items-center justify-center text-center text-xs text-zinc-500">
            로그인 후 채팅을 쓸 수 있어요.
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center text-xs text-zinc-400">
            아직 메시지가 없어요. 첫 인사를 남겨 보세요!
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="rounded-lg bg-white px-2 py-1.5 text-xs shadow-sm ring-1 ring-zinc-100">
              <div className="flex flex-wrap items-baseline justify-between gap-1">
                <span className="font-semibold text-zinc-900">{m.username}</span>
                <span className="text-[10px] tabular-nums text-zinc-400">
                  {new Date(m.createdAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="mt-0.5 whitespace-pre-wrap break-words text-zinc-800">{m.body}</div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <textarea
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs outline-none placeholder:text-zinc-400 disabled:opacity-50"
          placeholder={userId ? "메시지 입력…" : "로그인 필요"}
          rows={2}
          maxLength={520}
          disabled={!userId || busy}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          className="h-auto shrink-0 self-end rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          disabled={!userId || busy || !draft.trim()}
          onClick={() => void send()}
        >
          보내기
        </button>
      </div>
    </div>
  );
}
