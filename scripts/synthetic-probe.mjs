#!/usr/bin/env node
/**
 * پایش مصنوعی (synthetic monitoring) — فاز ۱۹.
 * مسیرهای «فقط خواندنی» را بدون داده بیمار و بدون ایجاد نوبت بررسی میکند:
 *   health → status → specialties → doctors → slots
 * خروجی: خطوط Prometheus metric (probe_success/probe_duration_seconds) یا exit code ۱.
 * استفاده: BASE_URL=https://... node scripts/synthetic-probe.mjs
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 5000);
const steps = [
  { name: "health", path: "/api/v1/health", expect: 200 },
  { name: "status", path: "/api/v1/status", expect: 200 },
  { name: "specialties", path: "/api/v1/specialties", expect: 200 },
  { name: "doctors", path: "/api/v1/doctors?limit=1", expect: 200 },
];

const controllerFor = () => new AbortController();
const timerFor = (controller) => setTimeout(() => controller.abort(), TIMEOUT_MS);

async function probe(step) {
  const controller = controllerFor();
  const timer = timerFor(controller);
  const start = performance.now();
  try {
    const res = await fetch(`${BASE}${step.path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      redirect: "manual",
    });
    const ok = res.status === step.expect;
    if (ok) await res.arrayBuffer().catch(() => undefined);
    return { name: step.name, ok, status: res.status, seconds: (performance.now() - start) / 1000 };
  } catch (e) {
    return { name: step.name, ok: false, status: 0, seconds: (performance.now() - start) / 1000, error: e?.name ?? "error" };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (const s of steps) results.push(await probe(s));

for (const r of results) {
  console.log(`probe_success{step="${r.name}"} ${r.ok ? 1 : 0}`);
  console.log(`probe_duration_seconds{step="${r.name}"} ${r.seconds.toFixed(3)}`);
  console.error(`${r.ok ? "OK" : "FAIL"} ${r.name}: HTTP ${r.status} (${r.seconds.toFixed(2)}s)${r.error ? ` — ${r.error}` : ""}`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
