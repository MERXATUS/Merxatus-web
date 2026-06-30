"use client";

import { useState } from "react";
import { GUEST_LOGIN_API } from "@/shared/guestLogin";
import { formatPanelError } from "@/shared/formatPanelError";
import { apiPostJson, notifySessionChanged } from "@/shared/sessionClient";

type GuestLoginButtonProps = {
  className?: string;
  variant?: "primary" | "ghost";
  children?: React.ReactNode;
  onError?: (message: string) => void;
};

export function GuestLoginButton({
  className,
  variant = "ghost",
  children,
  onError,
}: GuestLoginButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPostJson(GUEST_LOGIN_API, {});
      notifySessionChanged();
    } catch (e) {
      const message = formatPanelError(e);
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  const baseClass =
    variant === "primary" ? "login-welcome__btn login-welcome__btn--guest" : "auth-corner-link auth-corner-link--guest";

  return (
    <>
      <button type="button" className={className ?? baseClass} disabled={busy} onClick={() => void handleClick()}>
        {busy ? "준비 중…" : (children ?? "게스트로 시작")}
      </button>
      {error && variant === "primary" ? <p className="login-welcome__error">{error}</p> : null}
    </>
  );
}
