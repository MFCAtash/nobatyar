import { Global, Module } from "@nestjs/common";
import { FieldCrypto } from "./field-crypto";

export const FIELD_CRYPTO = Symbol("FIELD_CRYPTO");

@Global()
@Module({
  providers: [{ provide: FIELD_CRYPTO, useFactory: () => FieldCrypto.fromEnv() }],
  exports: [FIELD_CRYPTO],
})
export class CryptoModule {}
