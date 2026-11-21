import { Global, Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IdempotencyPurger } from "./idempotency-purger";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import { IDEMPOTENCY_STORE } from "./idempotency.tokens";
import { PrismaIdempotencyStore } from "./prisma-idempotency-store";

@Global()
@Module({
  providers: [
    { provide: IDEMPOTENCY_STORE, inject: [PrismaService], useFactory: (p: PrismaService) => new PrismaIdempotencyStore(p) },
    IdempotencyInterceptor, IdempotencyPurger,
  ],
  exports: [IDEMPOTENCY_STORE, IdempotencyInterceptor, IdempotencyPurger],
})
export class IdempotencyModule {}
