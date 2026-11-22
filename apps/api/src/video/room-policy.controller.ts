import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import type { AuthUser } from "../common/decorators";
import { CurrentUser } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { RoomPolicyService } from "./room-policy.service";
import { roomPolicySchema, recordingConsentSchema, type RoomPolicyInput } from "./room-policy.schemas";

@Controller("appointments/:id/video")
export class RoomPolicyController {
  constructor(private readonly svc: RoomPolicyService) {}

  @Get("policy")
  get(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.get(user, id);
  }

  @Put("policy")
  put(
    @CurrentUser() user: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(roomPolicySchema)) body: RoomPolicyInput,
  ) {
    return this.svc.put(user, id, body);
  }

  @Post("recording-consent")
  consent(
    @CurrentUser() user: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(recordingConsentSchema)) _body: { accept: true },
  ) {
    return this.svc.acceptRecording(user, id);
  }

  @Get("gate")
  gate(
    @CurrentUser() user: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("admitted") admitted?: string,
  ) {
    return this.svc.gate(user, id, admitted === "1");
  }
}
