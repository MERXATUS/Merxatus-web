"use client";

import { useCallback, useEffect, useState } from "react";
import {
  hasUnreadAnnouncements,
  isAnnouncementUnread,
  latestPinnedAnnouncement,
  markAnnouncementRead,
} from "@/shared/announcements";

export function AnnouncementBanner(props: { onOpen: () => void }) {
  const [tick, setTick] = useState(0);
  const latest = latestPinnedAnnouncement();

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  void tick;

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key?.includes("announcements")) refresh();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  if (!latest) return null;

  const unread = hasUnreadAnnouncements();
  const latestUnread = isAnnouncementUnread(latest.id);

  return (
    <button
      type="button"
      className={`announcement-banner ${latestUnread ? "announcement-banner--unread" : ""}`.trim()}
      onClick={() => {
        markAnnouncementRead(latest.id);
        refresh();
        props.onOpen();
      }}
    >
      <span className="announcement-banner__label">{unread ? "새 공지" : "공지"}</span>
      <span className="announcement-banner__title">{latest.title}</span>
      {latest.summary ? <span className="announcement-banner__summary">{latest.summary}</span> : null}
      <span className="announcement-banner__cta">전체 보기</span>
    </button>
  );
}
