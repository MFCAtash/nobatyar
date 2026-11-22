import { Module } from "@nestjs/common";
import { APPOINTMENT_LIFECYCLE } from "../appointments/lifecycle";
import { NotificationModule } from "../notifications/notification.module";
import { LiveKitRoomAdmin, NoopRoomAdmin, ROOM_ADMIN } from "./livekit";
import { VIDEO_CONFIG, VideoConfig, loadVideoConfig } from "./video.config";
import { VideoController, VideoWebhookController } from "./video.controller";
import { VideoService } from "./video.service";
import { RoomPolicyController } from "./room-policy.controller";
import { RoomPolicyService } from "./room-policy.service";

@Module({
  imports: [NotificationModule],
  controllers: [VideoController, VideoWebhookController, RoomPolicyController],
  providers: [
    { provide: VIDEO_CONFIG, useFactory: () => loadVideoConfig() },
    {
      provide: ROOM_ADMIN,
      inject: [VIDEO_CONFIG],
      useFactory: (c: VideoConfig) => (c.enabled ? new LiveKitRoomAdmin(c.httpUrl, c.apiKey, c.apiSecret) : new NoopRoomAdmin()),
    },
    VideoService,
    RoomPolicyService,
    { provide: APPOINTMENT_LIFECYCLE, useExisting: VideoService },
  ],
  exports: [APPOINTMENT_LIFECYCLE, VideoService],
})
export class VideoModule {}
