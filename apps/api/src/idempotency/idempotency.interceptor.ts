import {
  applyDecorators, BadRequestException, CallHandler, ConflictException, ExecutionContext, HttpException, Inject, Injectable,
  NestInterceptor, SetMetadata, UnauthorizedException, UseInterceptors,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { catchError, from, lastValueFrom, map, Observable, throwError } from "rxjs";
import type { AuthUser } from "../common/decorators";
import { IDEMPOTENCY_HEADER, parseKey, REPLAY_HEADER } from "./idempotency-policy";
import { IdempotencyConflict, runIdempotent } from "./idempotency-runner";
import type { IdempotencyStore } from "./idempotency-store";
import { IDEMPOTENCY_STORE, IDEMPOTENT_KEY, type IdempotentOptions } from "./idempotency.tokens";

const HTTP_CODE_METADATA = "__httpCode__"; // @HttpCode(...) ی Nest

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opts = this.reflector.get<IdempotentOptions | undefined>(IDEMPOTENT_KEY, ctx.getHandler());
    if (!opts) return next.handle();

    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthUser }>();
    const res = http.getResponse<Response>();

    const parsed = parseKey(req.headers[IDEMPOTENCY_HEADER], opts.required);
    if (!parsed.ok) throw new BadRequestException({ error: parsed.code });
    if (parsed.key === null) return next.handle();
    if (!req.user) throw new UnauthorizedException({ error: "unauthorized" });

    const status = this.reflector.get<number | undefined>(HTTP_CODE_METADATA, ctx.getHandler()) ?? (req.method === "POST" ? 201 : 200);
    const routeTemplate = (req.route as { path?: string } | undefined)?.path ?? req.path;

    return from(
      runIdempotent(
        this.store,
        { userId: req.user.id, method: req.method, routeTemplate, url: req.originalUrl, body: req.body, key: parsed.key, successStatus: status },
        () => lastValueFrom(next.handle()),
      ),
    ).pipe(
      map((r) => {
        if (r.replayed) res.setHeader(REPLAY_HEADER, "true");
        return r.body;
      }),
      catchError((e: unknown) => {
        if (e instanceof IdempotencyConflict) {
          if (e.code === "idempotency_in_progress") {
            res.setHeader("Retry-After", String(e.retryAfterSec ?? 1));
            return throwError(() => new ConflictException({ error: e.code, retryAfterSec: e.retryAfterSec }));
          }
          return throwError(() => new HttpException({ error: e.code }, 422));
        }
        return throwError(() => e);
      }),
    );
  }
}

/** @Idempotent() روی handler های مالی: هدر Idempotency-Key اجباری (پیش‌فرض) و پاسخ تکراری بدون اجرای دوباره. */
export const Idempotent = (opts: IdempotentOptions = { required: true }) =>
  applyDecorators(SetMetadata(IDEMPOTENT_KEY, opts), UseInterceptors(IdempotencyInterceptor));
