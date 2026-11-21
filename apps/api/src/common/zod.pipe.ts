import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodType, ZodTypeDef } from "zod";

/** اعتبارسنجی ورودی با Zod (بدون نیاز به metadata تایپ‌اسکریپت). استفاده: @Body(new ZodPipe(schema)) */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        error: "validation_failed",
        issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return r.data;
  }
}
