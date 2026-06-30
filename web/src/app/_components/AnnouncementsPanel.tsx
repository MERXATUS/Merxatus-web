"use client";

import { useCallback, useEffect, useState } from "react";
import {
  announcementCategoryLabel,
  formatAnnouncementDate,
  isAnnouncementUnread,
  listAnnouncements,
  markAnnouncementRead,
  type Announcement,
} from "@/shared/announcements";

export function AnnouncementsPanel(props: { compact?: boolean; onReadChange?: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [readTick, setReadTick] = useState(0);

  const announcements = listAnnouncements();

  const bumpRead = useCallback(() => {
    setReadTick((n) => n + 1);
    props.onReadChange?.();
  }, [props]);

  useEffect(() => {
    if (!openId) return;
    markAnnouncementRead(openId);
    bumpRead();
  }, [openId, bumpRead]);

  function toggleItem(item: Announcement) {
    setOpenId((cur) => (cur === item.id ? null : item.id));
  }

  if (announcements.length === 0) {
    return <p className="settings-hint">등록된 공지가 없어요.</p>;
  }

  void readTick;

  return (
    <div className={`announcements-panel ${props.compact ? "announcements-panel--compact" : ""}`.trim()}>
      <ul className="announcements-panel__list">
        {announcements.map((item) => {
          const open = openId === item.id;
          const unread = isAnnouncementUnread(item.id);
          return (
            <li
              key={item.id}
              className={`announcements-panel__item ${open ? "announcements-panel__item--open" : ""} ${unread ? "announcements-panel__item--unread" : ""}`.trim()}
            >
              <button type="button" className="announcements-panel__head" onClick={() => toggleItem(item)}>
                <span className="announcements-panel__meta">
                  <span className="announcements-panel__category">
                    {announcementCategoryLabel(item.category)}
                  </span>
                  {item.pinned ? <span className="announcements-panel__pin">고정</span> : null}
                  {unread ? <span className="announcements-panel__new">NEW</span> : null}
                </span>
                <span className="announcements-panel__title">{item.title}</span>
                <span className="announcements-panel__date">{formatAnnouncementDate(item.publishedAt)}</span>
                {item.summary && !open ? (
                  <span className="announcements-panel__summary">{item.summary}</span>
                ) : null}
              </button>
              {open ? (
                <div className="announcements-panel__body">
                  {item.body.split("\n").map((line, i) =>
                    line.trim() ? (
                      <p key={`${item.id}-${i}`} className="announcements-panel__paragraph">
                        {line}
                      </p>
                    ) : (
                      <br key={`${item.id}-${i}`} />
                    ),
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
