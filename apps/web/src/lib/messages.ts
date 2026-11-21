import { ApiError } from "./api";

const MESSAGES: Record<string, string> = {
  network: "ارتباط با سرور برقرار نشد. اینترنت خود را بررسی کنید.",
  unauthorized: "نشست شما منقضی شده است. دوباره وارد شوید.",
  forbidden: "اجازه‌ی این کار را ندارید.",
  invalid_code: "کد وارد‌شده نادرست یا منقضی است.",
  too_many_requests: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید.",
  csrf: "درخواست نامعتبر بود. صفحه را تازه کنید.",
  validation_failed: "اطلاعات واردشده معتبر نیست.",
  consent_required: "برای ادامه باید رضایت‌نامه‌ی پردازش اطلاعات سلامت را بپذیرید.",
  slot_taken: "این وقت همین الان توسط فرد دیگری رزرو شد. وقت دیگری انتخاب کنید.",
  invalid_slot: "این زمان دیگر قابل رزرو نیست.",
  doctor_not_found: "پزشک پیدا نشد.",
  cannot_book_self: "نمی‌توانید برای خودتان نوبت بگیرید.",
  too_many_open_appointments: "به سقف نوبت‌های باز رسیده‌اید. ابتدا یکی را لغو یا برگزار کنید.",
  patient_time_conflict: "در همین زمان نوبت دیگری دارید.",
  invalid_state: "وضعیت نوبت اجازه‌ی این کار را نمی‌دهد.",
  too_late: "زمان این اقدام گذشته است.",
  too_early: "هنوز زود است؛ کمی بعد دوباره امتحان کنید.",
  concurrent_modification: "نوبت هم‌زمان تغییر کرد؛ صفحه را تازه کنید.",
  active_appointments_in_range: "در این بازه نوبت فعال دارید؛ ابتدا آن‌ها را لغو کنید.",
  invalid_availability: "برنامه‌ی هفتگی معتبر نیست (تداخل یا ساعت نادرست).",
  availability_incompatible_with_slot_minutes: "برنامه‌ی فعلی با این طول اسلات سازگار نیست.",
  video_unavailable: "سرویس ویزیت تصویری فعلاً در دسترس نیست. کمی بعد دوباره امتحان کنید.",
  not_video_visit: "این نوبت از نوع ویزیت تصویری نیست.",
  room_unavailable: "اتاق ویزیت آماده نشد. دوباره امتحان کنید.",
  already_reviewed: "این درخواست قبلاً بررسی شده است.",
  invalid_triage_input: "اطلاعات ارزیابی معتبر نیست؛ مراحل را دوباره بررسی کنید.",
  window_closed: "مهلت ویرایش این مورد تمام شده است؛ فقط می‌توانید الحاقیه ثبت کنید.",
  already_signed: "این یادداشت امضا شده و قابل ویرایش نیست.",
  not_signed: "ابتدا یادداشت باید امضا شود.",
  soap_invalid: "برای امضا، «ارزیابی» و «برنامه‌ی درمان» لازم است و کد تشخیص‌ها باید معتبر (ICD-10) باشد.",
  allergy_warning: "هشدار حساسیت دارویی: پیش از ثبت، هشدارها را بررسی و تأیید کنید.",
  invalid_items: "اقلام نسخه معتبر نیست (نام، دوز، دفعات، مدت و تعداد را بررسی کنید؛ نام تکراری مجاز نیست).",
  invalid_validity: "مدت اعتبار نسخه معتبر نیست.",
  payment_unavailable: "درگاه‌های پرداخت فعلاً در دسترس نیستند. چند دقیقه بعد دوباره امتحان کنید.",
  already_paid: "این نوبت قبلاً پرداخت شده است.",
  payment_not_required: "این نوبت رایگان است و نیازی به پرداخت ندارد.",
  too_many_payment_attempts: "تعداد تلاش‌های پرداخت برای این نوبت به سقف رسیده است. با پشتیبانی تماس بگیرید.",
  price_changed: "مبلغ نوبت تغییر کرده است؛ با پشتیبانی تماس بگیرید.",
  callback_not_allowed: "آدرس بازگشت از درگاه مجاز نیست.",
  payment_not_found: "پرداختی با این مشخصات پیدا نشد.",
  already_cancelled: "این نسخه قبلاً باطل شده است.",
  reason_required: "دلیل ابطال را بنویسید (حداقل ۵ نویسه).",
  appointment_not_completed: "نظر دوم فقط برای نوبتِ انجام‌شده ممکن است.",
  request_window_passed: "مهلت درخواست نظر دوم برای این نوبت (۳۰ روز) گذشته است.",
  same_doctor: "پزشک نظر دوم باید غیر از پزشک همین نوبت باشد.",
  too_many_open: "به سقف درخواست‌های بازِ نظر دوم رسیده‌اید.",
  too_many_for_appointment: "برای این نوبت به سقف درخواست نظر دوم رسیده‌اید.",
  duplicate_request: "برای همین پزشک درخواست بازی دارید.",
  too_many_records: "حداکثر ۱۰ پرونده را می‌توانید ضمیمه کنید.",
  invalid_records: "برخی پرونده‌ها معتبر نیستند.",
  no_visit_summary: "برای این نوبت خلاصه‌ی ویزیتی ثبت نشده است.",
  deadline_passed: "مهلت این اقدام تمام شده است.",
  invalid_object_key: "فایل نامعتبر است.",
  upload_missing: "فایل هنوز آپلود نشده است.",
  attachment_exists: "این فایل قبلاً ضمیمه شده است.",
  expiry_in_past: "تاریخ انقضا باید در آینده باشد.",
  expiry_too_far: "انقضای اشتراک حداکثر یک سال است.",
  cannot_review_own_application: "درخواست خودتان را نمی‌توانید بررسی کنید.",
  mfa_required: "تأیید دومرحلهای لازم است.",
  mfa_invalid_code: "کد تأیید نادرست است. دوباره امتحان کنید.",
  mfa_not_enrolled: "ابتدا احراز هویت دومرحلهای را فعال کنید.",
  mfa_not_enabled: "احراز هویت دومرحلهای هنوز فعال نشده است.",
  mfa_already_enabled: "احراز هویت دومرحلهای قبلاً فعال شده است.",
  mfa_required_by_policy: "سیاست امنیتی ادمین، داشتن MFA را الزامی میکند.",
  mfa_locked: "تلاشهای ناموفق زیاد بود؛ مدتی صبر کنید.",
};

