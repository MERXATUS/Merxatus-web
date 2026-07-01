"use client";

import { createPortal } from "react-dom";
import { GameBtn } from "@/app/_components/gameUi";
import { AnnouncementsPanel } from "@/app/_components/AnnouncementsPanel";
import { useEscapeClose } from "@/shared/useEscapeClose";
import { markAllAnnouncementsRead } from "@/shared/announcements";

export function AnnouncementsModal(props: { open: boolean; onClose: () => void }) {
  useEscapeClose(props.open, props.onClose);
  if (!props.open) return null;

  function confirmAll() {
    markAllAnnouncementsRead();
    props.onClose();
  }

  const modal = (
    <div className="game-overlay" role="dialog" aria-modal="true" aria-labelledby="announcements-title">
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 z-[1] bg-black/50"
        onClick={props.onClose}
      />
      <div className="game-overlay__panel settings-modal game-modal absolute inset-x-3 top-[10%] mx-auto max-h-[min(36rem,85dvh)] w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl sm:inset-x-auto">
        <div className="game-modal-header flex items-center justify-between gap-3 px-5 py-4">
          <h2 id="announcements-title" className="text-sm font-semibold text-[var(--game-text)]">
            공지사항
          </h2>
          <GameBtn variant="ghost" onClick={props.onClose}>
            닫기
          </GameBtn>
        </div>
        <div className="settings-modal__body overflow-y-auto px-5 py-4">
          <AnnouncementsPanel />
        </div>
        <div className="settings-modal__footer px-5 py-3 border-t border-[var(--game-border)]">
          <GameBtn variant="primary" className="w-full" onClick={confirmAll}>
            확인
          </GameBtn>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
