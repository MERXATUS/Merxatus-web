"use client";

import { GuestLoginButton } from "@/app/_components/GuestLoginButton";
import { GOOGLE_LOGIN_PATH } from "@/shared/googleLogin";

export function LoginWelcomePanel() {
  return (
    <section className="login-welcome" aria-label="로그인 안내">
      <div className="login-welcome__glow" aria-hidden />
      <p className="login-welcome__eyebrow">Merxatus</p>
      <h2 className="login-welcome__title">게임을 시작해 보세요</h2>
      <p className="login-welcome__lead">
        Google 계정으로 로그인하면 진행이 저장됩니다. 게스트로 시작하면 바로 체험할 수 있어요.
      </p>
      <div className="login-welcome__actions">
        <a className="login-welcome__btn" href={GOOGLE_LOGIN_PATH}>
          Google 로그인
        </a>
        <GuestLoginButton variant="primary">게스트로 시작</GuestLoginButton>
      </div>
      <p className="login-welcome__hint">
        게스트 계정은 브라우저를 바꾸거나 로그아웃하면 다시 찾기 어려울 수 있어요. 장기 플레이는 Google 로그인을 권장합니다.
      </p>
    </section>
  );
}
