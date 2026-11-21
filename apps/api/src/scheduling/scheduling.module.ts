import { Global, Module } from "@nestjs/common";
import { loadSchedulingConfig, SCHEDULING_CONFIG } from "./config";

@Global()
@Module({
  providers: [{ provide: SCHEDULING_CONFIG, useFactory: () => loadSchedulingConfig() }],
  exports: [SCHEDULING_CONFIG],
})
export class SchedulingModule {}
