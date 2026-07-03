import { redirect } from "next/navigation";

/** 예전 북마크용 — 통합 프레임 내 정보 탭으로 연결 */
export default function ProfilePage() {
  redirect("/?tab=profile");
}
