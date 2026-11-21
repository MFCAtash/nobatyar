/**
 * داده‌های نمایشی محیط توسعه — نام‌های واقع‌نما، درمانگاه‌ها، پزشکان متخصص و نوبت‌های پیش‌فرض.
 *
 * ⚠️ این فایل هیچ I/O ندارد و فقط در غیر production استفاده می‌شود؛ شماره‌های آن در
 * `DEMO_PHONES` (bootstrap-policy) ثبت شده‌اند تا `seed` در production در صورت وجودشان خطا بدهد.
 */

export interface DemoClinic {
  name: string;
  address: string;
  phone: string;
}

export interface DemoDoctor {
  phone: string;
  fullName: string;
  specialty: string;
  clinic: number;
  bio: string;
  feeRial: number;
  slotMinutes: number;
  days: number[];
  windows: Array<[string, string]>;
  autoConfirm?: boolean;
  acceptsSecondOpinions?: boolean;
}

export interface DemoPatient {
  phone: string;
  fullName: string;
  gender: "female" | "male";
}

export type DemoAppointmentStatus =
  | "PENDING_PAYMENT"
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED_BY_PATIENT"
  | "CANCELLED_BY_DOCTOR"
  | "NO_SHOW_PATIENT"
  | "NO_SHOW_DOCTOR";

export type DemoAppointmentKind = "IN_PERSON" | "VIDEO" | "CHAT";

export interface DemoAppointment {
  key: string;
  patientPhone: string;
  doctorPhone: string;
  /** نسبت به امروز به وقت تهران؛ منفی = گذشته. */
  dayOffset: number;
  time: string;
  durationMin: number;
  status: DemoAppointmentStatus;
  kind: DemoAppointmentKind;
  reason: string;
  /** آیا پرداخت موفق (SANDBOX) برای این نوبت ثبت شود؟ */
  paid: boolean;
}

export const SPECIALTIES = [
  ["general", "پزشک عمومی"],
  ["cardiology", "قلب و عروق"],
  ["dermatology", "پوست و مو"],
  ["pediatrics", "کودکان"],
  ["internal", "داخلی"],
  ["neurology", "مغز و اعصاب"],
  ["gastroenterology", "گوارش و کبد"],
  ["orthopedics", "ارتوپدی"],
  ["ent", "گوش، حلق و بینی"],
  ["urology", "کلیه و مجاری ادراری"],
  ["gynecology", "زنان و زایمان"],
  ["psychiatry", "روان‌پزشکی"],
  ["ophthalmology", "چشم‌پزشکی"],
  ["endocrinology", "غدد و متابولیسم"],
] as const;

export const DEMO_CLINICS: readonly DemoClinic[] = [
  { name: "کلینیک قلب و عروق امید", address: "تهران، خیابان ولیعصر، نبش خیابان پارک ساعی، پلاک ۱۲", phone: "02188776655" },
  { name: "کلینیک پوست و زیبایی آرنیکا", address: "تهران، سعادت‌آباد، بلوار دریا، پلاک ۴۵", phone: "02122334455" },
  { name: "درمانگاه شبانه‌روزی مهر", address: "تهران، خیابان آزادی، نبش خیابان اسکندری، پلاک ۸", phone: "02166554433" },
  { name: "کلینیک کودکان پارسیان", address: "تهران، خیابان شریعتی، بالاتر از حسینیه ارشاد، پلاک ۲۲۰", phone: "02122667788" },
  { name: "مرکز پزشکی آرامش", address: "تهران، میرداماد، خیابان نفت شمالی، پلاک ۳۳", phone: "02122225566" },
  { name: "کلینیک بانوان نیلوفر", address: "تهران، ونک، خیابان ملاصدرا، پلاک ۹۰", phone: "02188779900" },
  { name: "درمانگاه سلامت نوین", address: "کرج، عظیمیه، بلوار کاج، پلاک ۱۵", phone: "02632554433" },
  { name: "کلینیک چشم بینا", address: "تهران، خیابان انقلاب، نبش خیابان وصال، پلاک ۷۷", phone: "02166445577" },
  { name: "کلینیک تخصصی سینا", address: "تهران، یوسف‌آباد، خیابان دکارتی، پلاک ۲۱", phone: "02188664422" },
  { name: "مرکز مشاوره و روان‌درمانی مهرگان", address: "تهران، جردن، خیابان ناهید، پلاک ۵", phone: "02126403311" },
  { name: "کلینیک غدد و متابولیسم پارسیان", address: "تهران، شریعتی، نبش میرداماد، پلاک ۱۱۰", phone: "02122668844" },
];

