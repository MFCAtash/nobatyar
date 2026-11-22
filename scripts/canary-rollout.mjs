#!/usr/bin/env node
/**
 * M11 — echte Canary-Rollout Gate (Argo Rollouts + Prometheus).
 *
 *_usage: node scripts/canary-rollout.mjs [--apply]
 *  - Ohne --apply: DRY-RUN — Entscheidung und Kommandos werden nur gedruckt.
 *  - Mit --apply: KUBE_CONFIG, CANARY_ROLLOUT, CANARY_NAMESPACE und
 *    PROMETHEUS_URL sind Pflicht. Es werden keine Shell-Kommandos verwendet
 *    (execFileSync mit Argument-Array ⇒ keine Injection).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const apply = process.argv.includes("--apply");
const env = process.env;
const namespace = env.CANARY_NAMESPACE ?? "default";
const rollout = env.CANARY_ROLLOUT ?? "nobatyar-api";
const kubeconfig = env.KUBE_CONFIG ?? "";
const prometheus = env.PROMETHEUS_URL ?? "";
const query = env.BURN_QUERY ?? "max(slo_burn_rate_30d)";
const maxBurn = Number(env.MAX_BURN_RATE ?? "1");
const currentWeight = Number(env.CANARY_CURRENT_WEIGHT ?? "5");
const weights = [1, 5, 10, 25, 50, 100];
const significant = env.CANARY_INSIGNIFICANT !== "true";
const previousHealthy = env.CANARY_PREVIOUS_UNHEALTHY !== "true";

function die(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

if (!Number.isFinite(maxBurn) || maxBurn <= 0) die("MAX_BURN_RATE must be a positive number");
if (!weights.includes(currentWeight)) die("CANARY_CURRENT_WEIGHT must be one of 1,5,10,25,50,100");

let burnRate = Number(env.SIMULATED_BURN ?? Number.NaN);
if (!Number.isFinite(burnRate)) {
  if (!prometheus) {
    if (apply) die("PROMETHEUS_URL is required with --apply (or set SIMULATED_BURN for a dry-run)");
    console.log("[dry-run] no Prometheus URL and no simulated burn ⇒ assuming 0 (healthy)");
    burnRate = 0;
  } else {
    const url = new URL(prometheus.replace(/\/$/, "") + "/api/v1/query");
    url.searchParams.set("query", query);
    const res = await fetch(url, { headers: env.PROMETHEUS_TOKEN ? { Authorization: `Bearer ${env.PROMETHEUS_TOKEN}` } : {} });
    if (!res.ok) die(`Prometheus HTTP ${res.status}`);
    const json = await res.json();
    const value = Number(json?.data?.result?.[0]?.value?.[1] ?? 0);
    if (!Number.isFinite(value)) die("invalid Prometheus burn-rate value");
    burnRate = value;
  }
}

let decision = "promote";
if (burnRate > maxBurn * 5) decision = "rollback";
else if (!significant || !previousHealthy || burnRate > maxBurn) decision = "hold";

const nextWeight = weights.find((w) => w > currentWeight) ?? null;
let command = null;
if (decision === "promote" && nextWeight !== null) {
  command = ["kubectl", "argo", "rollouts", "set", "weight", rollout, String(nextWeight), "-n", namespace];
}
if (decision === "rollback") {
  command = ["kubectl", "argo", "rollouts", "abort", rollout, "-n", namespace];
}
if (command && kubeconfig) command.push("--kubeconfig", kubeconfig);

const summary = {
  decision,
  burnRate,
  maxBurnRate: maxBurn,
  currentWeight,
  nextWeight: decision === "promote" ? nextWeight : null,
  command,
  apply,
};
console.log(JSON.stringify(summary, null, 2));

if (apply && command) {
  if (!kubeconfig || !existsSync(kubeconfig)) die("KUBE_CONFIG must point to an existing kubeconfig with --apply");
  if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(rollout)) die("CANARY_ROLLOUT must be a DNS-safe name");
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(namespace)) die("CANARY_NAMESPACE must be a DNS-safe name");
  const [bin, ...args] = command;
  try {
    execFileSync(bin, args, { stdio: "inherit" });
    console.log(`canary ${decision} applied successfully`);
  } catch (error) {
    die(`rollout command failed: ${error.message}`);
  }
} else if (apply) {
  console.log("canary hold: no rollout command to apply");
}
