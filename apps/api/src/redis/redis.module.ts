import { Global, Logger, Module } from "@nestjs/common";
import Redis from "ioredis";
import { KV_STORE, RedisKv } from "./kv-store";
import {
  PUBSUB_PUBLISHER, PUBSUB_SUBSCRIBER,
  RedisPublisher, RedisSubscriber,
} from "./pubsub";
import type { RedisPubLike, RedisSubLike } from "./pubsub";

function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required");
  return url;
}

@Global()
@Module({
  providers: [
    {
      provide: KV_STORE,
      useFactory: () => {
        const client = new Redis(redisUrl(), { maxRetriesPerRequest: 2, enableReadyCheck: true });
        return new RedisKv(client as unknown as ConstructorParameters<typeof RedisKv>[0]);
      },
    },
    {
      // اتصال «publisher»: وقتی Redis قطع است فوراً خطا بده (صف آفلاین خاموش) تا push اعلان معطل نماند
      // و hub به تحویل محلی برگردد.
      provide: PUBSUB_PUBLISHER,
      useFactory: () => {
        const log = new Logger("RedisPub");
        const client = new Redis(redisUrl(), { enableOfflineQueue: false, maxRetriesPerRequest: 1, enableReadyCheck: true });
        client.on("error", (e: Error) => log.warn(e.message));
        return new RedisPublisher(client as unknown as RedisPubLike);
      },
    },
    {
      // اتصال «subscriber»: جدا از publisher و از KV؛ ioredis پس از قطعی خودکار دوباره subscribe می‌کند.
      provide: PUBSUB_SUBSCRIBER,
      useFactory: () => {
        const log = new Logger("RedisSub");
        const client = new Redis(redisUrl(), { maxRetriesPerRequest: 2, enableReadyCheck: true, autoResubscribe: true });
        return new RedisSubscriber(client as unknown as RedisSubLike, (e) => log.warn(e.message));
      },
    },
  ],
  exports: [KV_STORE, PUBSUB_PUBLISHER, PUBSUB_SUBSCRIBER],
})
export class RedisModule {}
