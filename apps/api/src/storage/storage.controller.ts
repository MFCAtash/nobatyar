import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtGuard } from "../auth/guards";
import { CurrentUser } from "../common/decorators";
import type { AuthUser } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { StorageService, ALLOWED_MIME, MAX_FILE_BYTES } from "./storage.service";

const UploadTokenSchema = z.object({
  bucket: z.enum(["chat", "records"]),
  mime:   z.string().min(3).max(80),
  bytes:  z.number().int().min(1).max(MAX_FILE_BYTES),
});

@Controller("storage")
@UseGuards(JwtGuard)
export class StorageController {
  constructor(private readonly svc: StorageService) {}

  /**
   * POST /storage/upload-token
   * دریافت presigned PUT URL برای آپلود مستقیم از browser
   */
  @Post("upload-token")
  uploadToken(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(UploadTokenSchema)) dto: z.infer<typeof UploadTokenSchema>,
  ) {
    return this.svc.createUploadToken(dto.bucket, dto.mime, dto.bytes, user.id);
  }

  /** لیست MIME مجاز — برای نمایش در UI */
  @Post("allowed-types")
  allowedTypes(@Body("bucket") bucket: "chat" | "records") {
    return { types: ALLOWED_MIME[bucket] ?? [] };
  }
}
