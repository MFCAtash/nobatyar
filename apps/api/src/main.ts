import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { JsonLogger, parseLevel } from "./observability/json-logger";
import { text } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { RedisIoAdapter } from "./chat/redis-io.adapter";
import { loadAuthConfig } from "./config/auth.config";
import { describePaymentConfig, loadPaymentConfig } from "./payment/payment.config";
import { loadSentryConfig } from "./observability/sentry.config";
import { initSentry } from "./observability/sentry";
import { loadStorageConfig } from "./storage/storage.config";
import { describeKmsConfig, loadKmsConfig } from "./crypto/kms/kms.config";

async function bootstrap() {
  const cfg = loadAuthConfig(); // پیش از ساخت اپ: تنظیمات نامعتبر ⇒ توقف فوری
  // درگاه پرداخت (fail-closed): sandbox/تنظیم ناقص در production ⇒ همین‌جا throw و اپ بالا نمی‌آید
  const payCfg = loadPaymentConfig();
  new Logger("bootstrap").log(describePaymentConfig(payCfg));
  // ذخیره‌ساز فایل (fail-closed در production): نبود MinIO/آدرس عمومی/کلید محدود ⇒ همین‌جا throw (نه خطا در اولین آپلود کاربر)
  if (process.env.NODE_ENV === "production") loadStorageConfig();
  // KMS (fail-closed): در production نبود Vault/ARN معتبر ⇒ توقف فوری پیش از سرو ترافیک
  new Logger("bootstrap").log(describeKmsConfig(loadKmsConfig()));
  // مانیتورینگ خطا (Sentry) با scrubbing اجباری؛ بدون SENTRY_DSN کاملاً خاموش
  if (await initSentry(loadSentryConfig())) new Logger("bootstrap").log("sentry: on (scrubbed)");
  // لاگ ساخت‌یافته (JSON یک‌خطی، scrub شده، با trace_id) برای Loki؛ LOG_FORMAT=text فقط برای توسعه‌ی محلی
  const logger = process.env.LOG_FORMAT === "text" ? undefined : new JsonLogger(process.env.OTEL_SERVICE_NAME ?? "nobatyar-api", parseLevel(process.env.LOG_LEVEL));
  const app = await NestFactory.create(AppModule, logger ? { logger } : {});
  app.use(helmet());
  // webhook ی LiveKit: امضا روی بدنه‌ی «خام» محاسبه می‌شود؛ پیش از parser های JSON، فقط برای همین مسیر متن خام بخوان.
  app.use("/api/v1/video/webhook", text({ type: () => true, limit: "64kb" }));
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();

  // چت: socket.io روی Redis ⇒ رویدادها (new_message، typing، …) به سوکت‌های همه‌ی نمونه‌های API می‌رسد.
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required");
  const wsAdapter = new RedisIoAdapter(app, redisUrl);
  await wsAdapter.connect();
  app.useWebSocketAdapter(wsAdapter);

  // پشت reverse proxy: تعداد hop های مورد اعتماد (برای IP درست در rate limit)
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  const log = new Logger("bootstrap");
  const prod = process.env.NODE_ENV === "production";
  if (!Number.isInteger(hops) || hops < 0 || hops > 5) throw new Error("TRUST_PROXY_HOPS must be an integer 0..5");
  if (prod && hops === 0) log.warn("TRUST_PROXY_HOPS=0 در production: اگر پشت proxy هستید همه‌ی کاربران یک IP دیده می‌شوند و rate limit (OTP، triage، verify نسخه) مشترک می‌شود.");
  if (prod && process.env.ENABLE_WORKERS !== "true") log.warn("ENABLE_WORKERS!=true: این نمونه job های زمان‌بندی‌شده را اجرا نمی‌کند؛ مطمئن شوید نمونه‌ی worker دیگری فعال است.");
  if (hops > 0) (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", hops);

  // CORS فقط برای مبدأهای مجاز؛ credentials برای کوکی refresh
  app.enableCors({
    origin: cfg.corsOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Nobatyar-Csrf", "Idempotency-Key"],
    exposedHeaders: ["Idempotent-Replayed", "Retry-After"],
    methods: ["GET", "POST", "PATCH", "DELETE"],
    maxAge: 600,
  });

  await app.listen(Number(process.env.API_PORT ?? 3000), "0.0.0.0");
}
void bootstrap();
