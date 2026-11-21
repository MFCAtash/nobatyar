// k6 — «۵۰ کاربر هم‌زمان، یک نوبت». نتیجه‌ی درست: «دقیقاً یک» ۲۰۱ و «دقیقاً ۴۹» خطای ۴۰۹ (slot_taken)، و هیچ ۵xx.
// این تست ادعای ضد double-booking (قید EXCLUDE ی Postgres) را زیر هجوم واقعی ثابت می‌کند.
//
// اجرا (API با E2E_TEST_HOOKS=true، SMS_PROVIDER=memory و سقف OTP بالا):
//   k6 run -e BASE_URL=http://localhost:3000/api/v1 load/double-booking.js
//   docker run --rm -i --network host -e BASE_URL=... -v "$PWD/load:/load" grafana/k6 run /load/double-booking.js
import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter } from "k6/metrics";

const BASE = (__ENV.BASE_URL || "http://localhost:3000/api/v1").replace(/\/$/, "");
const N = Number(__ENV.USERS || 50);
const JSON_H = { headers: { "Content-Type": "application/json" } };

const success = new Counter("booking_success");
const conflict = new Counter("booking_conflict_409");
const unexpected = new Counter("booking_unexpected");
const doubleBooked = new Counter("double_booking_detected");

export const options = {
  scenarios: {
    race: { executor: "per-vu-iterations", vus: N, iterations: 1, maxDuration: "2m" },
  },
  thresholds: {
    booking_success: ["count==1"],
    booking_conflict_409: [`count==${N - 1}`],
    booking_unexpected: ["count==0"],
    double_booking_detected: ["count==0"],
  },
  setupTimeout: "5m",
};

const post = (path, body, token) =>
  http.post(`${BASE}${path}`, JSON.stringify(body), token ? { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } } : JSON_H);

function randomPhone() {
  return "09" + String(Math.floor(100000000 + Math.random() * 899999999));
}

function login(phone) {
  post("/auth/otp/request", { phone });
  const otp = http.get(`${BASE}/__e2e/otp?phone=${phone}`);
  if (otp.status !== 200) fail(`otp hook failed (${otp.status}) — E2E_TEST_HOOKS/SMS_PROVIDER=memory فعال است؟`);
  const v = post("/auth/otp/verify", { phone, code: otp.json("code") });
  if (v.status !== 200) fail(`verify failed ${v.status}: ${v.body}`);
  return v.json("accessToken");
}

export function setup() {
  const d = post("/__e2e/doctor", { fullName: `دکتر بار ${Date.now()}`, feeRial: 1000000, autoConfirm: false });
  if (d.status !== 201 && d.status !== 200) fail(`seed doctor failed ${d.status}`);
  const doctor = d.json();
  const doctorToken = login(doctor.phone);

  // اسلات: دو روز بعد (تاریخ UTC؛ پزشک همه‌ی روزهای هفته ۰۶–۲۳ تهران کار می‌کند)
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const slots = http.get(`${BASE}/doctors/${doctor.doctorId}/slots?from=${day}&to=${day}`).json("slots");
  if (!slots || slots.length === 0) fail("no slots");
  const slot = slots[Math.floor(slots.length / 2)].startsAt;

  const tokens = [];
  for (let i = 0; i < N; i++) {
    const t = login(randomPhone());
    for (const type of ["TERMS", "PRIVACY_POLICY", "HEALTH_DATA_PROCESSING"]) post("/me/consents", { type, version: "1.0" }, t);
    tokens.push(t);
  }
  // سد هم‌زمانی: همه‌ی VU ها دقیقاً در یک لحظه شروع می‌کنند
  return { doctorId: doctor.doctorId, doctorToken, slot, tokens, startAt: Date.now() + 3000 };
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  while (Date.now() < data.startAt) sleep(0.002);

  const r = post("/appointments", { doctorId: data.doctorId, startsAt: data.slot, kind: "VIDEO", reason: "بار" }, token);

  if (r.status === 201) {
    success.add(1);
    check(r, { "برنده: وضعیت PENDING_PAYMENT": (x) => x.json("status") === "PENDING_PAYMENT" });
  } else if (r.status === 409 && r.json("error") === "slot_taken") {
    conflict.add(1);
  } else {
    unexpected.add(1);
    console.error(`unexpected ${r.status}: ${String(r.body).slice(0, 200)}`);
  }
}

// ادعا را از «سمت دیگر» هم می‌سنجیم: در تقویم پزشک برای آن اسلات دقیقاً یک نوبت باید باشد
export function teardown(data) {
  const from = new Date(new Date(data.slot).getTime() - 60000).toISOString();
  const to = new Date(new Date(data.slot).getTime() + 3600000).toISOString();
  const r = http.get(`${BASE}/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=50`, {
    headers: { Authorization: `Bearer ${data.doctorToken}` },
  });
  const items = (r.status === 200 ? r.json("items") : []) || [];
  const atSlot = items.filter((a) => new Date(a.startsAt).getTime() === new Date(data.slot).getTime());
  if (atSlot.length !== 1) {
    doubleBooked.add(1);
    console.error(`DOUBLE-BOOKING? appointments at slot: ${atSlot.length} (http ${r.status})`);
  }
}
