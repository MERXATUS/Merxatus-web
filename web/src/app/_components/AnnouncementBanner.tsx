"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ANNOUNCEMENTS_READ_CHANGED_EVENT,
  latestUnreadAnnouncement,
} from "@/shared/announcements";

export function AnnouncementBanner(props: { onOpen: () => void }) {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  void tick;

  const latest = latestUnreadAnnouncement();

  useEffect(() => {
    function onReadChanged() {
      refresh();
    }
    window.addEventListener(ANNOUNCEMENTS_READ_CHANGED_EVENT, onReadChanged);
    return () => window.removeEventListener(ANNOUNCEMENTS_READ_CHANGED_EVENT, onReadChanged);
  }, [refresh]);

  if (!latest) return null;

  return (
    <button type="button" className="announcement-banner announcement-banner--unread" onClick={props.onOpen}>
      <span className="announcement-banner__label">NEW</span>
      <span className="announcement-banner__title">{latest.title}</span>
      <span className="announcement-banner__cta" aria-hidden>
        ›
      </span>
    </button>
  );
}
