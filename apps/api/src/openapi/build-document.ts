import { buildOpenApi } from "./build";
import { ROUTES } from "./registry";

export const API_VERSION = "1.0.0";

/** سند OpenAPI نوبت‌یار از روی registry (تنها نقطه‌ی ساخت؛ کنترلر، اسکریپت و تست همه از همین استفاده می‌کنند). */
export const buildDocument = () => buildOpenApi(ROUTES, {
  title: "NobatYar API",
  version: API_VERSION,
  description: "نوبت‌دهی و ویزیت پزشکی. همه‌ی مسیرها زیر /api/v1. endpoint های مالی «Idempotency-Key» می‌خواهند. این سند از Zod ی واقعی کنترلرها ساخته می‌شود (src/openapi).",
});
