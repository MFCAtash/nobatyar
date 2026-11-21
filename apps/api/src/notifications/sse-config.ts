/** تنظیمات SSE اعلان‌ها (از env، با اعتبارسنجی fail-fast هنگام بوت). */
export const SSE_CONFIG = Symbol("SSE_CONFIG");

/** هر ۲۵ ثانیه یک heartbeat: کمتر از idle-timeout ی رایج proxy/LB ها (۶۰ ثانیه). */
export const SSE_HEARTBEAT_DEFAULT_SEC = 25;

export interface SseConfig {
  heartbeatMs: number;
  maxStreamsPerUser: number;
  maxLifetimeMs: number;
  /** حداکثر تعداد اعلانِ «بازپخش» هنگام reconnect؛ بیشتر از آن ⇒ کلاینت لیست را از REST می‌گیرد. */
  replayMax: number;
  /** اگر بافر خروجیِ یک کلاینت کند از این بیشتر شد، اتصالش بسته می‌شود (پس از reconnect از DB جبران می‌شود). */
  maxBacklogBytes: number;
}

type Env = Record<string, string | undefined>;

function int(env: Env, name: string, def: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer in ${min}..${max}`);
  return n;
}

export function loadSseConfig(env: Env = process.env): SseConfig {
  return {
    // سقف ۵۰: heartbeat باید همیشه از ۶۰ ثانیه‌ی idle-timeout ی پیش‌فرض nginx/ELB کمتر بماند.
    heartbeatMs: int(env, "SSE_HEARTBEAT_SEC", SSE_HEARTBEAT_DEFAULT_SEC, 5, 50) * 1000,
    maxStreamsPerUser: int(env, "SSE_MAX_STREAMS_PER_USER", 8, 1, 50),
    maxLifetimeMs: int(env, "SSE_MAX_LIFETIME_SEC", 900, 30, 86_400) * 1000,
    replayMax: int(env, "SSE_REPLAY_MAX", 200, 1, 1000),
    maxBacklogBytes: 512 * 1024,
  };
}

/**
 * عمر یک stream: هرگز بیشتر از اعتبار access token ی همان اتصال نیست (کاربر معلق‌شده/نشست باطل‌شده
 * بیش از این به دریافت اعلان ادامه نمی‌دهد) و هرگز بیشتر از سقف تنظیمی.
 * پس از پایان، کلاینت با توکن تازه و Last-Event-ID دوباره وصل می‌شود.
 */
export function streamLifetimeMs(expSec: number | undefined, nowMs: number, maxMs: number): number {
  if (typeof expSec !== "number" || !Number.isFinite(expSec)) return maxMs;
  const remaining = expSec * 1000 - nowMs;
  return Math.max(1_000, Math.min(maxMs, remaining));
}
