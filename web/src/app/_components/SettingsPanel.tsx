"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GameBtn } from "@/app/_components/gameUi";
import { GuestLoginButton } from "@/app/_components/GuestLoginButton";
import { GOOGLE_LOGIN_PATH } from "@/shared/googleLogin";
import {
  USERNAME_MAX_LEN,
  usernameChangeErrorMessage,
  validateUsername,
} from "@/shared/usernameRules";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { notifyTutorialRefresh } from "@/app/_components/TutorialPanel";

const SHOW_DEV_ACCOUNT_RESET = process.env.NODE_ENV === "development";

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  username: string | null;
  userId: string | null;
  loggedIn: boolean;
  onLogout: () => void | Promise<void>;
  logoutBusy?: boolean;
  onRefresh?: () => void | Promise<void>;
  onUsernameChanged?: (username: string) => void;
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const json = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw json;
  return json;
}

export function SettingsPanel(props: SettingsPanelProps) {
  useEscapeClose(props.open, props.onClose);

  const [renameOpen, setRenameOpen] = useState(false);
  const [draftUsername, setDraftUsername] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) {
      setRenameOpen(false);
      setRenameError(null);
      setResetMessage(null);
      return;
    }
    setDraftUsername(props.username ?? "");
  }, [props.open, props.username]);

  function openRename() {
    setDraftUsername(props.username ?? "");
    setRenameError(null);
    setRenameOpen(true);
  }

  function closeRename() {
    setRenameOpen(false);
    setRenameError(null);
    setDraftUsername(props.username ?? "");
  }

  async function submitRename() {
    const checked = validateUsername(draftUsername);
    if (!checked.ok) {
      setRenameError(usernameChangeErrorMessage(checked.code));
      return;
    }
    if (checked.username === props.username) {
      setRenameError(usernameChangeErrorMessage("SAME_USERNAME"));
      return;
    }

    setRenameBusy(true);
    setRenameError(null);
    try {
      const r = await postJson<{ ok: true; user: { id: string; username: string } }>("/api/user/username", {
        username: checked.username,
      });
      props.onUsernameChanged?.(r.user.username);
      await props.onRefresh?.();
      setRenameOpen(false);
    } catch (e) {
      const err =
        typeof e === "object" && e !== null && "error" in e ? String((e as { error: unknown }).error) : "";
      setRenameError(usernameChangeErrorMessage(err));
    } finally {
      setRenameBusy(false);
    }
  }

  async function resetTutorialAccount() {
    const ok = window.confirm(
      "튜토리얼 진행을 처음부터 다시 합니다.\n\n골드·인벤·시설·미니언은 그대로 둡니다. 계속할까요?",
    );
    if (!ok) return;

    setResetBusy(true);
    setResetMessage(null);
    try {
      const r = await postJson<{ ok: true; warning?: string; reset?: string[] }>(
        "/api/dev/account-reset",
        {},
      );
      setResetMessage(
        r.warning
          ? `일부만 초기화됨: ${r.warning}`
          : "초기화했어요. 홈에서 튜토리얼을 다시 진행할 수 있어요.",
      );
      notifyTutorialRefresh();
      window.dispatchEvent(new Event("auth_session_changed"));
      await props.onRefresh?.();
    } catch (e) {
      const body =
        typeof e === "object" && e !== null
          ? (e as { error?: unknown; hint?: unknown; message?: unknown; prismaCode?: unknown })
          : {};
      const err = body.error != null ? String(body.error) : "";
      const hint = body.hint != null ? String(body.hint) : "";
      const detail = body.message != null ? String(body.message) : "";
      setResetMessage(
        err === "DEV_ONLY"
          ? "개발 서버에서만 사용할 수 있어요."
          : hint
            ? hint
            : err
              ? `실패: ${err}${body.prismaCode ? ` (${String(body.prismaCode)})` : ""}${detail ? ` — ${detail.slice(0, 120)}` : ""}`
              : "초기화에 실패했어요.",
      );
    } finally {
      setResetBusy(false);
    }
  }

  if (!props.open) return null;

  const modal = (
    <div className="game-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 z-[1] bg-black/50"
        onClick={props.onClose}
      />
      <div className="game-overlay__panel settings-modal game-modal absolute inset-x-3 top-[12%] mx-auto max-h-[min(36rem,85dvh)] w-full max-w-md overflow-hidden rounded-2xl shadow-2xl sm:inset-x-auto">
        <div className="game-modal-header flex items-center justify-between gap-3 px-5 py-4">
          <h2 id="settings-title" className="text-sm font-semibold text-[var(--game-text)]">
            설정
          </h2>
          <GameBtn variant="ghost" onClick={props.onClose}>
            닫기
          </GameBtn>
        </div>

        <div className="settings-modal__body overflow-y-auto px-5 py-4">
          <section className="settings-section">
            <h3 className="settings-section__title">계정</h3>
            {props.loggedIn ? (
              <>
                <dl className="settings-dl">
                  <div>
                    <dt>지휘관</dt>
                    <dd>{props.username ?? "—"}</dd>
                  </div>
                  {props.userId ? (
                    <div>
                      <dt>유저 ID</dt>
                      <dd className="settings-dl__mono">{props.userId}</dd>
                    </div>
                  ) : null}
                </dl>

                {renameOpen ? (
                  <div className="settings-rename">
                    <label className="settings-rename__label" htmlFor="settings-username">
                      새 닉네임
                    </label>
                    <input
                      id="settings-username"
                      className="settings-rename__input market-input"
                      value={draftUsername}
                      maxLength={USERNAME_MAX_LEN}
                      disabled={renameBusy}
                      autoComplete="nickname"
                      onChange={(e) => setDraftUsername(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitRename();
                        if (e.key === "Escape") closeRename();
                      }}
                    />
                    <p className="settings-hint">
                      {USERNAME_MAX_LEN}자 이하 · 한글·영문·숫자·_ - . 만 가능
                    </p>
                    {renameError ? <p className="settings-rename__error">{renameError}</p> : null}
                    <div className="settings-rename__actions">
                      <button
                        type="button"
                        className="settings-btn settings-btn--primary"
                        disabled={renameBusy}
                        onClick={() => void submitRename()}
                      >
                        {renameBusy ? "저장 중…" : "저장"}
                      </button>
                      <button
                        type="button"
                        className="settings-btn settings-btn--ghost"
                        disabled={renameBusy}
                        onClick={closeRename}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="settings-btn settings-btn--ghost" onClick={openRename}>
                    닉네임 변경
                  </button>
                )}
              </>
            ) : (
              <p className="settings-hint">로그인하면 계정 정보와 게임 진행이 저장돼요.</p>
            )}

            <div className="settings-actions">
              {props.loggedIn ? (
                <button
                  type="button"
                  className="settings-btn settings-btn--danger"
                  disabled={props.logoutBusy || renameBusy}
                  onClick={() => void props.onLogout()}
                >
                  {props.logoutBusy ? "처리 중…" : "로그아웃"}
                </button>
              ) : (
                <>
                  <a className="settings-btn settings-btn--primary" href={GOOGLE_LOGIN_PATH}>
                    Google 로그인
                  </a>
                  <GuestLoginButton className="settings-btn settings-btn--ghost">게스트로 시작</GuestLoginButton>
                </>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h3 className="settings-section__title">게임</h3>
            <p className="settings-hint">홈 화면 요약·골드·인벤 정보를 다시 불러옵니다.</p>
            {props.onRefresh ? (
              <button
                type="button"
                className="settings-btn settings-btn--ghost"
                disabled={renameBusy || resetBusy}
                onClick={() => {
                  if (props.onRefresh) void props.onRefresh();
                }}
              >
                데이터 새로고침
              </button>
            ) : null}
          </section>

          {SHOW_DEV_ACCOUNT_RESET && props.loggedIn ? (
            <section className="settings-section settings-section--dev">
              <h3 className="settings-section__title">개발용</h3>
              <p className="settings-hint">
                튜토리얼 진행만 초기화합니다. (로컬 개발 서버 전용)
              </p>
              <button
                type="button"
                className="settings-btn settings-btn--danger"
                disabled={!props.userId || renameBusy || resetBusy}
                onClick={() => void resetTutorialAccount()}
              >
                {resetBusy ? "초기화 중…" : "튜토리얼 초기화"}
              </button>
              {resetMessage ? <p className="settings-hint settings-hint--status">{resetMessage}</p> : null}
            </section>
          ) : null}

          <p className="settings-footer">
            Merxatus ·{" "}
            <a href="/terms" className="settings-footer__link">
              이용약관
            </a>
            {" · "}
            <a href="/privacy" className="settings-footer__link">
              개인정보
            </a>
          </p>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
