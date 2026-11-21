import { z } from "zod";

/** سیاست «ادمین روی کاربر»: تعلیق/بازگردانی. منطق خالص و تست‌شده؛ کنترلر فقط اجرا می‌کند. */
export const suspendSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
export type SuspendInput = z.infer<typeof suspendSchema>;

export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

export type SuspendDecision =
  | { ok: true }
  | { ok: false; code: "cannot_suspend_self" | "user_deleted" | "already_suspended" | "cannot_suspend_admin" };

/** ادمین خودش یا ادمین دیگر را تعلیق نمی‌کند (جلوگیری از قفل‌شدن/جنگ ادمین‌ها؛ ادمین‌ها فقط از مسیر بیرون‌پنل مدیریت می‌شوند). */
export function decideSuspend(actorId: string, target: { id: string; role: string; status: UserStatus }): SuspendDecision {
  if (target.id === actorId) return { ok: false, code: "cannot_suspend_self" };
  if (target.role === "ADMIN") return { ok: false, code: "cannot_suspend_admin" };
  if (target.status === "DELETED") return { ok: false, code: "user_deleted" };
  if (target.status === "SUSPENDED") return { ok: false, code: "already_suspended" };
  return { ok: true };
}

export type ReinstateDecision = { ok: true } | { ok: false; code: "not_suspended" | "user_deleted" };
export function decideReinstate(target: { status: UserStatus }): ReinstateDecision {
  if (target.status === "DELETED") return { ok: false, code: "user_deleted" };
  if (target.status !== "SUSPENDED") return { ok: false, code: "not_suspended" };
  return { ok: true };
}
