import { Module } from "@nestjs/common";
import { KMS_CONFIG, loadKmsConfig } from "./kms.config";
import { KMS, KmsService } from "./kms.service";

/**
 * لایهٔ KMS. ماژول را در AppModule وارد کنید؛ تنظیمات نامعتبر هنگام DI
 * (پیش از بالا آمدن اپ) throw میکند ⇒ fail-closed. صدور KMS علاوه بر KmsService
 * امکان تزریق با symbol پایدار را هم میدهد.
 */
@Module({
  providers: [
    { provide: KMS_CONFIG, useFactory: () => loadKmsConfig() },
    KmsService,
    { provide: KMS, useExisting: KmsService },
  ],
  exports: [KmsService, KMS],
})
export class KmsModule {}
