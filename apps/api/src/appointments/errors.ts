/** خطای قید EXCLUDE (رزرو دوبل) از Postgres/Prisma: SQLSTATE 23P01 */
export function isExclusionViolation(e: unknown): boolean {
  const err = e as { code?: string; meta?: { code?: string }; message?: string } | null;
  if (!err) return false;
  if (err.code === "P2010" && String(err.meta?.code) === "23P01") return true;
  return /23P01|no_double_booking|conflicting key value violates exclusion constraint/i.test(String(err.message ?? ""));
}
