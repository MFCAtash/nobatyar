import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { loadPushConfig, PUSH_CONFIG } from "./push.config";
import type { PushConfig } from "./push.config";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";
import { PUSH_SENDER, WebPushSender } from "./push.sender";

@Module({
  imports: [PrismaModule],
  controllers: [PushController],
  providers: [
    { provide: PUSH_CONFIG, useFactory: () => loadPushConfig() }, // پیکربندی نیمه‌کاره ⇒ اپ بالا نمی‌آید
    { provide: PUSH_SENDER, inject: [PUSH_CONFIG], useFactory: (c: PushConfig) => (c.enabled ? new WebPushSender(c) : null) },
    PushService,
  ],
  exports: [PushService],
})
export class PushModule {}
