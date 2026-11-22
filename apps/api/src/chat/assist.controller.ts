import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import type { AuthUser } from "../common/decorators";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { ChatAssistService } from "./assist.service";
import { quickReplySchema, summarizeSchema, type QuickReplyInput, type SummarizeInput } from "./assist.schemas";

@Controller()
export class ChatAssistController {
  constructor(private readonly svc: ChatAssistService) {}

  @Roles("DOCTOR")
  @Get("me/quick-replies")
  listQuickReplies(@CurrentUser() user: AuthUser) {
    return this.svc.listQuickReplies(user);
  }

  @Roles("DOCTOR")
  @Post("me/quick-replies")
  addQuickReply(@CurrentUser() user: AuthUser, @Body(new ZodPipe(quickReplySchema)) body: QuickReplyInput) {
    return this.svc.addQuickReply(user, body.text);
  }

  @Roles("DOCTOR")
  @Delete("me/quick-replies/:id")
  deleteQuickReply(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.deleteQuickReply(user, id);
  }

  @Post("conversations/:id/summarize")
  summarize(
    @CurrentUser() user: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(summarizeSchema)) body: SummarizeInput,
  ) {
    return this.svc.summarize(user, id, body.consentId);
  }

  @Get("conversations/:id/summary")
  getSummary(@CurrentUser() user: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.getSummary(user, id);
  }
}
