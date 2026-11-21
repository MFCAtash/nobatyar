import { GatewayError } from "./gateway";
import type { GatewayName } from "./gateway";

/** زیرمجموعه‌ی fetch که تست‌ها جایگزین می‌کنند. */
export type FetchLike = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ status: number; text(): Promise<string> }>;

export interface HttpOptions {
  timeoutMs: number;
  fetchFn?: FetchLike;
}

const MAX_BODY_CHARS = 64 * 1024;

/**
 * POST JSON با timeout و سقف اندازه‌ی پاسخ.
 * خطای شبکه/timeout/۵xx/۴۲۹/JSON نامعتبر ⇒ GatewayError("unavailable").
 * بدنه‌ی درخواست/پاسخ و هدرها «هرگز» در پیام خطا نمی‌آیند (merchant/API key).
 * پاسخ‌های ۴xx دیگر (که درگاه گاهی با JSON خطا می‌دهد) برای تحلیل به فراخواننده برمی‌گردند.
 */
export async function postJson(
  gateway: GatewayName,
  url: string,
  body: unknown,
  opts: HttpOptions,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const doFetch: FetchLike = opts.fetchFn ?? ((u, i) => fetch(u, i));
  let res: { status: number; text(): Promise<string> };
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (e) {
    const name = (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError" ? "timeout" : "network";
    throw new GatewayError(gateway, "unavailable", `${gateway}: ${name}`);
  }
  if (res.status >= 500 || res.status === 429) throw new GatewayError(gateway, "unavailable", `${gateway}: http ${res.status}`);

  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new GatewayError(gateway, "unavailable", `${gateway}: body read failed`);
  }
  if (text.length > MAX_BODY_CHARS) throw new GatewayError(gateway, "unavailable", `${gateway}: response too large`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GatewayError(gateway, "unavailable", `${gateway}: non-json response (http ${res.status})`);
  }
  // Zarinpal در خطا گاهی `data: []` برمی‌گرداند؛ ساختار آرایه/غیرشیء هم معتبر است و فراخواننده تفسیر می‌کند
  if (parsed === null || typeof parsed !== "object") throw new GatewayError(gateway, "unavailable", `${gateway}: unexpected json`);
  return { status: res.status, json: parsed as Record<string, unknown> };
}
