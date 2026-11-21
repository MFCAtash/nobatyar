import { Controller, Get, Header } from "@nestjs/common";
import { Public } from "../common/decorators";
import { StatusService } from "./status.service";

/** وضعیت عمومی (بدون احراز هویت). cache ی ۳۰ثانیه‌ای هم در سرور و هم برای CDN/مرورگر. */
@Controller("status")
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Public()
  @Get()
  @Header("Cache-Control", "public, max-age=30, stale-while-revalidate=60")
  get() {
    return this.status.snapshot();
  }
}
