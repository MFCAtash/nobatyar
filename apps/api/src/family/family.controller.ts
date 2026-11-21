import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, UseGuards,
} from "@nestjs/common";
import { JwtGuard } from "../auth/guards";
import { CurrentUser } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { FamilyService, FamilyMemberSchema } from "./family.service";
import type { FamilyMemberInput } from "./family.service";
import type { AuthUser } from "../common/decorators";

@Controller("me/family")
@UseGuards(JwtGuard)
export class FamilyController {
  constructor(private readonly svc: FamilyService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  @Post()
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(FamilyMemberSchema)) dto: FamilyMemberInput,
  ) {
    return this.svc.add(user, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(FamilyMemberSchema.partial())) dto: Partial<FamilyMemberInput>,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.svc.remove(user, id);
  }
}
