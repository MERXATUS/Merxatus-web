"use client";

import { useEffect } from "react";
import {
  isMobileMoreTab,
  mobileDockGameTabs,
  mobileMoreGameTabs,
  type GameTabKey,
} from "@/shared/gameNav";
import { prefetchGamePanel } from "@/shared/panelTabPrefetch";
import { useEscapeClose } from "@/shared/useEscapeClose";

export function GameFrameMobileDock(props: {
  activeTab: GameTabKey;
  onNavigate: (tab: GameTabKey) => void;
  userId: string | null;
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
}) {
  const dockTabs = mobileDockGameTabs();
  const moreTabs = mobileMoreGameTabs();
  const moreActive = isMobileMoreTab(props.activeTab);

  useEscapeClose(props.moreOpen, () => props.onMoreOpenChange(false));

  useEffect(() => {
    if (!props.moreOpen) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest(".game-frame__more-sheet") || t.closest(".game-frame__dock-more-btn")) return;
      props.onMoreOpenChange(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [props.moreOpen, props.onMoreOpenChange]);

  function go(tab: GameTabKey) {
    props.onMoreOpenChange(false);
    props.onNavigate(tab);
  }

  return (
    <>
      <nav className="game-frame__dock" aria-label="주요 메뉴">
        {dockTabs.map((tab) => {
          const active = props.activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`game-frame__dock-btn ${active ? "game-frame__dock-btn--active" : ""}`.trim()}
              aria-current={active ? "page" : undefined}
              onClick={() => go(tab.key)}
              onMouseEnter={() => prefetchGamePanel(tab.key, props.userId)}
            >
              <span className="game-frame__dock-glyph" aria-hidden>
                {tab.glyph}
              </span>
              <span className="game-frame__dock-label">{tab.shortLabel}</span>
            </button>
          );
        })}
        {moreTabs.length > 0 ? (
          <button
            type="button"
            className={`game-frame__dock-btn game-frame__dock-more-btn ${moreActive ? "game-frame__dock-btn--active" : ""}`.trim()}
            aria-expanded={props.moreOpen}
            aria-haspopup="dialog"
            onClick={() => props.onMoreOpenChange(!props.moreOpen)}
          >
            <span className="game-frame__dock-glyph" aria-hidden>
              ⋯
            </span>
            <span className="game-frame__dock-label">더보기</span>
          </button>
        ) : null}
      </nav>

      {props.moreOpen && moreTabs.length > 0 ? (
        <div className="game-frame__more-backdrop" aria-hidden onClick={() => props.onMoreOpenChange(false)} />
      ) : null}

      {props.moreOpen && moreTabs.length > 0 ? (
        <div
          className="game-frame__more-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="더보기 메뉴"
        >
          <div className="game-frame__more-sheet-head">
            <span className="game-frame__more-sheet-title">더보기</span>
            <button
              type="button"
              className="game-frame__more-sheet-close"
              onClick={() => props.onMoreOpenChange(false)}
            >
              닫기
            </button>
          </div>
          <div className="game-frame__more-grid">
            {moreTabs.map((tab) => {
              const active = props.activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`game-frame__more-item ${active ? "game-frame__more-item--active" : ""}`.trim()}
                  onClick={() => go(tab.key)}
                  onMouseEnter={() => prefetchGamePanel(tab.key, props.userId)}
                >
                  <span className="game-frame__more-glyph" aria-hidden>
                    {tab.glyph}
                  </span>
                  <span className="game-frame__more-label">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
