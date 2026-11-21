// k6 — دود (smoke) با آستانه‌های SLO: مسیرهای خواندنیِ عمومی زیر بار سبک باید p95 < 500ms و خطا < 1٪ بدهند.
// اجرا: k6 run -e BASE_URL=http://localhost:3000/api/v1 load/smoke-slo.js   (برای بتا/پیش از انتشار؛ در CI اختیاری)
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = (__ENV.BASE_URL || "http://localhost:3000/api/v1").replace(/\/$/, "");

export const options = {
  scenarios: { smoke: { executor: "ramping-vus", startVUs: 1, stages: [{ duration: "20s", target: 20 }, { duration: "40s", target: 20 }, { duration: "10s", target: 0 }] } },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    "http_req_duration{name:doctors}": ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const h = http.get(`${BASE}/health`, { tags: { name: "health" } });
  const s = http.get(`${BASE}/specialties`, { tags: { name: "specialties" } });
  const d = http.get(`${BASE}/doctors?limit=10`, { tags: { name: "doctors" } });
  check(h, { "health 200": (r) => r.status === 200 });
  check(s, { "specialties 200": (r) => r.status === 200 });
  check(d, { "doctors 200": (r) => r.status === 200 });
  sleep(1);
}