/** تخصص متناظر با هر درمانگاه (برای هم‌خوانی نام درمانگاه و تخصص در پروفایل‌های جانشین). */
export const CLINIC_SPECIALTY: readonly string[] = [
  "cardiology", "dermatology", "internal", "pediatrics", "neurology", "gynecology",
  "general", "ophthalmology", "ent", "psychiatry", "endocrinology",
];

/** ۱۴ پزشک متخصص در ۱۱ درمانگاه/کلینیک. */
export const DEMO_DOCTORS: readonly DemoDoctor[] = [
  {
    phone: "09120000001", fullName: "دکتر آرش نیکومنش", specialty: "cardiology", clinic: 0,
    bio: "متخصص قلب و عروق، فلوشیپ اکوکاردیوگرافی و تست ورزش؛ ۱۵ سال سابقهٔ تشخیص و درمان بیماری‌های قلبی.",
    feeRial: 4_500_000, slotMinutes: 20, days: [0, 1, 2, 3, 4], windows: [["09:00", "13:00"], ["16:00", "20:00"]],
    acceptsSecondOpinions: true,
  },
  {
    phone: "09120000011", fullName: "دکتر سارا محمدی", specialty: "dermatology", clinic: 1,
    bio: "متخصص پوست، مو و زیبایی؛ درمان آکنه، ریزش مو و لیزر با رویکرد کم‌تهاجمی.",
    feeRial: 3_800_000, slotMinutes: 20, days: [0, 2, 4, 6], windows: [["10:00", "14:00"]],
  },
  {
    phone: "09120000012", fullName: "دکتر محمدحسین کریمی", specialty: "internal", clinic: 2,
    bio: "متخصص بیماری‌های داخلی؛ پیگیری فشار خون، دیابت و چکاپ دوره‌ای بزرگسالان.",
    feeRial: 2_900_000, slotMinutes: 15, days: [0, 1, 2, 3, 4, 5], windows: [["08:00", "14:00"]],
    autoConfirm: true,
  },
  {
    phone: "09120000013", fullName: "دکتر زهرا احمدی", specialty: "pediatrics", clinic: 3,
    bio: "متخصص کودکان و نوزادان؛ رشد و تکامل، واکسیناسیون و تغذیهٔ شیرخواران.",
    feeRial: 3_200_000, slotMinutes: 15, days: [0, 1, 3, 5], windows: [["09:00", "13:00"], ["17:00", "20:00"]],
  },
  {
    phone: "09120000014", fullName: "دکتر علی رضایی", specialty: "neurology", clinic: 4,
    bio: "متخصص مغز و اعصاب؛ سردرد، میگرن، صرع و اختلالات خواب.",
    feeRial: 4_200_000, slotMinutes: 20, days: [1, 2, 4], windows: [["10:00", "16:00"]],
    acceptsSecondOpinions: true,
  },
  {
    phone: "09120000015", fullName: "دکتر مریم حسینی", specialty: "gynecology", clinic: 5,
    bio: "متخصص زنان و زایمان؛ مراقبت بارداری، سلامت بانوان و مشاورهٔ ناباروری.",
    feeRial: 3_900_000, slotMinutes: 20, days: [0, 2, 3, 5], windows: [["09:00", "14:00"]],
  },
  {
    phone: "09120000016", fullName: "دکتر رضا صادقی", specialty: "orthopedics", clinic: 6,
    bio: "متخصص ارتوپدی؛ آسیب‌های ورزشی، شکستگی و دردهای ستون فقرات.",
    feeRial: 3_600_000, slotMinutes: 20, days: [1, 3, 4, 6], windows: [["09:00", "15:00"]],
  },
  {
    phone: "09120000017", fullName: "دکتر فاطمه موسوی", specialty: "ophthalmology", clinic: 7,
    bio: "متخصص چشم‌پزشکی؛ معاینهٔ بینایی، آب‌مروارید و خشکی چشم.",
    feeRial: 3_400_000, slotMinutes: 15, days: [0, 2, 5], windows: [["09:00", "13:00"]],
  },
  {
    phone: "09120000018", fullName: "دکتر امیر قاسمی", specialty: "ent", clinic: 8,
    bio: "متخصص گوش، حلق و بینی؛ سینوزیت، شنوایی و جراحی بینی.",
    feeRial: 3_100_000, slotMinutes: 15, days: [1, 2, 4, 5], windows: [["10:00", "14:00"], ["16:00", "19:00"]],
  },
  {
    phone: "09120000019", fullName: "دکتر نرگس عبدی", specialty: "psychiatry", clinic: 9,
    bio: "روان‌پزشک؛ اضطراب، افسردگی و مشاورهٔ فردی با رویکرد شناختی‌رفتاری.",
    feeRial: 3_700_000, slotMinutes: 30, days: [0, 1, 3, 5], windows: [["11:00", "18:00"]],
    acceptsSecondOpinions: true,
  },
  {
    phone: "09120000020", fullName: "دکتر سعید مرادی", specialty: "gastroenterology", clinic: 2,
    bio: "متخصص گوارش و کبد؛ سوءهاضمه، رفلاکس و بیماری‌های التهابی روده.",
    feeRial: 3_500_000, slotMinutes: 20, days: [0, 1, 2, 3, 4, 5], windows: [["14:00", "20:00"]],
  },
  {
    phone: "09120000021", fullName: "دکتر لیلا شریفی", specialty: "endocrinology", clinic: 10,
    bio: "متخصص غدد و متابولیسم؛ دیابت، تیروئید و اختلالات هورمونی.",
    feeRial: 3_300_000, slotMinutes: 20, days: [0, 2, 3, 5], windows: [["09:00", "13:00"]],
  },
  {
    phone: "09120000022", fullName: "دکتر حمید توکلی", specialty: "general", clinic: 6,
    bio: "پزشک عمومی؛ ویزیت سرپایی، چکاپ و ارجاع تخصصی.",
    feeRial: 1_800_000, slotMinutes: 15, days: [0, 1, 2, 3, 4, 5], windows: [["08:00", "20:00"]],
    autoConfirm: true,
  },
  {
    phone: "09120000023", fullName: "دکتر پریسا کاظمی", specialty: "urology", clinic: 8,
    bio: "متخصص کلیه و مجاری ادراری؛ سنگ کلیه، عفونت ادراری و سلامت مردان.",
    feeRial: 3_400_000, slotMinutes: 20, days: [1, 3, 5], windows: [["10:00", "15:00"]],
  },
];