/** پیام قابل‌نمایش برای کاربر؛ جزئیات فنی هرگز نشان داده نمی‌شود. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if ((e.code === "mfa_locked" || e.code === "too_many_requests") && e.retryAfterSec) {
      const mins = Math.ceil(e.retryAfterSec / 60);
      return mins > 1 ? `تعداد تلاش‌ها زیاد است. حدود ${mins} دقیقه بعد دوباره امتحان کنید.` : "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید.";
    }
    return MESSAGES[e.code] ?? (e.status >= 500 ? "خطای سرور. کمی بعد دوباره امتحان کنید." : "درخواست انجام نشد.");
  }
  return "خطای ناشناخته.";
}

export const STATUS_LABEL: Record<string, { text: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }> = {
  PENDING_PAYMENT: { text: "در انتظار پرداخت", tone: "warn" },
  PENDING_CONFIRMATION: { text: "در انتظار تأیید پزشک", tone: "warn" },
  CONFIRMED: { text: "تأیید شده", tone: "ok" },
  IN_PROGRESS: { text: "در حال ویزیت", tone: "info" },
  COMPLETED: { text: "انجام شد", tone: "muted" },
  CANCELLED_BY_PATIENT: { text: "لغو توسط بیمار", tone: "bad" },
  CANCELLED_BY_DOCTOR: { text: "لغو توسط پزشک", tone: "bad" },
  EXPIRED: { text: "منقضی شد", tone: "muted" },
  NO_SHOW_PATIENT: { text: "غیبت بیمار", tone: "bad" },
  NO_SHOW_DOCTOR: { text: "غیبت پزشک", tone: "bad" },
};

export const KIND_LABEL: Record<string, string> = { VIDEO: "ویزیت تصویری", CHAT: "گفتگوی متنی", IN_PERSON: "حضوری" };
export const WEEKDAYS_FA = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
