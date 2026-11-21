/** حالت‌هایی که ادمین می‌تواند از آن‌ها «اجرا» کند. REVIEW عمداً نیست: ممکن است درگاه قبلاً ثبت کرده باشد. */
export const EXECUTABLE_STATUSES = ["PENDING", "FAILED", "MANUAL"] as const;
/** حالت‌هایی که ادمین می‌تواند «انجام‌شده (دستی)» ثبت کند. */
export const MARKABLE_STATUSES = ["PENDING", "FAILED", "MANUAL", "REVIEW"] as const;
