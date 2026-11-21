/** برچسب/آیکون دسته‌های پرونده‌ی سلامت و نوع خلاصه‌ی پرونده (منبع واحد برای صفحه‌های پرونده). */
export const CATEGORY_LABEL: Record<string, string> = {
  NOTE:             "یادداشت",
  LAB_RESULT:       "نتیجه آزمایش",
  IMAGING:          "تصویربرداری",
  PRESCRIPTION:     "نسخه",
  DISCHARGE_SUMMARY:"خلاصه ترخیص",
  REFERRAL:         "ارجاع",
  VACCINATION:      "واکسیناسیون",
  OTHER:            "سایر",
};
export const CATEGORY_ICON: Record<string,string> = {
  NOTE:"📝", LAB_RESULT:"🧪", IMAGING:"🔬", PRESCRIPTION:"💊",
  DISCHARGE_SUMMARY:"🏥", REFERRAL:"📋", VACCINATION:"💉", OTHER:"📄",
};

export interface RecordSummary {
  id: string; title: string; category: string;
  visitDate: string | null; tags: string[];
  attachmentCount: number; createdAt: string;
}
