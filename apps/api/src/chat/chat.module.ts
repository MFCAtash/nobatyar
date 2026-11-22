import { Module } from "@nestjs/common";
import { CryptoModule }   from "../crypto/crypto.module";
import { PrismaModule }   from "../prisma/prisma.module";
import { StorageModule }  from "../storage/storage.module";
import { AuthModule }     from "../auth/auth.module";
import { ChatController } from "./chat.controller";
import { ChatGateway }    from "./chat.gateway";
import { ChatService }    from "./chat.service";
import { ChatSocketAuth } from "./chat-socket-auth";
import { ChatAssistController } from "./assist.controller";
import { ChatAssistService } from "./assist.service";

@Module({
  imports:     [PrismaModule, CryptoModule, StorageModule, AuthModule],
  controllers: [ChatController, ChatAssistController],
  providers:   [ChatGateway, ChatService, ChatSocketAuth, ChatAssistService],
  exports:     [ChatService],
})
export class ChatModule {}
