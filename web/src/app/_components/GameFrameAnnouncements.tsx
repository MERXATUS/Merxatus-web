"use client";

import { AnnouncementBanner } from "@/app/_components/AnnouncementBanner";

export function GameFrameAnnouncements(props: { onOpen: () => void }) {
  return <AnnouncementBanner onOpen={props.onOpen} />;
}
