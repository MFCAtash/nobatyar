import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { z } from "zod";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { WaitlistService } from "./waitlist.service";

export const joinSchema = z.object({
  doctorId: z.string().uuid(),
  kind: z.enum(["IN_PERSON", "VIDEO", "CHAT"]),
  desiredFrom: z.string().datetime({ offset: true }),
  desiredTo: z.string().datetime({ offset: true }),
}).strict();

@Controller("waitlist")
export class WaitlistController {
  constructor(@Inject(WaitlistService) private readonly svc: WaitlistService) {}

  @Roles("PATIENT")
  @Post()
  join(@CurrentUser() u: AuthUser, @Body(new ZodPipe(joinSchema)) b: z.infer<typeof joinSchema>) {
    return this.svc.join(u, b);
  }

  @Get()
  mine(@CurrentUser() u: AuthUser) {
    return this.svc.mine(u);
  }

  @Delete(":id")
  @HttpCode(200)
  leave(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.leave(u, id);
  }
}
