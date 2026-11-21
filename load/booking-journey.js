import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:3000/api/v1";
const errorRate = new Rate("booking_errors");
const latency = new Trend("booking_latency_ms", true);

export const options = {
  stages: [
    { duration: "1m", target: 10 },
    { duration: "3m", target: 50 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    booking_errors: ["rate<0.01"],
    booking_latency_ms: ["p(95)<300"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const startedAt = Date.now();
  const search = http.get(`${BASE}/doctors?q=${encodeURIComponent("قلب")}&limit=5`, { tags: { endpoint: "search" } });
  latency.add(Date.now() - startedAt);
  const okSearch = check(search, { "search 200": (r) => r.status === 200 });
  errorRate.add(!okSearch);

  const health = http.get(`${BASE.replace("/api/v1", "")}/api/v1/health`);
  check(health, { "health 200": (r) => r.status === 200 });
  sleep(1);
}
