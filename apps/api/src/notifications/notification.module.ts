import { Logger, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PUBSUB_PUBLISHER, PUBSUB_SUBSCRIBER } from "../redis/pubsub";
import type { PubSubPublisher, PubSubSubscriber } from "../redis/pubsub";
import { NotificationController } from "./notification.controller";
import { NotificationHub } from "./notification-hub";
import { NotificationStreamService } from "./notification-stream.service";
import { NotificationService } from "./notification.service";
import { loadSseConfig, SSE_CONFIG } from "./sse-config";
import { NotificationAdminController, NotificationPreferencesController } from "./preferences.controller";
import { NotificationPreferencesService } from "./preferences.service";

/** RedisModule سراسری است (PUBSUB_PUBLISHER / PUBSUB_SUBSCRIBER را export می‌کند). */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationController, NotificationPreferencesController, NotificationAdminController],
  providers: [
    // تنظیمات نامعتبر ⇒ بوت متوقف می‌شود (مثل loadAuthConfig)
    { provide: SSE_CONFIG, useFactory: () => loadSseConfig() },
    {
      provide: NotificationHub,
      inject: [PUBSUB_PUBLISHER, PUBSUB_SUBSCRIBER],
      useFactory: (pub: PubSubPublisher, sub: PubSubSubscriber) => new NotificationHub(pub, sub, new Logger("NotificationHub")),
    },
    NotificationService,
    NotificationStreamService,
    NotificationPreferencesService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
