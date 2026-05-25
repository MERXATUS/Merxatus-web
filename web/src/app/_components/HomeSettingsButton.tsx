"use client";

type HomeSettingsButtonProps = {
  onClick: () => void;
  active?: boolean;
};

export function HomeSettingsButton(props: HomeSettingsButtonProps) {
  return (
    <button
      type="button"
      className={`home-settings-btn${props.active ? " home-settings-btn--active" : ""}`}
      aria-label="설정"
      aria-haspopup="dialog"
      aria-expanded={props.active}
      onClick={props.onClick}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M19.4 13.5a7.9 7.9 0 0 0 .1-3l2-1.5-2-3.5-2.3 1a8 8 0 0 0-2.6-1.5L14 2h-4l-.6 3a8 8 0 0 0-2.6 1.5l-2.3-1-2 3.5 2 1.5a7.9 7.9 0 0 0 .1 3l-2 1.5 2 3.5 2.3-1a8 8 0 0 0 2.6 1.5L10 22h4l.6-3a8 8 0 0 0 2.6-1.5l2.3 1 2-3.5-2-1.5Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
