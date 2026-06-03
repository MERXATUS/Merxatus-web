export function needsDbMigration(message: string) {
  return /does not exist|ArmorInstance|ToolInstance|Friendship|RaidRun|TowerRun|LeaderboardEntry|P2021/i.test(message);
}

export function jsonApiError(e: unknown, status = 500) {
  const message = e instanceof Error ? e.message : String(e);
  return Response.json(
    {
      ok: false,
      error: needsDbMigration(message) ? "DB_MIGRATION_REQUIRED" : "INTERNAL_SERVER_ERROR",
      message,
    },
    { status },
  );
}
