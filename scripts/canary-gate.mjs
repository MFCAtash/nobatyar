#!/usr/bin/env node
/**
 * دروازهٔ استقرار Canary — بررسی بودجهٔ خطا از Prometheus.
 * اجرا: node scripts/canary-gate.mjs [--simulate]
 * متغیرها: PROMETHEUS_URL, MAX_BURN_RATE (پیشفرض 1), BURN_QUERY
 * حالت --simulate یک سرور Prometheus ساختگی را محلی بالا میآورد تا جریان بهصورت اتوماتیک تست شود.
 */
import http from "node:http";

const simulate = process.argv.includes("--simulate");
const maxBurn = Number(process.env.MAX_BURN_RATE ?? "1");
const query = process.env.BURN_QUERY ?? "max(slo_burn_rate_30d)";
const burnValue = Number(process.env.SIMULATED_BURN ?? "0.2");

let server;
let baseUrl = process.env.PROMETHEUS_URL;

if (simulate || !baseUrl) {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/v1/query") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "success", data: { resultType: "vector", result: [{ value: [Date.now() / 1000, String(burnValue)] }] } }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`[simulate] mock Prometheus at ${baseUrl} (burn=${burnValue})`);
}

try {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/api/v1/query`);
  url.searchParams.set("query", query);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Prometheus HTTP ${response.status}`);
  const json = await response.json();
  const row = json?.data?.result?.[0];
  const value = row ? Number(row.value?.[1] ?? 0) : 0;
  if (!Number.isFinite(value)) throw new Error("invalid burn-rate response");
  if (value > maxBurn) {
    console.error(`::error::error budget burn rate ${value} exceeds ${maxBurn} — aborting canary`);
    process.exitCode = 1;
  } else {
    console.log(`canary gate OK: burn rate ${value} <= ${maxBurn}`);
  }
} catch (error) {
  console.error(`::error::canary gate failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  server?.close();
}
