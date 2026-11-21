import { describe, expect, it } from "vitest";
import { applyIncidents, canUpdateIncident, containsPersonalData, notificationsStatus, paymentStatus, probeStatus, rollup, worst } from "./status-policy";

const win = (o: Partial<Parameters<typeof paymentStatus>[0]> = {}) => ({ paid: 20, failed: 2, expired: 1, mismatch: 0, paidUnsynced: 0, ...o });

describe("rollup / probes", () => {
  it("بدترین وضعیت برنده است", () => {
    expect(worst("degraded", "operational")).toBe("degraded");
    expect(rollup([{ status: "operational" }, { status: "outage" }, { status: "degraded" }])).toBe("outage");
    expect(rollup([])).toBe("operational");
  });
  it("probe: خطا ⇒ outage، کند ⇒ degraded", () => {
    expect(probeStatus({ ok: false, ms: 10 })).toBe("outage");
    expect(probeStatus({ ok: true, ms: 1501 })).toBe("degraded");
    expect(probeStatus({ ok: true, ms: 40 })).toBe("operational");
  });
});

describe("paymentStatus", () => {
  it("عادی", () => expect(paymentStatus(win())).toBe("operational"));
  it("فقط ناموفق (≥۱۰) و صفر موفق ⇒ outage (همان PaymentsAllFailing)", () => expect(paymentStatus(win({ paid: 0, failed: 8, expired: 3 }))).toBe("outage"));
  it("داده‌ی کم ⇒ operational (هشدار کاذب نمی‌دهیم)", () => expect(paymentStatus({ paid: 0, failed: 3, expired: 0, mismatch: 1, paidUnsynced: 0 })).toBe("operational"));
  it("هر paid-unsynced یا mismatch ≥ ۱۰٪ ⇒ degraded", () => {
    expect(paymentStatus(win({ paidUnsynced: 1 }))).toBe("degraded");
    expect(paymentStatus(win({ paid: 15, failed: 0, expired: 0, mismatch: 2 }))).toBe("degraded");
  });
});

describe("notificationsStatus", () => {
  it("backlog و DEAD", () => {
    expect(notificationsStatus({ oldestPendingSec: 30, dead: 0 })).toBe("operational");
    expect(notificationsStatus({ oldestPendingSec: 601, dead: 0 })).toBe("degraded");
    expect(notificationsStatus({ oldestPendingSec: 5, dead: 2 })).toBe("degraded");
    expect(notificationsStatus({ oldestPendingSec: 3601, dead: 0 })).toBe("outage");
  });
});

describe("حوادث", () => {
  it("حادثه فقط می‌تواند وضعیت را بدتر کند", () => {
    expect(applyIncidents("operational", [{ impact: "MINOR" }])).toBe("degraded");
    expect(applyIncidents("degraded", [{ impact: "CRITICAL" }])).toBe("outage");
    expect(applyIncidents("outage", [{ impact: "NONE" }])).toBe("outage");
    expect(applyIncidents("operational", [])).toBe("operational");
  });
  it("حادثه‌ی حل‌شده قابل ویرایش نیست؛ به‌روزرسانی خالی بدون تغییر وضعیت رد می‌شود", () => {
    expect(canUpdateIncident("RESOLVED", "MONITORING", true)).toEqual({ ok: false, code: "incident_resolved" });
    expect(canUpdateIncident("INVESTIGATING", "INVESTIGATING", false)).toEqual({ ok: false, code: "same_status_empty_update" });
    expect(canUpdateIncident("INVESTIGATING", "IDENTIFIED", true)).toEqual({ ok: true });
    expect(canUpdateIncident("MONITORING", "RESOLVED", true)).toEqual({ ok: true });
  });
  it("متن عمومی: داده‌ی شخصی رد می‌شود", () => {
    for (const bad of ["تماس با 09121234567", "۰۹۱۲۱۲۳۴۵۶۷", "mail me a@b.com", "کد 12345678", "نوبت 6f1c2a52-2f0a-4c6e-9a3e-0d3f6b9b1a11", "سرور 10.0.0.1"]) expect(containsPersonalData(bad)).toBe(true);
    for (const ok of ["پرداخت با تأخیر مواجه است", "درگاه بانکی از ساعت ۱۰ در دسترس نیست", "در حال بررسی علت هستیم؛ ۲ ساعت"]) expect(containsPersonalData(ok)).toBe(false);
  });
});
