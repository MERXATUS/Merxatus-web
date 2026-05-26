import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 — Merxatus",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-zinc-800">
      <h1 className="text-2xl font-bold text-zinc-900">개인정보처리방침</h1>
      <p className="mt-2 text-zinc-500">최종 업데이트: 2026년 5월 · 베타 버전</p>

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">1. 수집하는 정보</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Google 로그인 시: Google 계정 ID, 이메일(제공 시), 프로필 이름</li>
          <li>게임 이용 시: 닉네임, 게임 진행 데이터(인벤토리, 거래 기록 등)</li>
          <li>기술 정보: 접속 IP, 브라우저·쿠키(세션 유지용)</li>
        </ul>

        <h2 className="text-lg font-semibold">2. 이용 목적</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>회원 식별 및 로그인 세션 유지</li>
          <li>게임 서비스 제공·밸런스 분석·버그 수정</li>
          <li>부정 이용 방지 및 베타 운영</li>
        </ul>

        <h2 className="text-lg font-semibold">3. 보관 기간</h2>
        <p>
          베타 종료 또는 계정 삭제 요청 시, 법령상 보관 의무가 없는 한 지체 없이 파기합니다. 베타 중 데이터는
          운영상 필요에 따라 초기화될 수 있습니다.
        </p>

        <h2 className="text-lg font-semibold">4. 제3자 제공</h2>
        <p>
          Google OAuth 인증을 위해 Google LLC의 서비스를 사용합니다. 호스팅·DB(Supabase 등) 및 배포(Vercel 등)
          인프라 제공자에게 서비스 운영에 필요한 범위 내에서 데이터가 처리될 수 있습니다.
        </p>

        <h2 className="text-lg font-semibold">5. 이용자 권리</h2>
        <p>
          개인정보 열람·정정·삭제를 요청할 수 있습니다. Google 연동 해제 및 계정 삭제는 운영자에게 문의해 주세요.
        </p>

        <h2 className="text-lg font-semibold">6. 쿠키</h2>
        <p>
          로그인 세션(`sid`) 및 Google OAuth 상태 검증용 쿠키를 사용합니다. HttpOnly·Secure(HTTPS) 쿠키로
          저장됩니다.
        </p>
      </section>

      <p className="mt-10">
        <Link href="/" className="text-blue-600 underline">
          홈으로
        </Link>
        {" · "}
        <Link href="/terms" className="text-blue-600 underline">
          이용약관
        </Link>
      </p>
    </main>
  );
}
