import { Global, Module } from "@nestjs/common";
import { NotificationModule } from "../notifications/notification.module";
import { PrismaModule } from "../prisma/prisma.module";
import { OutboxRelayService } from "./outbox-relay.service";
import { OUTBOX_WRITER, OutboxService } from "./outbox.service";

@Global()
@Module({
  imports: [PrismaModule, NotificationModule],
  providers: [{ provide: OUTBOX_WRITER, useClass: OutboxService }, OutboxRelayService],
  exports: [OUTBOX_WRITER, OutboxRelayService],
})
export class OutboxModule {}
