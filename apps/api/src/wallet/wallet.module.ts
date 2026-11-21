import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { LedgerService } from "./ledger.service";
import { WalletController } from "./wallet.controller";

@Module({
  imports: [AuditModule],
  controllers: [WalletController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class WalletModule {}
