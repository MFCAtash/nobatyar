import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { z } from "zod";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { DataRequestService } from "../records/data-request.service";

export const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
}).strict();

/** A6: صف انطباق — دو ادمین مستقل باید تأیید کنند تاjob اجرا شود. */
@Roles("ADMIN")
@Controller("admin/data-requests")
export class DataRequestController {
  constructor(@Inject(DataRequestService) private readonly svc: DataRequestService) {}

  @Get()
  list() {
    return this.svc.listAll();
  }

  @Post(":id/review")
  @HttpCode(200)
  review(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(reviewSchema)) b: z.infer<typeof reviewSchema>) {
    return this.svc.review(id, u, b.decision, b.note);
  }
}
