/** داده‌ی ساختگیِ مشترک برای Storybook و تست‌های بصری (هیچ داده‌ی واقعی نیست). */
import type { ConvSummary } from "@/components/chat/ConversationListView";
import type { DoctorCompare } from "@/components/compare/CompareView";
import type { Member } from "@/components/family/FamilyView";
import type { RecordDetail } from "@/components/records/types";
import type { ChatMessage } from "@/hooks/use-chat";
import type { Notification } from "@/lib/notifications-state";
import type { RecordSummary } from "@/lib/record-categories";
import type { DoctorCard } from "@/lib/types";

export const noop = (): void => undefined;
const T = (m: number) => new Date(Date.UTC(2026, 9, 13, 5, 30 + m)).toISOString();

export const doctors: DoctorCard[] = [
  { id: "d1", fullName: "دکتر مریم احمدی", bio: "متخصص قلب و عروق با ۱۲ سال سابقه‌ی درمانگاهی و ویزیت آنلاین.", consultationFeeRial: "3500000", slotMinutes: 20, clinic: null, specialties: [{ slug: "cardio", nameFa: "قلب و عروق" }] },
  { id: "d2", fullName: "دکتر علی رضایی", bio: null, consultationFeeRial: "2400000", slotMinutes: 15, clinic: null, specialties: [{ slug: "gp", nameFa: "پزشک عمومی" }, { slug: "internal", nameFa: "داخلی" }] },
  { id: "d3", fullName: "دکتر سارا کریمی", bio: "پوست و مو، زیبایی و لیزر.", consultationFeeRial: "4200000", slotMinutes: 30, clinic: { name: "مطب پوست", address: "تهران، خیابان ولیعصر", phone: "02112345678" }, specialties: [{ slug: "derm", nameFa: "پوست و مو" }] },
];
export const specialties = [{ slug: "cardio", nameFa: "قلب و عروق" }, { slug: "gp", nameFa: "پزشک عمومی" }, { slug: "derm", nameFa: "پوست و مو" }];

export const slots = ["04:30", "05:00", "05:30", "06:00", "06:30", "07:00"].map((hm, i) => ({ startsAt: T(-60 + i * 30), endsAt: T(-30 + i * 30), hm }));

export const messages: ChatMessage[] = [
  { id: "m1", conversationId: "c1", senderId: "doc", kind: "TEXT", body: "سلام، نتیجه‌ی آزمایش را دیدم. فشار خون اخیراً چقدر بوده؟", hasAttachment: false, readAt: T(2), createdAt: T(0) },
  { id: "m2", conversationId: "c1", senderId: "me", kind: "TEXT", body: "سلام دکتر. معمولاً حدود ۱۳۰ روی ۸۵ است و گاهی سرگیجه دارم.", hasAttachment: false, readAt: T(4), createdAt: T(3) },
  { id: "m3", conversationId: "c1", senderId: "me", kind: "FILE", body: "", attachmentName: "آزمایش-خون.pdf", attachmentMime: "application/pdf", attachmentBytes: 1_572_864, hasAttachment: true, readAt: null, createdAt: T(4) },
  { id: "m4", conversationId: "c1", senderId: "doc", kind: "IMAGE", body: "", attachmentName: "نوار-قلب.png", attachmentMime: "image/png", attachmentBytes: 480_000, hasAttachment: true, readAt: null, createdAt: T(6) },
];

export const convs: ConvSummary[] = [
  { id: "c1", appointmentId: "a1", peer: { userId: "doc", fullName: "دکتر مریم احمدی" }, lastMessage: { id: "m4", kind: "TEXT", senderId: "doc", bodyPreview: "نوار قلب را بررسی کردم، نگرانی خاصی نیست.", readAt: null, createdAt: T(6) }, unread: 3, createdAt: T(0) },
  { id: "c2", appointmentId: "a2", peer: { userId: "doc2", fullName: "دکتر علی رضایی" }, lastMessage: null, unread: 0, createdAt: T(-600) },
];

export const recordSummaries: RecordSummary[] = [
  { id: "r1", title: "نتیجه آزمایش خون", category: "LAB_RESULT", visitDate: T(-4000), tags: ["قند", "چربی"], attachmentCount: 2, createdAt: T(-3000) },
  { id: "r2", title: "یادداشت ویزیت قلب", category: "NOTE", visitDate: null, tags: [], attachmentCount: 0, createdAt: T(-9000) },
];
export const recordDetail: RecordDetail = {
  id: "r1", title: "نتیجه آزمایش خون", content: "قند ناشتا ۹۸\nکلسترول کل ۱۹۰\nپیشنهاد: تکرار آزمایش سه ماه بعد.", category: "LAB_RESULT", visitDate: T(-4000), tags: ["قند", "چربی"], createdAt: T(-3000), updatedAt: T(-3000),
  attachments: [{ id: "f1", fileName: "cbc.pdf", mimeType: "application/pdf", sizeBytes: 523_000, createdAt: T(-3000) }, { id: "f2", fileName: "اسکن.png", mimeType: "image/png", sizeBytes: 2_100_000, createdAt: T(-2900) }],
  shares: [{ id: "s1", doctorId: "d1", grantedAt: T(-2000), expiresAt: T(100_000), doctor: { fullName: "دکتر مریم احمدی" } }],
};

export const compareDoctors: DoctorCompare[] = [
  { id: "d1", fullName: "دکتر مریم احمدی", bio: "متخصص قلب با سابقه‌ی طولانی.", consultationFeeRial: "3500000", slotMinutes: 20, city: "تهران", onlineVisit: true, inPersonVisit: true, specialties: [{ slug: "cardio", nameFa: "قلب و عروق" }], workDays: [1, 3, 5] },
  { id: "d2", fullName: "دکتر علی رضایی", bio: null, consultationFeeRial: "2400000", slotMinutes: 15, city: "اصفهان", onlineVisit: true, inPersonVisit: false, specialties: [{ slug: "gp", nameFa: "پزشک عمومی" }], workDays: [0, 2, 4, 6] },
];

export const notifications: Notification[] = [
  { id: "n1", kind: "APPOINTMENT_REMINDER", titleFa: "یادآوری نوبت", bodyFa: "نوبت شما فردا ساعت ۱۰ است.", readAt: null, createdAt: T(0) },
  { id: "n2", kind: "PAYMENT_SUCCESS", titleFa: "پرداخت موفق", bodyFa: "پرداخت نوبت با موفقیت انجام شد.", readAt: T(5), createdAt: T(-120) },
];

export const members: Member[] = [
  { id: "f1", fullName: "علی رضایی", relation: "فرزند", birthYear: 1390, nationalIdMasked: "00******12" },
  { id: "f2", fullName: "زهرا رضایی", relation: "همسر" },
];
