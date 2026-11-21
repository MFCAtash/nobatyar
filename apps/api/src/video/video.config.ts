export const VIDEO_CONFIG = Symbol("VIDEO_CONFIG");

export interface VideoConfig {
  /** false = LiveKit تنظیم نشده؛ اپ بالا می‌آید ولی مسیرهای ویدئو 503 (video_unavailable) می‌دهند. */
  enabled: boolean;
  /** آدرسی که «مرورگر» به آن وصل می‌شود (ws:// یا wss://). */
  wsUrl: string;
  /** آدرسی که «سرور» برای API مدیریت اتاق (Twirp) صدا می‌زند (http(s)://). */
  httpUrl: string;
  apiKey: string;
  apiSecret: string;
  /** حداکثر عمر توکن ورود؛ همیشه به پایان پنجره‌ی ویزیت هم محدود می‌شود. */
  tokenTtlSec: number;
  /** پس از پایان زمان نوبت تا چند دقیقه ورود/اتصال مجدد مجاز است (طولانی‌شدن ویزیت). */
  joinGraceMinutes: number;
}

const int = (v: string | undefined, d: number, name: string, min: number, max: number): number => {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  return n;
};

const toHttp = (u: string): string => u.replace(/^ws(s?):\/\//i, "http$1://").replace(/\/+$/, "");

export function loadVideoConfig(env: NodeJS.ProcessEnv = process.env): VideoConfig {
  const isProduction = env.NODE_ENV === "production";
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env;
  const provided = [LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET].filter(Boolean).length;

  const tokenTtlSec = int(env.VIDEO_TOKEN_TTL_SEC, 600, "VIDEO_TOKEN_TTL_SEC", 60, 3600);
  const joinGraceMinutes = int(env.VIDEO_JOIN_GRACE_MINUTES, 15, "VIDEO_JOIN_GRACE_MINUTES", 0, 120);

  if (provided === 0) {
    if (isProduction) throw new Error("LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required in production");
    return { enabled: false, wsUrl: "", httpUrl: "", apiKey: "", apiSecret: "", tokenTtlSec, joinGraceMinutes };
  }
  if (provided !== 3) throw new Error("LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set together");

  const wsUrl = LIVEKIT_URL!.trim().replace(/\/+$/, "");
  if (!/^wss?:\/\//i.test(wsUrl)) throw new Error("LIVEKIT_URL must start with ws:// or wss://");
  if (isProduction && !/^wss:\/\//i.test(wsUrl)) throw new Error("LIVEKIT_URL must be wss:// in production");
  if (LIVEKIT_API_SECRET!.length < 32) throw new Error("LIVEKIT_API_SECRET must be at least 32 characters");

  const httpUrl = env.LIVEKIT_HTTP_URL ? env.LIVEKIT_HTTP_URL.trim().replace(/\/+$/, "") : toHttp(wsUrl);
  if (!/^https?:\/\//i.test(httpUrl)) throw new Error("LIVEKIT_HTTP_URL must start with http:// or https://");

  return { enabled: true, wsUrl, httpUrl, apiKey: LIVEKIT_API_KEY!, apiSecret: LIVEKIT_API_SECRET!, tokenTtlSec, joinGraceMinutes };
}
