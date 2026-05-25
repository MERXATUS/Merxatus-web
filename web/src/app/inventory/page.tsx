import { redirect } from "next/navigation";

/** 예전 북마크용 — 메인 대시보드 인벤 모달로 연결 */
export default function InventoryPage() {
  redirect("/?panel=inventory");
}