/** ۸ بیمار نمایشی؛ نفر اول همان حساب دموی بیمار (09120000002) است. */
export const DEMO_PATIENTS: readonly DemoPatient[] = [
  { phone: "09120000002", fullName: "سارا موسوی", gender: "female" },
  { phone: "09120000031", fullName: "امیرحسین شریفی", gender: "male" },
  { phone: "09120000032", fullName: "نگار رستمی", gender: "female" },
  { phone: "09120000033", fullName: "محمدرضا فتحی", gender: "male" },
  { phone: "09120000034", fullName: "الهام صادقی", gender: "female" },
  { phone: "09120000035", fullName: "بهنام کاظمی", gender: "male" },
  { phone: "09120000036", fullName: "زینب مرادی", gender: "female" },
  { phone: "09120000037", fullName: "حسین اکبری", gender: "male" },
];

/**
 * نوبت‌های پیش‌فرض. تاریخ‌ها نسبت به «امروز» محاسبه می‌شوند تا دمو همیشه تازه بماند.
 * هیچ دو نوبتِ فعالی برای یک پزشک هم‌پوشانی ندارد (قید no_double_booking).
 */
export const DEMO_APPOINTMENTS: readonly DemoAppointment[] = [
  { key: "skin-followup", patientPhone: "09120000002", doctorPhone: "09120000011", dayOffset: 1, time: "10:00", durationMin: 20, status: "CONFIRMED", kind: "VIDEO", reason: "پیگیری درمان آکنه و بررسی روند بهبود پوست.", paid: true },
  { key: "heart-check", patientPhone: "09120000002", doctorPhone: "09120000001", dayOffset: 3, time: "11:00", durationMin: 20, status: "PENDING_CONFIRMATION", kind: "IN_PERSON", reason: "چکاپ قلب و بررسی درد قفسهٔ سینه هنگام فعالیت.", paid: true },
  { key: "child-visit", patientPhone: "09120000002", doctorPhone: "09120000013", dayOffset: 5, time: "09:30", durationMin: 15, status: "PENDING_PAYMENT", kind: "VIDEO", reason: "مشاورهٔ تغذیه و رشد کودک.", paid: false },
  { key: "internal-past", patientPhone: "09120000002", doctorPhone: "09120000012", dayOffset: -20, time: "10:00", durationMin: 15, status: "COMPLETED", kind: "IN_PERSON", reason: "ویزیت داخلی و بررسی نتایج آزمایش خون.", paid: true },
  { key: "neuro-cancelled", patientPhone: "09120000002", doctorPhone: "09120000014", dayOffset: -35, time: "17:00", durationMin: 20, status: "CANCELLED_BY_PATIENT", kind: "IN_PERSON", reason: "سردردهای مکرر و نیاز به بررسی عصبی.", paid: false },
  { key: "eye-past", patientPhone: "09120000002", doctorPhone: "09120000017", dayOffset: -60, time: "11:00", durationMin: 15, status: "COMPLETED", kind: "VIDEO", reason: "معاینهٔ بینایی و خشکی چشم.", paid: true },

  { key: "heart-other", patientPhone: "09120000032", doctorPhone: "09120000001", dayOffset: 1, time: "11:00", durationMin: 20, status: "CONFIRMED", kind: "IN_PERSON", reason: "پیگیری فشار خون و نوار قلب.", paid: true },
  { key: "internal-other", patientPhone: "09120000031", doctorPhone: "09120000012", dayOffset: 2, time: "09:00", durationMin: 15, status: "CONFIRMED", kind: "IN_PERSON", reason: "چکاپ سالانه و بررسی قند خون.", paid: true },
  { key: "skin-other", patientPhone: "09120000033", doctorPhone: "09120000011", dayOffset: -1, time: "12:00", durationMin: 20, status: "COMPLETED", kind: "IN_PERSON", reason: "درمان ریزش مو و بررسی آزمایش.", paid: true },
  { key: "gyn-other", patientPhone: "09120000034", doctorPhone: "09120000015", dayOffset: 4, time: "10:30", durationMin: 20, status: "PENDING_CONFIRMATION", kind: "IN_PERSON", reason: "مشاورهٔ سلامت بانوان.", paid: true },
  { key: "ortho-noshow", patientPhone: "09120000035", doctorPhone: "09120000016", dayOffset: -10, time: "14:00", durationMin: 20, status: "NO_SHOW_PATIENT", kind: "IN_PERSON", reason: "درد زانو پس از فعالیت ورزشی.", paid: false },
  { key: "psy-other", patientPhone: "09120000036", doctorPhone: "09120000019", dayOffset: 6, time: "12:00", durationMin: 30, status: "CONFIRMED", kind: "VIDEO", reason: "جلسهٔ مشاورهٔ اضطراب.", paid: true },
  { key: "gi-past", patientPhone: "09120000037", doctorPhone: "09120000020", dayOffset: -12, time: "16:00", durationMin: 20, status: "COMPLETED", kind: "IN_PERSON", reason: "بررسی رفلاکس معده و سوءهاضمه.", paid: true },
];

