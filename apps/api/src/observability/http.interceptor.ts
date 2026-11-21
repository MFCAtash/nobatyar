import { randomUUID } from "node:crypto";
import { CallHandler, ExecutionContext, Inject, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { accessLogLine, recordHttp, requestId, routeLabel } from "./metrics";
import { loadOpsConfig, OPS_CONFIG } from "./ops.config";
import type { OpsConfig } from "./ops.config";

/** متریک زمان/وضعیت هر درخواست HTTP + X-Request-Id + (اختیاری) لاگ دسترسی JSON. فقط الگوی route؛ هیچ داده‌ی کاربر. */
@Injectable()
export class HttpObservabilityInterceptor implements NestInterceptor {
  private readonly log = new Logger("http");
  constructor(@Inject(OPS_CONFIG) private readonly cfg: OpsConfig = loadOpsConfig()) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== "http") return next.handle();
    const http = ctx.switchToHttp();
    const req = http.getRequest<{ method: string; route?: unknown; headers: Record<string, unknown> }>();
    const res = http.getResponse<{ statusCode: number; setHeader(k: string, v: string): void }>();
    const rid = requestId(req.headers["x-request-id"], randomUUID);
    res.setHeader("X-Request-Id", rid);
    const t0 = process.hrtime.bigint();

    const done = (status: number) => {
      const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
      recordHttp(req.method, req.route, status, seconds);
      if (this.cfg.accessLog) this.log.log(accessLogLine({ method: req.method, route: routeLabel(req.route), status, ms: Math.round(seconds * 1000), rid }));
    };
    return next.handle().pipe(
      tap({
        next: () => undefined,
        complete: () => done(res.statusCode),
        error: (e: unknown) => done(typeof (e as { getStatus?: () => number })?.getStatus === "function" ? (e as { getStatus(): number }).getStatus() : 500),
      }),
    );
  }
}
