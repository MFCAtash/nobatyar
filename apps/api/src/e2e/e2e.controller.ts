import { randomInt, randomUUID } from "node:crypto";
import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Post, Query } from "@nestjs/common";
import { Public } from "../common/decorators";
import { AUTH_CONFIG } from "../config/auth.config";
import type { AuthConfig } from "../config/auth.config";
import { aad, FIELD_CRYPTO, normalizeIranMobile } from "../crypto";
import type { FieldCrypto } from "../crypto";
import { PrismaService } from "../prisma/prisma.service";
import { SMS_PROVIDER, MemorySmsProvider } from "../sms/sms.provider";
import type { SmsProvider } from "../sms/sms.provider";

/**
 * ⚠️ hook های «فقط تست» برای Playwright و k6. در production هرگز وجود ندارند:
 *   ۱) E2eModule فقط با E2E_TEST_HOOKS=true به AppModule اضافه می‌شود؛
 *   ۲) loadAuthConfig در production با این flag (یا SMS_PROVIDER=memory) اپ را بالا نمی‌آورد؛
 *   ۳) سازنده‌ی این controller هم در production throw می‌کند (دفاع در عمق).
 */
@Controller("__e2e")
export class E2eController {
  constructor(
    @Inject(AUTH_CONFIG) cfg: AuthConfig,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {
    if (cfg.isProduction || !cfg.e2eHooks || !(sms instanceof MemorySmsProvider)) {
      throw new Error("E2E hooks must never be active in production");
    }
  }

  /** آخرین کد OTP ی یک شماره (یک‌بارمصرف). */
  @Public()
  @Get("otp")
  otp(@Query("phone") phone: string) {
    const p = normalizeIranMobile(phone ?? "");
    if (!p) throw new BadRequestException({ error: "invalid_phone" });
    const code = (this.sms as MemorySmsProvider).take(p);
    if (!code) throw new NotFoundException({ error: "no_otp" });
    return { code };
  }

  /** پزشک تأییدشده با برنامه‌ی کاری تمام هفته (۰۶:۰۰–۲۳:۰۰ تهران) و شماره‌ی تصادفی. */
  @Public()
  @Post("doctor")
  async doctor(@Body() body: { fullName?: string; feeRial?: string | number; autoConfirm?: boolean; slotMinutes?: number }) {
    const fullName = (body?.fullName ?? "دکتر آزمون").toString().slice(0, 80);
    const fee = BigInt(body?.feeRial ?? 1_000_000);
    if (fee < 0n || fee > 1_000_000_000n) throw new BadRequestException({ error: "invalid_fee" });
    const phone = `989${randomInt(100_000_000, 999_999_999)}`;
    const id = randomUUID();
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      await tx.user.create({
        data: { id, role: "DOCTOR", phoneHash: this.crypto.blindIndex(phone, "phone"), phoneEnc: this.crypto.encrypt(phone, aad("users", id, "phone")) },
      });
      await tx.doctorProfile.create({
        data: { userId: id, fullName, consultationFeeRial: fee, slotMinutes: body?.slotMinutes ?? 20, autoConfirm: body?.autoConfirm ?? false, isListed: true },
      });
      await tx.availabilityRule.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ doctorId: id, weekday, startTime: "06:00", endTime: "23:00" })),
      });
    });
    return { doctorId: id, phone: `0${phone.slice(2)}`, fullName };
  }

  /** ادمین تست (بدون پروفایل پزشک و بدون MFA) با شماره تصادفی — فقط E2E_TEST_HOOKS=true. */
  @Public()
  @Post("admin")
  async admin() {
    const phone = `989${randomInt(100_000_000, 999_999_999)}`;
    const id = randomUUID();
    const fullName = "ادمین تست";
    await this.prisma.withContext({ role: "SYSTEM" }, async (tx) => {
      await tx.user.create({
        data: { id, role: "ADMIN", phoneHash: this.crypto.blindIndex(phone, "phone"), phoneEnc: this.crypto.encrypt(phone, aad("users", id, "phone")) },
      });
    });
    return { adminId: id, phone: `0${phone.slice(2)}`, fullName };
  }

  /** فقط برای اطمینان از اینکه hook ها فعال‌اند (health ی تست). */
  @Public()
  @Get("ping")
  ping() {
    return { ok: true };
  }
}

