import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { Idempotent } from "../idempotency/idempotency.interceptor";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { PaymentService } from "./payment.service";
import { InitiateSchema, VerifySchema } from "./payment.schemas";
import type { AuthUser } from "../common/decorators";
import type { InitiateInput, VerifyInput } from "./payment.schemas";

/** احراز هویت با guard های سراسری (JwtAuthGuard/RolesGuard)؛ فقط بیمار پرداخت می‌کند. */
@Controller("payments")
@Roles("PATIENT")
export class PaymentController {
  constructor(private readonly svc: PaymentService) {}

  /** شروع پرداخت — لینک درگاه (با failover خودکار بین درگاه‌ها) */
  @Post("initiate")
  @Idempotent()
  initiate(@CurrentUser() user: AuthUser, @Body(new ZodPipe(InitiateSchema)) dto: InitiateInput) {
    return this.svc.initiate(user, dto);
  }

  /** بازگشت از درگاه: «تأیید» همیشه سمت سرور و با خود درگاه انجام می‌شود */
  // verify «ذاتاً» ایدمپوتنت است (CAS در تسویه) و کلاینت بارها poll می‌کند (PENDING نباید replay شود) ⇒ هدر اختیاری
  @Post("verify")
  @Idempotent({ required: false })
  verify(@CurrentUser() user: AuthUser, @Body(new ZodPipe(VerifySchema)) dto: VerifyInput) {
    return this.svc.verify(user, dto);
  }

  /** وضعیت پرداخت یک نوبت */
  @Get(":appointmentId")
  status(@CurrentUser() user: AuthUser, @Param("appointmentId", new ParseUUIDPipe()) appointmentId: string) {
    return this.svc.getStatus(user, appointmentId);
  }
}
