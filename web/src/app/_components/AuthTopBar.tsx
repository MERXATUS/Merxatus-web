"use client";

import { useEffect, useState } from "react";
import { useSessionUser } from "@/app/_components/SessionProvider";
import { googleAuthErrorMessage } from "@/shared/googleAuthErrors";
import { GOOGLE_LOGIN_PATH } from "@/shared/googleLogin";

export function AuthTopBar() {
  const { user } = useSessionUser();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      setAuthError(googleAuthErrorMessage(err));
      params.delete("auth_error");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `/?${qs}` : "/");
    }
  }, []);

  if (user) return null;

  return (
    <div className="auth-corner flex flex-col items-end gap-1">
      {authError ? (
        <p className="max-w-[min(100vw-2rem,22rem)] whitespace-pre-line text-right text-xs text-red-400">
          {authError}
        </p>
      ) : null}
      <a className="auth-corner-link" href={GOOGLE_LOGIN_PATH}>
        로그인
      </a>
    </div>
  );
}
