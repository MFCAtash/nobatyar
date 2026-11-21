import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * نقطه‌ی بازگشت از درگاه (زرین‌پال/Zibal GET، IDPay POST). فقط پارامترهای شناخته‌شده را با سقف طول برمی‌دارد و
 * با ۳۰۳ به صفحه‌ی /payment می‌برد؛ «هیچ تأییدی اینجا انجام نمی‌شود» — تأیید را سرور API با خود درگاه انجام می‌دهد
 * (POST /payments/verify). پارامتر Status/success صرفاً راهنمای نمایشی است.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

function pick(get: (k: string) => string | null | undefined, keys: string[]): string {
  for (const k of keys) {
    const v = get(k);
    if (v && TOKEN.test(v)) return v;
  }
  return "";
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const appointmentId = url.searchParams.get("appointmentId") ?? "";
  // مبدأ را از آدرس درخواست می‌گیریم، نه از ورودی (open-redirect نداریم: فقط همین سایت)
  const base = process.env.WEB_ORIGIN || url.origin;
  const dest = new URL("/payment", base);
  if (!UUID.test(appointmentId)) return NextResponse.redirect(new URL("/appointments", base), 303);

  let form: FormData | null = null;
  if (req.method === "POST") {
    try { form = await req.formData(); } catch { form = null; }
  }
  const get = (k: string) => (form?.get(k) as string | null) ?? url.searchParams.get(k);

  // authority: Authority (زرین‌پال) | trackId (Zibal) | id (IDPay)
  const authority = pick(get, ["Authority", "authority", "trackId", "id"]);
  const status = (get("Status") ?? get("status") ?? get("success") ?? "").toString().slice(0, 16);

  dest.searchParams.set("appointmentId", appointmentId);
  dest.searchParams.set("step", "verify");
  if (authority) dest.searchParams.set("authority", authority);
  if (/^[A-Za-z0-9_-]*$/.test(status) && status) dest.searchParams.set("status", status);
  return NextResponse.redirect(dest, 303);
}

export const GET = handle;
export const POST = handle;
