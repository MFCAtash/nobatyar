import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { ConsentType } from "@prisma/client";
import type { Role } from "@nobatyar/shared";

export const IS_PUBLIC = "isPublic";
export const ROLES_KEY = "roles";
export const CONSENT_KEY = "requiredConsent";

/** مسیر بدون احراز هویت (پیش‌فرض همه‌ی مسیرها محافظت‌شده است). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** محدودسازی به نقش‌ها (بدون این دکوراتور: هر کاربر احراز‌شده). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/** نیاز به رضایت‌نامه‌ی فعال از نوع مشخص. */
export const RequireConsent = (type: ConsentType) => SetMetadata(CONSENT_KEY, type);

export interface AuthUser {
  id: string;
  role: Role;
  /** نشست جاری (از JWT)؛ برای توکن‌های قدیمیِ بدون sid خالی است. */
  sid?: string;
  /** زمان صدور توکن (ms)؛ برای بازبررسی ابطال در اتصال‌های بلندمدت (SSE/WebSocket). */
  iatMs?: number;
  /** فاز ۱۹: نشست دارای تأیید TOTP است (برای ادمینها الزامی). */
  mfa?: boolean;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return (ctx.switchToHttp().getRequest().ip as string | undefined) ?? "unknown";
});
