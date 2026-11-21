/**
 * راه‌اندازی OpenTelemetry — «پیش از» هر import ی دیگر بارگذاری می‌شود (instrumentation باید http/express را patch کند):
 *   NODE_OPTIONS="--require ./dist/observability/tracing-register.js"   (Dockerfile/compose وقتی OTEL_ENABLED=true)
 * بدون OTEL_ENABLED=true هیچ کاری نمی‌کند (صفر سربار). متغیرهای استاندارد OTEL_* (سرویس، sampler، endpoint) خوانده می‌شوند.
 */
import { createRequire } from "node:module";
import { scrubSpan, type MutableSpan } from "./tracing";

const enabled = process.env.OTEL_ENABLED === "true";

if (enabled) {
  const req = createRequire(__filename);
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- بارگذاری شرطی (فقط وقتی روشن است)
  const { NodeSDK } = req("@opentelemetry/sdk-node") as typeof import("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = req("@opentelemetry/exporter-trace-otlp-http") as typeof import("@opentelemetry/exporter-trace-otlp-http");
  const { getNodeAutoInstrumentations } = req("@opentelemetry/auto-instrumentations-node") as typeof import("@opentelemetry/auto-instrumentations-node");
  const { BatchSpanProcessor } = req("@opentelemetry/sdk-trace-base") as typeof import("@opentelemetry/sdk-trace-base");
  const { PrismaInstrumentation } = req("@prisma/instrumentation") as typeof import("@prisma/instrumentation");

  const inner = new OTLPTraceExporter(); // OTEL_EXPORTER_OTLP_ENDPOINT (پیش‌فرض http://localhost:4318)
  /** هر span پیش از خروج از پروسه پاک‌سازی می‌شود (URL/SQL/هدرها/پیام خطا) — حتی اگر کسی instrumentation تازه اضافه کند. */
  const scrubbing = {
    export: (spans: unknown[], cb: (r: { code: number }) => void) => {
      for (const s of spans as (MutableSpan & { attributes: Record<string, unknown> })[]) scrubSpan(s);
      inner.export(spans as never, cb as never);
    },
    shutdown: () => inner.shutdown(),
    forceFlush: () => inner.forceFlush?.() ?? Promise.resolve(),
  };

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "nobatyar-api",
    // A9: نسخه OTel تکشده توسط pnpm.overrides — نیازی به type-cast نیست.
    spanProcessors: [new BatchSpanProcessor(scrubbing as never)],
    instrumentations: [
      getNodeAutoInstrumentations({
        // فقط آنچه مسیر رزرو/پرداخت را می‌سازد؛ fs/dns/net پرنویز و بی‌فایده‌اند
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (r) => /\/(health|metrics|notifications\/stream)(\/|\?|$)/.test(r.url ?? ""),
          headersToSpanAttributes: { client: { requestHeaders: [] }, server: { requestHeaders: [] } },
        },
      }),
      new PrismaInstrumentation(),
    ],
  });
  sdk.start();
  process.on("SIGTERM", () => { void sdk.shutdown(); });
}
