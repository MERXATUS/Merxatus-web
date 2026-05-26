import Link from "next/link";

export const metadata = {
  title: "이용약관 — Merxatus",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-zinc-800">
      <h1 className="text-2xl font-bold text-zinc-900">이용약관</h1>
      <p className="mt-2 text-zinc-500">최종 업데이트: 2026년 5월 · 베타 버전</p>

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">1. 서비스 개요</h2>
        <p>
          Merxatus(이하 &quot;서비스&quot;)는 웹 기반 경제 시뮬레이션 게임입니다. 베타 기간 동안 기능·밸런스·데이터가
          예고 없이 변경될 수 있습니다.
        </p>

        <h2 className="text-lg font-semibold">2. 계정</h2>
        <p>
          Google 계정으로 로그인합니다. 계정 정보의 정확한 관리는 이용자 책임입니다. 부정 이용·버그 악용·자동화
          프로그램 사용은 제한되거나 계정이 정지될 수 있습니다.
        </p>

        <h2 className="text-lg font-semibold">3. 게임 데이터</h2>
        <p>
          베타 중 진행 데이터(골드, 아이템, 미니언 등)는 초기화·변경될 수 있습니다. 서비스는 데이터 손실에 대해
          보증하지 않습니다.
        </p>

        <h2 className="text-lg font-semibold">4. 금지 행위</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>서버·API 취약점 악용, 타인 계정 접근 시도</li>
          <li>욕설·혐오·불법 콘텐츠 채팅 게시</li>
          <li>상업적 재배포·리버스 엔지니어링(운영자 허가 없이)</li>
        </ul>

        <h2 className="text-lg font-semibold">5. 면책</h2>
        <p>
          서비스는 &quot;있는 그대로&quot; 제공됩니다. 베타 기간 중 장애·점검·중단이 발생할 수 있으며, 이로 인한
          손해에 대해 법령이 허용하는 범위 내에서 책임을 제한합니다.
        </p>

        <h2 className="text-lg font-semibold">6. 문의</h2>
        <p>베타 피드백 및 문의는 운영자에게 직접 연락해 주세요.</p>
      </section>

      <p className="mt-10">
        <Link href="/" className="text-blue-600 underline">
          홈으로
        </Link>
        {" · "}
        <Link href="/privacy" className="text-blue-600 underline">
          개인정보처리방침
        </Link>
      </p>
    </main>
  );
}
