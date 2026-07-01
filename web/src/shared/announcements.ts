import announcementsData from "../../data/announcements.json";

export type AnnouncementCategory = "update" | "event" | "maintenance" | "notice";

export type Announcement = {
  id: string;
  title: string;
  publishedAt: string;
  pinned?: boolean;
  category?: AnnouncementCategory;
  summary?: string;
  body: string;
};

const READ_STORAGE_KEY = "merxatus_announcements_read_v1";

export const ANNOUNCEMENTS_READ_CHANGED_EVENT = "merxatus_announcements_read_changed";

function notifyAnnouncementsReadChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ANNOUNCEMENTS_READ_CHANGED_EVENT));
}

const CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  update: "업데이트",
  event: "이벤트",
  maintenance: "점검",
  notice: "안내",
};

export function announcementCategoryLabel(category: AnnouncementCategory | undefined): string {
  return category ? CATEGORY_LABEL[category] : "공지";
}

export function listAnnouncements(): Announcement[] {
  const rows = (announcementsData as { announcements: Announcement[] }).announcements ?? [];
  return [...rows].sort((a, b) => {
    const pinA = a.pinned ? 1 : 0;
    const pinB = b.pinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

export function formatAnnouncementDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export function readAnnouncementIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function markAnnouncementRead(id: string) {
  if (typeof window === "undefined") return;
  try {
    const next = readAnnouncementIds();
    if (next.has(id)) return;
    next.add(id);
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...next]));
    notifyAnnouncementsReadChanged();
  } catch {
    /* ignore */
  }
}

export function markAllAnnouncementsRead() {
  if (typeof window === "undefined") return;
  try {
    const ids = listAnnouncements().map((a) => a.id);
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids));
    notifyAnnouncementsReadChanged();
  } catch {
    /* ignore */
  }
}

export function latestUnreadAnnouncement(): Announcement | null {
  const read = readAnnouncementIds();
  return listAnnouncements().find((a) => !read.has(a.id)) ?? null;
}

export function latestPinnedAnnouncement(): Announcement | null {
  return listAnnouncements().find((a) => a.pinned) ?? listAnnouncements()[0] ?? null;
}

export function hasUnreadAnnouncements(): boolean {
  const read = readAnnouncementIds();
  return listAnnouncements().some((a) => !read.has(a.id));
}

export function isAnnouncementUnread(id: string): boolean {
  return !readAnnouncementIds().has(id);
}
