import { Body, Controller, Get, HttpCode, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { AuthUser, CurrentUser } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { MfaService } from "./mfa.service";

export const codeSchema = z.object({ code: z.string().trim().regex(/^[0-9A-Za-z-]{4,32}$/) }).strict();
type Code = z.infer<typeof codeSchema>;

/** فاز ۱۹: ثبت/فعالسازی/غیرفعالسازی TOTP و تأیید step-up. راز فقط در پاسخ enroll برگردانده میشود. */
@Controller()
export class MfaController {
  constructor(@Inject(MfaService) private readonly svc: MfaService) {}

  @Get("me/mfa")
  status(@CurrentUser() u: AuthUser) {
    return this.svc.status(u.id);
  }

  @Post("me/mfa/enroll")
  @HttpCode(200)
  enroll(@CurrentUser() u: AuthUser) {
    return this.svc.enroll(u);
  }

  @Post("me/mfa/enable")
  @HttpCode(200)
  enable(@CurrentUser() u: AuthUser, @Body(new ZodPipe(codeSchema)) b: Code) {
    return this.svc.enable(u, b.code, u.sid);
  }

  /** A2: چرخش راز حساب فعال، فقط با کد فعلی. */
  @Post("me/mfa/rotate")
  @HttpCode(200)
  rotate(@CurrentUser() u: AuthUser, @Body(new ZodPipe(codeSchema)) b: Code) {
    return this.svc.rotate(u, b.code);
  }

  @Post("auth/mfa/verify")
  @HttpCode(200)
  verify(@CurrentUser() u: AuthUser, @Body(new ZodPipe(codeSchema)) b: Code) {
    return this.svc.verify(u, b.code, u.sid);
  }

  @Post("me/mfa/disable")
  @HttpCode(200)
  disable(@CurrentUser() u: AuthUser, @Body(new ZodPipe(codeSchema)) b: Code) {
    return this.svc.disable(u, b.code);
  }
}
