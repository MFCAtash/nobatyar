import { markSchema, notRefundedSchema, paymentListQuery, refundListQuery, rejectSchema, decideSchema, requestApprovalSchema } from "../admin/finance.schemas";
import { suspendSchema } from "../admin/user-admin";
import { requestOtpSchema, verifyOtpSchema } from "../auth/schemas";
import { codeSchema } from "../auth/mfa.controller";
import { bookSchema, listSchema as appointmentListSchema, rescheduleSchema } from "../appointments/schemas";
import { joinSchema as waitlistJoinSchema } from "../appointments/waitlist.controller";
import { settingsSchema as doctorSettingsSchema } from "../doctors/doctor-schedule.controller";
import { dataRequestSchema } from "../records/fhir.controller";
import { webauthnResponseSchema } from "../auth/passkey.controller";
import { decisionSchema, insuranceSchema, payoutSchema, settleSchema, topupSchema } from "../wallet/wallet.controller";
import { reviewSchema } from "../admin/data-request.controller";
import { applySchema, transcriptSchema } from "../scribe/scribe.controller";
import { createSchema as vitalCreateSchema, listSchema as vitalListSchema } from "../vitals/vitals.controller";
import { FamilyMemberSchema } from "../family/family.schemas";
import { grantConsentSchema, updateProfileSchema } from "../me/me.schemas";
import { InitiateSchema, VerifySchema } from "../payment/payment.schemas";
import { SubscribeSchema, UnsubscribeSchema } from "../push/push.schemas";
import { AddAttachmentSchema, CreateRecordSchema, ShareSchema, UpdateRecordSchema } from "../records/records.schemas";
import { createIncidentSchema, updateIncidentSchema } from "../status/incident.schemas";
import type { RouteDoc } from "./build";
import type { JsonSchema } from "./zod-to-schema";

/** کمک‌های کوتاه برای schema ی پاسخ‌ها (پاسخ‌ها Zod ندارند؛ اینجا دستی و صریح‌اند). */
const str = (description?: string): JsonSchema => ({ type: "string", ...(description ? { description } : {}) });
const obj = (props: Record<string, JsonSchema>, required: string[] = Object.keys(props)): JsonSchema => ({ type: "object", properties: props, required });
const nullable = (s: JsonSchema): JsonSchema => ({ anyOf: [s, { type: "null" }] });
const bigStr: JsonSchema = { type: "string", pattern: "^\\d+$", description: "مبلغ به ریال (رشته؛ BigInt)" };

const tokens = obj({ accessToken: str(), tokenType: { const: "Bearer" }, expiresIn: { type: "integer", description: "ثانیه" } });

const refundApproval = obj({
  required: { type: "boolean", description: "آیا برای این مبلغ تأیید دو نفره لازم است" },
  state: { enum: ["NONE", "REQUESTED", "APPROVED", "REJECTED"] },
  action: nullable({ enum: ["EXECUTE", "MARK_PROCESSED"] }),
  reference: nullable(str()), makerId: nullable(str()), makerNote: nullable(str()), requestedAt: nullable(str()),
  checkerId: nullable(str()), checkerNote: nullable(str()), decidedAt: nullable(str()),
});
const refundView = obj({
  id: str(), status: { enum: ["PENDING", "PROCESSING", "PROCESSED", "FAILED", "MANUAL", "REVIEW"] }, amountRial: bigStr,
  reason: nullable(str()), gateway: nullable(str()), externalRef: nullable(str()), tryCount: { type: "integer" }, lastErrorCode: nullable(str()),
  createdAt: str(), processedAt: nullable(str()), note: nullable(str()), paymentId: str(), appointmentId: str(), attemptId: nullable(str()), patientName: nullable(str()),
  approval: refundApproval,
});

const money = { idempotency: "required" as const };
const REFUND_ERRORS: Record<number, string> = {
  409: "approval_required | approval_action_mismatch | approval_reference_mismatch | not_in_expected_state | already_requested | already_approved | refund_not_executable",
};

/**
 * مسیرهای مستندشده (بدون پیشوند /api/v1). Schema ی ورودی «همان» Zod ی کنترلر است (منبع واحد حقیقت)،
 * پس مستند و اعتبارسنجی هرگز از هم جدا نمی‌شوند. مسیر جدید بدون مستند ⇒ تست coverage شکست می‌خورد (openapi/undocumented.json).
 */
