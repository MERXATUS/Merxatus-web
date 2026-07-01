"use client";

type HomeAnnouncementsButtonProps = {
  onClick: () => void;
  active?: boolean;
  unread?: boolean;
};

export function HomeAnnouncementsButton(props: HomeAnnouncementsButtonProps) {
  return (
    <button
      type="button"
      className={`home-announcements-btn${props.active ? " home-announcements-btn--active" : ""}${props.unread ? " home-announcements-btn--unread" : ""}`}
      aria-label={props.unread ? "새 공지" : "공지사항"}
      aria-haspopup="dialog"
      aria-expanded={props.active}
      onClick={props.onClick}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      {props.unread ? <span className="home-announcements-btn__dot" aria-hidden /> : null}
    </button>
  );
}