/**
 * نام‌های جایگزین برای پروفایل‌های باقی‌مانده از تست‌های خودکار (نام‌هایی مثل «دکتر x7k2p1»).
 * disjoint از نام‌های roster تا دمو دچار نام تکراری نشود.
 */
export const FALLBACK_DOCTOR_NAMES: readonly string[] = [
  "بهرام سلطانی", "شیما اکبری", "کاوه مهدوی", "الهام نوری", "بابک فرهادی",
  "مینا جعفری", "حسین طاهری", "سمانه رحیمی", "فرید امینی", "نگین زمانی",
  "پویا بهرامی", "آزاده صفری", "مهدی خسروی", "رویا یزدانی", "شهاب مرتضوی",
  "تینا ابراهیمی", "کامران راد", "مژگان پارسا", "یاسین ملکی", "هدیه صبوری",
  "سپهر نیک‌خواه", "غزل مقدم", "بابک زمانی", "مهتاب راد", "سروش کاویانی",
  "نازلی فرهنگ", "آرمین دهقان", "شقایق براتی", "فرزاد نعمتی", "پریا شفیعی",
  "مسعود بهمنی", "ترانه سلطانی", "نیما اکبرزاده", "سحر خلیلی", "رضا معینی",
  "هستی صادقی", "امید نجفی", "درسا محمدی", "پیمان قنبری", "نازنین رفیعی",
  "بهرام اسکندری", "مینا شریفی", "کیوان افشار", "سارا بهرامی", "آرزو کرمانی",
  "حامد یوسفی", "ندا شمس", "پوریا رستگار", "مریم پناهی", "شایان ملکی",
];

