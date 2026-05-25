"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { AuthTopBar } from "@/app/_components/AuthTopBar";
import { useEscapeClose } from "@/shared/useEscapeClose";

type GameShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** ESC로 메인(/) 이동. 열린 모달이 있으면 모달이 먼저 닫힘 */
  escapeToHome?: boolean;
};

export function GameShell({ title, subtitle, children, escapeToHome = true }: GameShellProps) {
  const router = useRouter();
  const goHome = useCallback(() => {
    router.push("/");
  }, [router]);

  useEscapeClose(escapeToHome, goHome);

  return (
    <div className="game-shell game-immersive">
      <main className="game-immersive__main">
        <div className="auth-corner-anchor flex flex-col gap-3">
          <AuthTopBar />
        </div>

        <header className="game-immersive__header">
          <Link href="/" className="game-immersive__back">
            ← 메인 <span className="game-immersive__back-hint">Esc</span>
          </Link>
          <div className="game-immersive__titles">
            <p className="game-label">Merxatus</p>
            <h1 className="game-immersive__title">{title}</h1>
            {subtitle ? <p className="game-immersive__subtitle">{subtitle}</p> : null}
          </div>
        </header>

        <div className="game-immersive__body">{children}</div>
      </main>
    </div>
  );
}
