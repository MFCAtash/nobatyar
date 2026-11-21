import { formatNumber } from "./format";
import type { SoStatus, Urgency } from "./types";

export const URGENCY_UI: Record<Urgency, { text: string; tone: "bad" | "warn" | "info" | "ok" | "muted"; icon: string }> = {
  EMERGENCY: { text: "اورژانسی — همین الان اقدام کنید", tone: "bad", icon: "🚨" },
  URGENT: { text: "فوری — همین امروز", tone: "warn", icon: "⚠️" },
  SOON: { text: "ظرف ۱ تا ۳ روز", tone: "info", icon: "🕒" },
  ROUTINE: { text: "غیرفوری — در یکی دو هفته", tone: "ok", icon: "📅" },
  SELF_CARE: { text: "مراقبت در منزل", tone: "ok", icon: "🏠" },
};

export const SO_UI: Record<SoStatus, { text: string; tone: "ok" | "warn" | "bad" | "info" | "muted" }> = {
  REQUESTED: { text: "در انتظار پاسخ پزشک", tone: "warn" },
  ACCEPTED: { text: "پذیرفته شد؛ منتظر پاسخ", tone: "info" },
  ANSWERED: { text: "پاسخ داده شد", tone: "ok" },
  DECLINED: { text: "رد شد", tone: "bad" },
  EXPIRED: { text: "منقضی شد", tone: "muted" },
  CANCELLED: { text: "لغو شد", tone: "muted" },
};
export const RX_STATUS_UI = { ACTIVE: { text: "معتبر", tone: "ok" }, EXPIRED: { text: "منقضی", tone: "muted" }, CANCELLED: { text: "باطل", tone: "bad" } } as const;
export const RX_FORM_FA: Record<string, string> = {
  TABLET: "قرص", CAPSULE: "کپسول", SYRUP: "شربت", INJECTION: "آمپول", DROP: "قطره", CREAM: "کرم", OINTMENT: "پماد", INHALER: "اسپری تنفسی", SPRAY: "اسپری", SUPPOSITORY: "شیاف", OTHER: "سایر",
};
export const SEVERITY_FA = { 1: "خفیف", 2: "متوسط", 3: "شدید" } as const;

/** سقف‌های سمت کلاینت (هم‌خوان با API؛ سرور تصمیم نهایی را می‌گیرد). */
export const MAX_SYMPTOMS = 3;

/** «کامیت» عمل بر اساس مهلت: چند ساعت مانده؟ منفی ⇒ گذشته. */
export const hoursLeft = (deadline: string | Date, now: number = Date.now()): number => (new Date(deadline).getTime() - now) / 3_600_000;
export function formatHoursLeft(h: number): string {
  if (h <= 0) return "مهلت تمام شده";
  if (h < 1) return "کمتر از یک ساعت";
  if (h < 48) return `${formatNumber(Math.floor(h))} ساعت`;
  return `${formatNumber(Math.floor(h / 24))} روز`;
}

/** تبدیل متن چندخطی به فهرست (هر خط یک مورد؛ خالی‌ها و تکراری‌ها حذف). */
export const splitLines = (s: string): string[] => [...new Set(s.split(/\n|،|,/).map((x) => x.trim()).filter(Boolean))];

/** آیا نوبت از نظر UX «بالینی» است (SOAP/نسخه معنا دارد)؟ — سرور تصمیم نهایی را می‌گیرد. */
export const clinicalWindowOpen = (status: string, endsAt: string, now: number = Date.now(), days = 7): boolean =>
  status === "IN_PROGRESS" || (status === "COMPLETED" && now <= new Date(endsAt).getTime() + days * 86_400_000);