export const FALLBACK_PATIENT_NAMES: readonly string[] = [
  "مینا تقوی", "پارسا نیک‌پور", "فاطمه رحیمی", "کیانوش عزیزی", "سمانه حیدری",
  "آرمان قربانی", "نازنین شمس", "یاسر محمدی", "شیوا کاظمی", "رامین اسدی",
  "مهسا علوی", "دانیال نادری", "فرزانه سلیمی", "امید رضوانی", "لیلا احمدی",
  "سینا ملکی", "هانیه فراهانی", "بابک شجاعی", "آیدا کریمی", "مهدی نوروزی",
  "رها نیک‌نام", "سپیده قاسمی", "آرش شفیعی", "نگین حیدری", "پیمان راد",
  "مریم صفری", "کیانا مرادی", "سروش اکبری", "آیدا نوری", "بهار امینی",
  "رضا شمس", "لیلا کاظمی", "امیر توکلی", "نازیلا رحیمی", "سعید بهرامی",
  "مینا سلطانی", "فرزاد کریمی", "شیما نادری", "حمید رستمی", "پریسا صادقی",
  "یاسمن عزیزی", "کامران شریفی", "نرگس یزدانی", "بابک مرادی", "سحر زمانی",
  "امیرحسین رضایی", "الهام کاظمی", "حسین نوری", "زهرا اکبری", "محمد صالحی",
];

/** نام فارسیِ معتبر: فقط حروف فارسی/عربی، نیم‌فاصله و فاصله. */
export const PERSIAN_NAME_RE = /^[\u0600-\u06FF\u200c]+(?: [\u0600-\u06FF\u200c]+)+$/;

/** نام‌های عمومی/تستی که باید جایگزین شوند حتی اگر ظاهر فارسی دارند. */
export const JUNK_NAME_RE = /(نمونه|آزمون|تست|جعل|test|demo)/i;
