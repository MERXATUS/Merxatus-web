"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GameBtn } from "@/app/_components/gameUi";
import { USERNAME_MAX_LEN, usernameChangeErrorMessage, validateUsername } from "@/shared/usernameRules";
import { apiPostJson, notifySessionChanged } from "@/shared/sessionClient";

export function UsernameSetupModal(props: { open: boolean; currentUsername: string | null }) {
  const { open, currentUsername } = props;
  const [draftUsername, setDraftUsername] = useState(currentUsername ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftUsername(currentUsername ?? "");
    setError(null);
  }, [open, currentUsername]);

  async function submit() {
    const checked = validateUsername(draftUsername);
    if (!checked.ok) {
      setError(usernameChangeErrorMessage(checked.code));
      return;
    }
    if (checked.username === currentUsername) {
      setError(usernameChangeErrorMessage("SAME_USERNAME"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPostJson<{ ok: true; user: { id: string; username: string } }>("/api/user/username", {
        username: checked.username,
      });
      notifySessionChanged();
    } catch (e) {
      const code =
        typeof e === "object" && e !== null && "error" in e ? String((e as { error: unknown }).error) : "";
      setError(usernameChangeErrorMessage(code));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const modal = (
    <div className="game-overlay game-overlay--top" role="dialog" aria-modal="true" aria-labelledby="username-setup-title">
      <div className="absolute inset-0 z-[1] bg-black/60" />
      <div className="game-overlay__panel game-modal absolute inset-x-3 top-[12%] mx-auto w-full max-w-md overflow-hidden rounded-2xl shadow-2xl sm:inset-x-auto">
        <div className="game-modal-header flex items-center justify-between gap-3 px-5 py-4">
          <h2 id="username-setup-title" className="text-sm font-semibold text-[var(--game-text)]">
            처음 오셨군요! 닉네임을 정해 주세요
          </h2>
        </div>
        <div className="px-5 py-4">
          <label className="block text-xs text-[var(--game-muted)]" htmlFor="username-setup-input">
            닉네임
          </label>
          <input
            id="username-setup-input"
            className="market-input mt-2 w-full"
            value={draftUsername}
            maxLength={USERNAME_MAX_LEN}
            disabled={busy}
            autoComplete="nickname"
            placeholder="예: merxatus"
            onChange={(e) => setDraftUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <p className="mt-2 text-xs text-[var(--game-muted)]">
            {USERNAME_MAX_LEN}자 이하 · 한글/영문/숫자/밑줄(_)·하이픈(-)·마침표(.)만 가능 · 중복 불가
          </p>
          {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <GameBtn disabled={busy} onClick={() => void submit()}>
              {busy ? "저장 중…" : "시작하기"}
            </GameBtn>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}

