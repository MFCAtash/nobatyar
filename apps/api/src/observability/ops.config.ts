export const OPS_CONFIG = Symbol("OPS_CONFIG");

export interface OpsConfig {
  /** توکن Bearer برای /metrics؛ نبودنش ⇒ endpoint خاموش (۴۰۴). */
  metricsToken?: string;
  accessLog: boolean;
}

/** METRICS_TOKEN اگر هست باید ≥۲۴ نویسه باشد؛ ACCESS_LOG فقط "true"/"false". */
export function loadOpsConfig(env: NodeJS.ProcessEnv = process.env): OpsConfig {
  const t = env.METRICS_TOKEN?.trim() || undefined;
  if (t && !/^[A-Za-z0-9._~+/=-]{24,200}$/.test(t)) throw new Error("METRICS_TOKEN must be 24..200 chars of [A-Za-z0-9._~+/=-]");
  const al = env.ACCESS_LOG;
  if (al !== undefined && al !== "" && al !== "true" && al !== "false") throw new Error('ACCESS_LOG must be exactly "true" or "false"');
  return { metricsToken: t, accessLog: al === "true" };
}