export const ROUTES: RouteDoc[] = [
  // ── احراز هویت ──
  { method: "post", path: "/auth/otp/request", tag: "Auth", summary: "درخواست کد OTP (پاسخ همیشه یکسان است)", auth: "public", body: requestOtpSchema, ok: { status: 202, description: "پذیرفته شد", schema: obj({ status: { const: "accepted" } }) }, errors: { 429: "rate limit (phone / IP)" } },
  { method: "post", path: "/auth/otp/verify", tag: "Auth", summary: "تأیید OTP و دریافت access token (+ کوکی HttpOnly ی refresh)", auth: "public", body: verifyOtpSchema, ok: { status: 200, schema: tokens }, errors: { 401: "کد نادرست/منقضی", 429: "rate limit" } },
  { method: "post", path: "/auth/refresh", tag: "Auth", summary: "تمدید نشست با کوکی refresh (چرخشی؛ استفاده‌ی دوباره ⇒ ابطال کل نشست)", auth: "public", ok: { status: 200, schema: tokens }, errors: { 401: "invalid_refresh | csrf" } },
  { method: "post", path: "/auth/logout", tag: "Auth", summary: "خروج از این دستگاه؛ access token همین حالا باطل می‌شود", auth: "public", ok: { status: 204, description: "بدون بدنه" } },
  { method: "post", path: "/auth/logout-all", tag: "Auth", summary: "خروج از همه‌ی دستگاه‌ها", auth: "user", ok: { status: 204, description: "بدون بدنه" } },

  // ── پرداخت ──
  { method: "post", path: "/payments/initiate", tag: "Payments", summary: "شروع پرداخت نوبت (⇒ نشانی درگاه)", auth: "patient", ...money, body: InitiateSchema,
    ok: { status: 201, schema: obj({ status: { enum: ["REDIRECT", "PAID"] }, paymentUrl: nullable(str()), gateway: nullable(str()) }) }, errors: { 409: "already_paid | too_many_payment_attempts | idempotency_in_progress" } },
  { method: "post", path: "/payments/verify", tag: "Payments", summary: "بازگشت از درگاه: تأیید با «سرور درگاه» (Status ی مرورگر بی‌اثر است)", auth: "patient", idempotency: "optional", body: VerifySchema,
    ok: { status: 201, schema: obj({ success: { type: "boolean" }, state: { enum: ["PAID", "PENDING", "FAILED", "REVIEW"] }, message: str() }) } },

  // ── استرداد (ادمین) با تأیید دو نفره ──
  { method: "get", path: "/admin/refunds", tag: "Admin · Refunds", summary: "فهرست استردادها", auth: "admin", query: refundListQuery, ok: { status: 200, schema: obj({ items: { type: "array", items: refundView } }) } },
  { method: "post", path: "/admin/refunds/:id/request-approval", tag: "Admin · Refunds", summary: "Maker: درخواست تأیید برای اجرا یا ثبت دستی", auth: "admin", ...money, body: requestApprovalSchema, ok: { status: 200, schema: refundView }, errors: { 400: "reference_required", 409: REFUND_ERRORS[409] } },
  { method: "post", path: "/admin/refunds/:id/approval/approve", tag: "Admin · Refunds", summary: "Checker (غیر از Maker): تأیید", auth: "admin", ...money, body: decideSchema, ok: { status: 200, schema: refundView }, errors: { 403: "self_approval_forbidden", 409: "not_requested" } },
  { method: "post", path: "/admin/refunds/:id/approval/reject", tag: "Admin · Refunds", summary: "Checker (غیر از Maker): رد با دلیل", auth: "admin", ...money, body: rejectSchema, ok: { status: 200, schema: refundView }, errors: { 403: "self_approval_forbidden", 409: "not_requested" } },
  { method: "post", path: "/admin/refunds/:id/execute", tag: "Admin · Refunds", summary: "اجرای استرداد روی درگاه (نیازمند تأیید یک‌بارمصرف)", auth: "admin", ...money, ok: { status: 200, schema: refundView }, errors: { 409: REFUND_ERRORS[409] } },
  { method: "post", path: "/admin/refunds/:id/mark-processed", tag: "Admin · Refunds", summary: "ثبت انجام دستی (فقط با «همان مرجع» ی تأییدشده)", auth: "admin", ...money, body: markSchema, ok: { status: 200, schema: refundView }, errors: { 409: REFUND_ERRORS[409] } },
  { method: "post", path: "/admin/refunds/:id/mark-not-refunded", tag: "Admin · Refunds", summary: "بررسی شد؛ استرداد انجام نشده (REVIEW ⇒ FAILED)", auth: "admin", ...money, body: notRefundedSchema, ok: { status: 200, schema: refundView } },
  { method: "get", path: "/admin/payments", tag: "Admin · Finance", summary: "فهرست پرداخت‌ها (فیلتر وضعیت)", auth: "admin", query: paymentListQuery, ok: { status: 200 } },
  { method: "get", path: "/admin/finance/summary", tag: "Admin · Finance", summary: "خلاصه‌ی مالی و موارد نیازمند توجه", auth: "admin", ok: { status: 200 } },

  // ── مدیریت کاربر (ادمین): تعلیق فوری ──
  { method: "post", path: "/admin/users/:id/suspend", tag: "Admin · Users", summary: "تعلیق کاربر؛ همه‌ی توکن‌ها و سوکت‌ها همین حالا باطل می‌شوند", auth: "admin", body: suspendSchema, ok: { status: 200, schema: obj({ id: str(), status: { const: "SUSPENDED" } }) }, errors: { 403: "cannot_suspend_self | cannot_suspend_admin", 409: "already_suspended | user_deleted" } },
  { method: "post", path: "/admin/users/:id/reinstate", tag: "Admin · Users", summary: "بازگردانی کاربر معلق", auth: "admin", ok: { status: 200, schema: obj({ id: str(), status: { const: "ACTIVE" } }) }, errors: { 409: "not_suspended" } },
  { method: "post", path: "/admin/users/:id/revoke-sessions", tag: "Admin · Users", summary: "بستن همه‌ی نشست‌های کاربر (بدون تغییر وضعیت)", auth: "admin", ok: { status: 200, schema: obj({ id: str(), revoked: { const: true } }) } },

  // ── صفحه‌ی وضعیت عمومی ──
  { method: "get", path: "/status", tag: "Status", summary: "وضعیت عمومی سامانه (cache ی ۳۰ثانیه‌ای؛ بدون هیچ عدد داخلی)", auth: "public",
    ok: { status: 200, schema: obj({
      overall: { enum: ["operational", "degraded", "outage"] }, updatedAt: str(),
      components: { type: "array", items: obj({ id: { enum: ["api", "database", "realtime", "payments", "notifications"] }, nameFa: str(), status: { enum: ["operational", "degraded", "outage"] } }) },
      incidents: { type: "array", items: obj({ id: str(), titleFa: str(), status: { enum: ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"] }, impact: { enum: ["NONE", "MINOR", "MAJOR", "CRITICAL"] }, componentId: nullable(str()), startedAt: str(), resolvedAt: nullable(str()), updates: { type: "array", items: obj({ status: str(), bodyFa: str(), at: str() }) } }) },
    }) } },
  { method: "get", path: "/admin/status/incidents", tag: "Admin · Status", summary: "حوادث (۵۰ مورد آخر)", auth: "admin", ok: { status: 200 } },
  { method: "post", path: "/admin/status/incidents", tag: "Admin · Status", summary: "ثبت حادثه‌ی عمومی (متن نباید داده‌ی شخصی داشته باشد)", auth: "admin", body: createIncidentSchema, ok: { status: 201, schema: obj({ id: str() }) }, errors: { 400: "contains_personal_data" } },
  { method: "post", path: "/admin/status/incidents/:id/updates", tag: "Admin · Status", summary: "به‌روزرسانی/حل حادثه (حادثه‌ی حل‌شده قابل ویرایش نیست)", auth: "admin", body: updateIncidentSchema, ok: { status: 200, schema: obj({ id: str(), status: str() }) }, errors: { 400: "contains_personal_data", 409: "incident_resolved" } },

  // ── نوبت‌ها ──
  { method: "post", path: "/appointments", tag: "Appointments", summary: "رزرو نوبت (ضد double-booking)", auth: "patient", body: bookSchema, ok: { status: 201 }, errors: { 409: "slot_taken | invalid_slot | consent_required" } },
  { method: "get", path: "/appointments", tag: "Appointments", summary: "فهرست نوبت‌های کاربر (cursor)", auth: "user", query: appointmentListSchema, ok: { status: 200 } },
  { method: "get", path: "/appointments/:id", tag: "Appointments", summary: "جزئیات نوبت", auth: "user", ok: { status: 200 } },
  { method: "post", path: "/appointments/:id/confirm", tag: "Appointments", summary: "پزشک: تأیید نوبت", auth: "doctor", ok: { status: 200 }, errors: { 409: "invalid_transition" } },
  { method: "post", path: "/appointments/:id/cancel", tag: "Appointments", summary: "لغو نوبت (بازپرداخت طبق سیاست)", auth: "user", ok: { status: 200 }, errors: { 409: "invalid_transition" } },
  { method: "post", path: "/appointments/:id/start", tag: "Appointments", summary: "شروع ویزیت", auth: "doctor", ok: { status: 200 } },
  { method: "post", path: "/appointments/:id/complete", tag: "Appointments", summary: "پایان ویزیت", auth: "doctor", ok: { status: 200 } },

  // ── پروفایل، رضایت‌ها، خانواده ──
  { method: "get", path: "/me", tag: "Me", summary: "کاربر جاری", auth: "user", ok: { status: 200 } },
  { method: "patch", path: "/me/profile", tag: "Me", summary: "ویرایش پروفایل", auth: "user", body: updateProfileSchema, ok: { status: 200 } },
  { method: "post", path: "/me/consents", tag: "Me", summary: "ثبت رضایت‌نامه", auth: "user", body: grantConsentSchema, ok: { status: 201 } },
  { method: "get", path: "/me/family", tag: "Family", summary: "اعضای خانواده (کد ملی ماسک‌شده)", auth: "patient", ok: { status: 200 } },
  { method: "post", path: "/me/family", tag: "Family", summary: "افزودن عضو (کد ملی رمزنگاری می‌شود)", auth: "patient", body: FamilyMemberSchema, ok: { status: 201 } },
  { method: "patch", path: "/me/family/:id", tag: "Family", summary: "ویرایش عضو", auth: "patient", body: FamilyMemberSchema.partial(), ok: { status: 200 } },
  { method: "delete", path: "/me/family/:id", tag: "Family", summary: "حذف عضو", auth: "patient", ok: { status: 200 } },

  // ── پرونده‌ی سلامت ──
  { method: "post", path: "/records", tag: "Records", summary: "ایجاد پرونده‌ی سلامت", auth: "patient", body: CreateRecordSchema, ok: { status: 201 } },
  { method: "patch", path: "/records/:id", tag: "Records", summary: "ویرایش پرونده", auth: "patient", body: UpdateRecordSchema, ok: { status: 200 } },
  { method: "post", path: "/records/:id/attachments", tag: "Records", summary: "ثبت پیوست (پس از آپلود به MinIO)", auth: "patient", body: AddAttachmentSchema, ok: { status: 201 } },
  { method: "post", path: "/records/:id/shares", tag: "Records", summary: "اشتراک پرونده با یک پزشک", auth: "patient", body: ShareSchema, ok: { status: 201 } },
  { method: "delete", path: "/records/:id/shares/:shareId", tag: "Records", summary: "لغو اشتراک", auth: "patient", ok: { status: 200 } },

  // ── اعلان‌ها و Push ──
  { method: "get", path: "/notifications", tag: "Notifications", summary: "فهرست اعلان‌ها (cursor)", auth: "user", ok: { status: 200 } },
  { method: "patch", path: "/notifications/:id/read", tag: "Notifications", summary: "علامت خوانده‌شده", auth: "user", ok: { status: 200 } },
  { method: "patch", path: "/notifications/read-all", tag: "Notifications", summary: "همه خوانده شد", auth: "user", ok: { status: 200 } },
  { method: "post", path: "/push/subscribe", tag: "Push", summary: "ثبت اشتراک Web Push", auth: "user", body: SubscribeSchema, ok: { status: 201 } },
  { method: "post", path: "/push/unsubscribe", tag: "Push", summary: "لغو اشتراک Web Push", auth: "user", body: UnsubscribeSchema, ok: { status: 200 } },

  // ═════════════ فاز ۱۹ ═════════════
  // MFA/TOTP
  { method: "get", path: "/me/mfa", tag: "Security · MFA", summary: "وضعیت TOTP کاربر جاری", auth: "user", ok: { status: 200, schema: obj({ enabled: { type: "boolean" }, required: { type: "boolean" }, enrolledAt: nullable(str()), recoveryCodesLeft: { type: "integer" } }) } },
  { method: "post", path: "/me/mfa/enroll", tag: "Security · MFA", summary: "ساخت راز TOTP و کدهای پشتیبان (فقط یکبار نمایش داده میشود)", auth: "user", ok: { status: 200, schema: obj({ secret: str(), uri: str(), recoveryCodes: { type: "array", items: str() } }) } },
  { method: "post", path: "/me/mfa/enable", tag: "Security · MFA", summary: "فعالسازی TOTP با کد تأیید و صدور access token دارای claim ی mfa", auth: "user", body: codeSchema, ok: { status: 200, schema: obj({ accessToken: str() }) }, errors: { 422: "mfa_invalid_code | mfa_locked" } },
  { method: "post", path: "/me/mfa/rotate", tag: "Security · MFA", summary: "چرخش راز TOTP حساب فعال (فقط با کد فعلی)", auth: "user", body: codeSchema, ok: { status: 200, schema: obj({ secret: str(), uri: str(), recoveryCodes: { type: "array", items: str() } }) }, errors: { 403: "mfa_not_enabled", 422: "mfa_invalid_code | mfa_locked" } },
  { method: "post", path: "/auth/mfa/verify", tag: "Security · MFA", summary: "تأیید step-up (TOTP یا کد پشتیبان تکبارمصرف)", auth: "user", body: codeSchema, ok: { status: 200, schema: obj({ verified: { const: true }, accessToken: str() }) }, errors: { 422: "mfa_invalid_code | mfa_locked" } },
  { method: "post", path: "/me/mfa/disable", tag: "Security · MFA", summary: "غیرفعالسازی TOTP (در صورت الزام سیاست ادمین ممنوع)", auth: "user", body: codeSchema, ok: { status: 200, schema: obj({ disabled: { const: true } }) }, errors: { 403: "mfa_required_by_policy" } },

  // جابهجایی نوبت
  { method: "post", path: "/appointments/:id/reschedule", tag: "Appointments", summary: "جابهجایی اتمی نوبت (بدون لغو/بازپرداخت/پرداخت مجدد)", auth: "user", body: rescheduleSchema,
    ok: { status: 200, schema: obj({ id: str(), startsAt: str(), endsAt: str(), status: str(), refundRial: bigStr }) },
    errors: { 409: "invalid_state | slot_taken | concurrent_modification", 422: "too_early | too_late" } },
  { method: "post", path: "/waitlist", tag: "Waitlist", summary: "پیوستن به لیست انتظار یک پزشک", auth: "patient", body: waitlistJoinSchema, ok: { status: 201, schema: obj({ id: str(), status: { const: "WAITING" } }) } },
  { method: "get", path: "/waitlist", tag: "Waitlist", summary: "ورودیهای لیست انتظار من", auth: "user", ok: { status: 200 } },
  { method: "delete", path: "/waitlist/:id", tag: "Waitlist", summary: "خروج از لیست انتظار", auth: "patient", ok: { status: 200, schema: obj({ id: str(), status: { const: "CANCELLED" } }) } },
  { method: "patch", path: "/doctors/me/settings", tag: "Doctors", summary: "تنظیمات پزشک شامل اطلاعات عمومی مطب", auth: "doctor", body: doctorSettingsSchema, ok: { status: 200 } },

  // RPM
  { method: "post", path: "/vitals", tag: "RPM", summary: "ثبت اندازهگیری (فشارخون/قند/وزن/ضربان/دما/اکسیژن)", auth: "patient", body: vitalCreateSchema, ok: { status: 201 }, errors: { 422: "vital_invalid" } },
  { method: "get", path: "/vitals", tag: "RPM", summary: "فهرست اندازهگیریها و روند", auth: "user", query: vitalListSchema, ok: { status: 200 } },
  { method: "delete", path: "/vitals/:id", tag: "RPM", summary: "حذف اندازهگیری توسط ثبتکننده", auth: "patient", ok: { status: 200 } },

  // Ambient AI Scribe
  { method: "get", path: "/appointments/:id/scribe", tag: "AI Scribe", summary: "دریافت پیشنویس (در صورت وجود)", auth: "doctor", ok: { status: 200 } },
  { method: "get", path: "/appointments/:id/scribe/consents", tag: "AI Scribe", summary: "چکلیست رضایت صریح دو طرف قبل از شروع", auth: "doctor", ok: { status: 200, schema: obj({ doctor: { type: "boolean" }, patient: { type: "boolean" }, canStart: { type: "boolean" } }) } },
  { method: "post", path: "/appointments/:id/scribe/start", tag: "AI Scribe", summary: "شروع جلسه منوط به رضایت صریح هر دو طرف", auth: "doctor", ok: { status: 200, schema: obj({ status: { const: "CONSENTED" }, ttlMinutes: { type: "integer" }, consent: obj({ doctor: { const: true }, patient: { const: true } }) }) }, errors: { 403: "scribe_consent_required", 409: "scribe_already_started" } },
  { method: "post", path: "/appointments/:id/scribe/transcript", tag: "AI Scribe", summary: "بارگذاری متن گفتار (پاکسازی PII و رمزنگاری موقت)", auth: "doctor", body: transcriptSchema, ok: { status: 200, schema: obj({ status: { const: "TRANSCRIPT_READY" } }) } },
  { method: "post", path: "/appointments/:id/scribe/draft", tag: "AI Scribe", summary: "تولید پیشنویس SOAP (هرگز امضا نمیشود)", auth: "doctor", ok: { status: 200 }, errors: { 409: "transcript_missing | scribe_expired" } },
  { method: "post", path: "/appointments/:id/scribe/apply", tag: "AI Scribe", summary: "انتقال پیشنویس به SOAP به وضعیت DRAFT (با version خوشبینانه)", auth: "doctor", body: applySchema, ok: { status: 200, schema: obj({ applied: { const: true }, signed: { const: false } }) }, errors: { 409: "concurrent_modification" } },
  { method: "delete", path: "/appointments/:id/scribe", tag: "AI Scribe", summary: "پاکسازی فوری متن موقت و پیشنویس", auth: "doctor", ok: { status: 200 } },

  // FHIR + حق حذف/خروجی
  { method: "get", path: "/me/health-record/fhir", tag: "Privacy · FHIR", summary: "خروجی کامل پرونده به صورت FHIR R4 Bundle", auth: "patient", ok: { status: 200 }, errors: { 403: "consent_required" } },
  { method: "post", path: "/me/data-requests", tag: "Privacy · Data", summary: "درخواست خروجی کامل یا حذف داده", auth: "user", body: dataRequestSchema, ok: { status: 202, schema: obj({ id: str(), type: { enum: ["EXPORT", "DELETE"] }, status: { const: "PENDING" } }) } },
  { method: "get", path: "/me/data-requests", tag: "Privacy · Data", summary: "فهرست درخواستهای داده", auth: "user", ok: { status: 200 } },
  { method: "post", path: "/me/data-requests/:id/cancel", tag: "Privacy · Data", summary: "لغو درخواست در انتظار", auth: "user", ok: { status: 200 }, errors: { 403: "request_not_pending" } },
  { method: "get", path: "/me/data-requests/:id/download", tag: "Privacy · Data", summary: "لینک موقت دانلود خروجی کامل", auth: "user", ok: { status: 200, schema: obj({ url: str(), fileName: str(), expiresAt: { type: "integer" } }) }, errors: { 403: "export_not_ready" } },
  { method: "get", path: "/admin/audit/verify", tag: "Admin · Audit", summary: "بررسی یکپارچگی زنجیره هش ممیزی", auth: "admin", ok: { status: 200, schema: obj({ ok: { type: "boolean" }, broken: { type: "array", items: obj({ seq: str(), reason: str() }) } }) } },
  { method: "get", path: "/admin/data-requests", tag: "Admin · Privacy", summary: "صف درخواستهای حذف/خروجی", auth: "admin", ok: { status: 200 } },
  { method: "post", path: "/admin/data-requests/:id/review", tag: "Admin · Privacy", summary: "رأی دو نفره ادمین (پس از ۲ تأیید، اجرا ۳۰ روز بعد)", auth: "admin", body: reviewSchema, ok: { status: 200, schema: obj({ id: str(), status: str(), approvals: { type: "integer" } }) }, errors: { 409: "request_not_pending" } },

  // ═════════════ مستندسازی مسیرهای باقیمانده (پوشش ۱۰۰٪) ═════════════
  { method: "get", path: "/specialties", tag: "Doctors", summary: "فهرست تخصصها", auth: "public", ok: { status: 200 } },
  { method: "get", path: "/doctors", tag: "Doctors", summary: "جستجوی پزشکان فهرستشده", auth: "public", ok: { status: 200 } },
  { method: "get", path: "/doctors/:id", tag: "Doctors", summary: "جزئیات پزشک", auth: "public", ok: { status: 200 } },
  { method: "get", path: "/doctors/:id/slots", tag: "Doctors", summary: "اسلاتهای آزاد پزشک در بازه", auth: "public", ok: { status: 200 } },
  { method: "get", path: "/doctors/compare", tag: "Doctors", summary: "مقایسه حداکثر ۳ پزشک", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/doctors/applications/mine", tag: "Doctors", summary: "وضعیت درخواست پزشک من", auth: "doctor", ok: { status: 200 } },
  { method: "post", path: "/doctors/applications", tag: "Doctors", summary: "ارسال درخواست پزشکی", auth: "user", ok: { status: 201 } },
  { method: "get", path: "/doctors/me/availability", tag: "Doctors", summary: "برنامه هفتگی و تنظیمات پزشک", auth: "doctor", ok: { status: 200 } },
  { method: "put", path: "/doctors/me/availability", tag: "Doctors", summary: "جایگزینی کامل برنامه هفتگی", auth: "doctor", ok: { status: 200 } },
  { method: "put", path: "/doctors/me/specialties", tag: "Doctors", summary: "تنظیم تخصصها (حداکثر ۳)", auth: "doctor", ok: { status: 200 } },
  { method: "get", path: "/doctors/me/time-off", tag: "Doctors", summary: "مرخصیهای آینده پزشک", auth: "doctor", ok: { status: 200 } },
  { method: "post", path: "/doctors/me/time-off", tag: "Doctors", summary: "ثبت مرخصی", auth: "doctor", ok: { status: 201 } },
  { method: "delete", path: "/doctors/me/time-off/:id", tag: "Doctors", summary: "حذف مرخصی", auth: "doctor", ok: { status: 200 } },
  { method: "get", path: "/admin/doctor-verifications", tag: "Admin · Verification", summary: "مدارک پزشکان در انتظار بررسی", auth: "admin", ok: { status: 200 } },
  { method: "post", path: "/admin/doctor-verifications/:id/approve", tag: "Admin · Verification", summary: "تأیید مدارک پزشک", auth: "admin", ok: { status: 200 } },
  { method: "post", path: "/admin/doctor-verifications/:id/reject", tag: "Admin · Verification", summary: "رد مدارک پزشک با دلیل", auth: "admin", ok: { status: 200 } },
  { method: "get", path: "/appointments/:id/health-profile", tag: "Appointments", summary: "پروفایل سلامت بیمار برای پزشک همان نوبت", auth: "doctor", ok: { status: 200 } },
  { method: "get", path: "/appointments/:id/soap", tag: "SOAP", summary: "یادداشت SOAP پزشک", auth: "doctor", ok: { status: 200 } },
  { method: "put", path: "/appointments/:id/soap", tag: "SOAP", summary: "ذخیره پیشنویس SOAP", auth: "doctor", ok: { status: 200 } },
  { method: "post", path: "/appointments/:id/soap/sign", tag: "SOAP", summary: "امضای SOAP و انتشار خلاصه بیمار", auth: "doctor", ok: { status: 200 } },
  { method: "post", path: "/appointments/:id/soap/addenda", tag: "SOAP", summary: "افزودن الحاقیه پس از امضا", auth: "doctor", ok: { status: 201 } },
  { method: "get", path: "/appointments/:id/visit-summary", tag: "SOAP", summary: "خلاصه ویزیت منتشرشده", auth: "user", ok: { status: 200 } },
  { method: "post", path: "/appointments/:id/report-no-show", tag: "Appointments", summary: "گزارش غیبت", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/appointments/:id/prescriptions", tag: "Prescriptions", summary: "نسخههای نوبت", auth: "user", ok: { status: 200 } },
  { method: "post", path: "/appointments/:id/prescriptions", tag: "Prescriptions", summary: "صدور نسخه", auth: "doctor", ok: { status: 201 } },
  { method: "get", path: "/prescriptions", tag: "Prescriptions", summary: "فهرست نسخهها", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/prescriptions/:id", tag: "Prescriptions", summary: "جزئیات نسخه", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/prescriptions/verify", tag: "Prescriptions", summary: "استعلام اعتبار نسخه توسط داروساز", auth: "public", ok: { status: 200 } },
  { method: "post", path: "/prescriptions/:id/cancel", tag: "Prescriptions", summary: "ابطال نسخه", auth: "doctor", ok: { status: 200 } },
  { method: "get", path: "/appointments/:id/video", tag: "Video", summary: "وضعیت اتاق ویدئو", auth: "user", ok: { status: 200 } },
  { method: "post", path: "/appointments/:id/video/token", tag: "Video", summary: "دریافت توکن پیوستن به اتاق", auth: "user", ok: { status: 200 } },
  { method: "post", path: "/video/webhook", tag: "Video", summary: "webhook رویدادهای LiveKit", auth: "public", ok: { status: 200 } },
  { method: "get", path: "/payments/:appointmentId", tag: "Payments", summary: "وضعیت پرداخت نوبت", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/me/consents", tag: "Me", summary: "فهرست رضایتنامهها", auth: "user", ok: { status: 200 } },
  { method: "post", path: "/me/consents/:type/revoke", tag: "Me", summary: "ابطال رضایتنامه", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/me/health-profile", tag: "Health Profile", summary: "پروفایل سلامت من", auth: "patient", ok: { status: 200 } },
  { method: "put", path: "/me/health-profile", tag: "Health Profile", summary: "ذخیره پروفایل سلامت", auth: "patient", ok: { status: 200 } },
  { method: "get", path: "/records", tag: "Records", summary: "فهرست پرونده سلامت", auth: "patient", ok: { status: 200 } },
  { method: "get", path: "/records/:id", tag: "Records", summary: "جزئیات پرونده", auth: "patient", ok: { status: 200 } },
  { method: "delete", path: "/records/:id", tag: "Records", summary: "حذف پرونده", auth: "patient", ok: { status: 200 } },
  { method: "get", path: "/records/attachments/:attId/download", tag: "Records", summary: "لینک موقت دانلود پیوست", auth: "patient", ok: { status: 200 } },
  { method: "get", path: "/conversations", tag: "Chat", summary: "فهرست مکالمات", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/conversations/:id/messages", tag: "Chat", summary: "پیامهای مکالمه", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/conversations/messages/:msgId/attachment", tag: "Chat", summary: "لینک موقت پیوست پیام", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/notifications/stream", tag: "Notifications", summary: "جریان SSE اعلانها", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/push/public-key", tag: "Push", summary: "کلید عمومی VAPID", auth: "public", ok: { status: 200 } },
  { method: "post", path: "/storage/upload-token", tag: "Storage", summary: "توکن آپلود محدود به نوع/اندازه", auth: "user", ok: { status: 201 } },
  { method: "post", path: "/storage/allowed-types", tag: "Storage", summary: "انواع فایل مجاز", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/triage/catalog", tag: "Triage", summary: "کاتالوگ علائم و سوالات", auth: "public", ok: { status: 200 } },
  { method: "post", path: "/triage", tag: "Triage", summary: "ارزیابی اولیه (غیرتشخیصی)", auth: "patient", ok: { status: 201 } },
  { method: "get", path: "/second-opinions", tag: "Second Opinion", summary: "فهرست درخواستهای نظر دوم", auth: "user", ok: { status: 200 } },
  { method: "get", path: "/second-opinions/settings", tag: "Second Opinion", summary: "تنظیمات پذیرش نظر دوم پزشک", auth: "doctor", ok: { status: 200 } },
  { method: "post", path: "/second-opinions", tag: "Second Opinion", summary: "درخواست نظر دوم", auth: "patient", ok: { status: 201 } },

  // فاز ۲۴ — Passkey، Ledger، Read Model
  { method: "get", path: "/auth/passkey/credentials", tag: "Passkey", summary: "اعتبارنامههای passkey من", auth: "user", ok: { status: 200 } },
  { method: "delete", path: "/auth/passkey/credentials/:id", tag: "Passkey", summary: "حذف اعتبارنامه passkey", auth: "user", ok: { status: 200 } },
  { method: "post", path: "/auth/passkey/register/options", tag: "Passkey", summary: "گزینههای ثبت passkey", auth: "user", ok: { status: 200 } },
  { method: "post", path: "/auth/passkey/register/verify", tag: "Passkey", summary: "تأیید ثبت passkey", auth: "user", body: webauthnResponseSchema, ok: { status: 200 } },
  { method: "post", path: "/auth/passkey/login/options", tag: "Passkey", summary: "چالش ورود با passkey", auth: "public", ok: { status: 200 }, errors: { 429: "rate limit" } },
  { method: "post", path: "/auth/passkey/login/verify", tag: "Passkey", summary: "ورود با passkey و صدور نشست", auth: "public", body: webauthnResponseSchema, ok: { status: 200, schema: tokens }, errors: { 401: "passkey_verification_failed | challenge_expired", 429: "rate limit" } },

  { method: "get", path: "/wallet", tag: "Wallet", summary: "موجودی کیف پول", auth: "user", ok: { status: 200, schema: obj({ balanceRial: bigStr, currency: str() }) } },
  { method: "get", path: "/wallet/history", tag: "Wallet", summary: "تاریخچه دفتر کل من", auth: "user", ok: { status: 200 } },
  { method: "post", path: "/wallet/topup", tag: "Wallet", summary: "شارژ کیف پول (sandbox)", auth: "user", body: topupSchema, idempotency: "required", ok: { status: 201 }, errors: { 403: "topup_disabled" } },
  { method: "post", path: "/wallet/payouts", tag: "Wallet", summary: "درخواست تسویه پزشک", auth: "doctor", body: payoutSchema, ok: { status: 201 }, errors: { 409: "insufficient_funds" } },
  { method: "get", path: "/wallet/payouts", tag: "Wallet", summary: "درخواستهای تسویه", auth: "user", ok: { status: 200 } },
  { method: "patch", path: "/wallet/payouts/:id", tag: "Wallet", summary: "تصمیم ادمین درباره تسویه", auth: "admin", body: decisionSchema, ok: { status: 200 } },
  { method: "get", path: "/wallet/insurance", tag: "Wallet", summary: "بیمههای من", auth: "patient", ok: { status: 200 } },
  { method: "post", path: "/wallet/insurance", tag: "Wallet", summary: "افزودن بیمه (شماره رمزنگاریشده)", auth: "patient", body: insuranceSchema, ok: { status: 201 } },
  { method: "post", path: "/wallet/insurance/settle", tag: "Wallet", summary: "تسویه سهم بیمه با پزشک", auth: "admin", body: settleSchema, ok: { status: 201 } },

  { method: "get", path: "/doctor/stats/daily", tag: "Analytics", summary: "آمار روزانه پزشک (Read Model)", auth: "doctor", ok: { status: 200 } },
  { method: "get", path: "/doctor/stats/summary", tag: "Analytics", summary: "خلاصه عملکرد پزشک", auth: "doctor", ok: { status: 200 } },
];
