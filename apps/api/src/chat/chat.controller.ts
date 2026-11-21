import {
  Controller, Get, Param, ParseUUIDPipe,
  Query, UseGuards,
} from "@nestjs/common";
import { JwtGuard } from "../auth/guards";
import { CurrentUser } from "../common/decorators";
import type { AuthUser } from "../common/decorators";
import { ChatService } from "./chat.service";

@Controller("conversations")
@UseGuards(JwtGuard)
export class ChatController {
  constructor(private readonly svc: ChatService) {}

  /** لیست مکالمه‌ها با آخرین پیام */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.listConversations(user);
  }

  /** پیام‌های یک مکالمه — cursor pagination */
  @Get(":id/messages")
  messages(
    @CurrentUser() user: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.svc.getMessages(user, id, cursor);
  }

  /** لینک موقت دانلود پیوست */
  @Get("messages/:msgId/attachment")
  attachment(
    @CurrentUser() user: AuthUser,
    @Param("msgId") msgId: string,
  ) {
    return this.svc.getAttachmentUrl(user, msgId);
  }
}
