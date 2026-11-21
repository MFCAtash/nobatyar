/** طبقه‌بندی داده — جزئیات در docs/data-classification.md */
export const DATA_CLASSES = ["PUBLIC", "PERSONAL", "HEALTH"] as const;
export type DataClass = (typeof DATA_CLASSES)[number];
