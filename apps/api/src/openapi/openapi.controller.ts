import { Controller, Get, Header } from "@nestjs/common";
import { Roles } from "../common/decorators";
import { buildDocument } from "./build-document";

/** سند OpenAPI برای ابزارها (Redoc/Swagger UI/تولید client). فقط ادمین: نقشه‌ی سطح حمله را عمومی نمی‌کنیم. */
@Roles("ADMIN")
@Controller("openapi.json")
export class OpenApiController {
  @Get()
  @Header("Cache-Control", "no-store")
  document() {
    return buildDocument();
  }
}
