/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { Counter, Histogram, accessLogLine, recordHttp, renderMetrics, requestId, routeLabel, statusClass, httpRequests, httpDuration } from "./metrics";
import { loadOpsConfig } from "./ops.config";

describe("metrics", () => {
  it("Counter/Histogram فرمت Prometheus درست می‌دهند", () => {
    const c = new Counter("x_total", "h");
    c.inc({ a: "1" }); c.inc({ a: "1" }, 2); c.inc();
    const h = new Histogram("d_seconds", "h", [0.1, 1]);
    h.observe({ r: "/x" }, 0.05); h.observe({ r: "/x" }, 0.5); h.observe({ r: "/x" }, 5);
    const out = renderMetrics([c, h], [{ name: "g", help: "h", samples: [{ labels: { s: "A" }, value: 3 }] }]);
    expect(out).toContain('x_total{a="1"} 3');
    expect(out).toContain("x_total 1");
    expect(out).toContain('d_seconds_bucket{r="/x",le="0.1"} 1');
    expect(out).toContain('d_seconds_bucket{r="/x",le="1"} 2');
    expect(out).toContain('d_seconds_bucket{r="/x",le="+Inf"} 3');
    expect(out).toContain('d_seconds_count{r="/x"} 3');
    expect(out).toContain('g{s="A"} 3');
  });

  it("مقدار برچسب escape می‌شود (تزریق خط/نقل‌قول ممکن نیست)", () => {
    const c = new Counter("y_total", "h");
    c.inc({ a: 'x"\ny' });
    const out = c.render().join("\n");
    expect(out).toContain('a="x\\"\\ny"');
    expect(out.split("\n").length).toBe(3);
  });

  it("برچسب مسیر فقط الگوی route است؛ مسیر ناشناخته ⇒ unmatched؛ کاردینالیتی ثابت", () => {
    expect(routeLabel({ path: "/api/v1/appointments/:id" })).toBe("/api/v1/appointments/:id");
    expect(routeLabel(undefined)).toBe("unmatched");
    expect(routeLabel({ path: "x".repeat(500) })).toBe("unmatched");
    expect(statusClass(404)).toBe("4xx");
    recordHttp("GET", { path: "/api/v1/doctors/:id" }, 200, 0.12);
    recordHttp("GET", undefined, 404, 0.001);
    const out = renderMetrics([httpRequests, httpDuration]);
    expect(out).toContain('route="/api/v1/doctors/:id"');
    expect(out).toContain('route="unmatched"');
    expect(/09\d{9}|[0-9a-f]{8}-[0-9a-f]{4}/.test(out)).toBe(false);
  });

  it("requestId: ورودی امن پذیرفته، مشکوک جایگزین (log injection)", () => {
    expect(requestId("abc-12345678", () => "GEN")).toBe("abc-12345678");
    expect(requestId("bad id\nX", () => "GEN")).toBe("GEN");
    expect(requestId(undefined, () => "GEN")).toBe("GEN");
    expect(requestId("a".repeat(100), () => "GEN")).toBe("GEN");
  });

  it("لاگ دسترسی: JSON تک‌خطی بدون query/IP/بدنه", () => {
    const line = accessLogLine({ method: "POST", route: "/api/v1/appointments", status: 503, ms: 12, rid: "rid-12345678" });
    const j = JSON.parse(line);
    expect(j).toMatchObject({ level: "error", msg: "http", method: "POST", route: "/api/v1/appointments", status: 503, ms: 12 });
    expect(Object.keys(j).sort()).toEqual(["level", "method", "ms", "msg", "rid", "route", "status", "t"]);
  });
});

describe("loadOpsConfig", () => {
  it("بدون توکن ⇒ متریک خاموش؛ توکن کوتاه/نامعتبر ⇒ خطا؛ ACCESS_LOG سخت‌گیر", () => {
    expect(loadOpsConfig({} as any)).toEqual({ metricsToken: undefined, accessLog: false });
    expect(() => loadOpsConfig({ METRICS_TOKEN: "short" } as any)).toThrow(/METRICS_TOKEN/);
    expect(loadOpsConfig({ METRICS_TOKEN: "a".repeat(32), ACCESS_LOG: "true" } as any)).toMatchObject({ accessLog: true });
    expect(() => loadOpsConfig({ ACCESS_LOG: "yes" } as any)).toThrow(/ACCESS_LOG/);
  });
});
