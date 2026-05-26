"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { apiGetJson, apiPostJson } from "@/shared/sessionClient";

type ChatMsg = {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
};

type ChatPanelProps = {
  layout?: "sidebar" | "drawer";
  onMinimize?: () => void;
  /** false면 폴링 안 함 (채팅 드로어 닫힘 등) */
  pollingEnabled?: boolean;
};

const CHAT_POLL_MS = 12_000;

export function ChatPanel({ layout = "sidebar", onMinimize, pollingEnabled = true }: ChatPanelProps) {
  const isDrawer = layout === "drawer";
  const { user } = useSessionUser();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    if (!user) return;
    try {
      const qs = new URLSearchParams({ channel: "world", limit: "80" });
      const r = await apiGetJson<{ ok: boolean; messages: ChatMsg[] }>(`/api/chat/messages?${qs.toString()}`);
      if (r?.ok && Array.isArray(r.messages)) setMessages(r.messages);
      setError(null);
    } catch {
      /* 폴링 실패는 조용히 무시 */
    }
  }, [user]);

  useEffect(() => {
    if (!user || !pollingEnabled) return;
    void fetchMessages();
    const t = setInterval(() => void fetchMessages(), CHAT_POLL_MS);
    return () => clearInterval(t);
  }, [user, pollingEnabled, fetchMessages]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    if (!user || busy) return;
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await apiPostJson("/api/chat/send", { channel: "world", body: text });
      setDraft("");
      await fetchMessages();
    } catch (e: unknown) {
      const o = e as { error?: string };
      const msg = o?.error;
      setError(
        msg === "UNAUTHORIZED"
          ? "로그인이 필요해요. 화면 오른쪽 위 로그인을 눌러 주세요."
          : msg === "CHAT_BACKEND_UNAVAILABLE"
            ? "채팅 백엔드가 아직 준비되지 않았어요. 터미널에서 npx prisma generate 후 dev 서버를 다시 켜 주세요."
            : msg ?? "전송 실패",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        isDrawer ? "flex h-full min-h-0 flex-col text-[var(--game-text)]" : "game-panel"
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="game-label">세계 채팅</div>
        <div className="flex items-center gap-2">
          {isDrawer && onMinimize ? (
            <button
              type="button"
              onClick={onMinimize}
              className="game-btn game-btn-ghost h-7 px-2 text-[10px]"
            >
              축소
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-1 shrink-0 text-xs text-[var(--game-muted)]">로그인한 유저만 읽기·쓰기 가능해요.</p>

      {error ? (
        <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
          {error}
        </div>
      ) : null}

      <div
        ref={listRef}
        className={
          isDrawer
            ? "mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl border border-[var(--game-border)] bg-black/25 px-2 py-2"
            : "mt-3 flex h-52 flex-col gap-2 overflow-y-auto rounded-xl border border-[var(--game-border)] bg-black/25 px-2 py-2"
        }
      >
        {!user ? (
          <div className="flex flex-1 items-center justify-center text-center text-xs text-zinc-500">
            로그인 후 채팅을 쓸 수 있어요.
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center text-xs text-zinc-400">
            아직 메시지가 없어요. 첫 인사를 남겨 보세요!
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-[var(--game-border)] bg-[var(--game-bg-card)] px-2 py-1.5 text-xs"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-1">
                <span className="font-semibold text-[var(--game-gold-bright)]">{m.username}</span>
                <span className="text-[10px] tabular-nums text-[var(--game-muted)]">
                  {new Date(m.createdAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="mt-0.5 whitespace-pre-wrap break-words text-[var(--game-text)]">{m.body}</div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex shrink-0 gap-2">
        <textarea
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--game-border)] bg-black/30 px-3 py-2 text-xs text-[var(--game-text)] outline-none placeholder:text-[var(--game-muted-dim)] disabled:opacity-50"
          placeholder={user ? "메시지 입력…" : "로그인 필요"}
          rows={2}
          maxLength={520}
          disabled={!user || busy}
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
          className="game-btn game-btn-gold h-auto shrink-0 self-end px-4 py-2"
          disabled={!user || busy || !draft.trim()}
          onClick={() => void send()}
        >
          보내기
        </button>
      </div>
    </div>
  );
}
