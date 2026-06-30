"use client";

import { useState } from "react";
import { AnnouncementBanner } from "@/app/_components/AnnouncementBanner";
import { AnnouncementsModal } from "@/app/_components/AnnouncementsModal";

export function GameFrameAnnouncements() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AnnouncementBanner onOpen={() => setOpen(true)} />
      <AnnouncementsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
