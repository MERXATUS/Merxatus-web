"use client";

import { GOOGLE_LOGIN_PATH } from "@/shared/googleLogin";

export function LoginWelcomePanel() {
  return (
    <section className="login-welcome" aria-label="로그인 안내">
      <div className="login-welcome__glow" aria-hidden />
      <p className="login-welcome__eyebrow">Merxatus</p>
      <h2 className="login-welcome__title">Google 계정으로 시작하세요</h2>
      <p className="login-welcome__lead">
        누구나 가입할 수 있습니다. 로그인하면 골드·미니언·인벤토리가 생성되고 튜토리얼을 바로 진행할 수 있어요.
      </p>
      <a className="login-welcome__btn" href={GOOGLE_LOGIN_PATH}>
        Google 로그인
      </a>
      <p className="login-welcome__hint">
        처음 로그인 시 닉네임을 정한 뒤, 홈에서 튜토리얼을 따라가면 됩니다.
      </p>
    </section>
  );
}
