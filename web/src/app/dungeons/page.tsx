import { redirect } from "next/navigation";

/** 예전 `?panel=dungeons`·북마크 호환 */
export default function DungeonsAliasPage() {
  redirect("/dungeon");
}
