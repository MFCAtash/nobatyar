import { Module } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module";
import { AuditModule } from "../audit/audit.module";
import { NotificationModule } from "../notifications/notification.module";
import { PrismaModule } from "../prisma/prisma.module";
import { buildGatewayRegistry } from "./gateway/build-registry";
import { GatewayRegistry } from "./gateway/gateway-registry";
import { PaymentController } from "./payment.controller";
import { loadPaymentConfig, PAYMENT_CONFIG } from "./payment.config";
import type { PaymentConfig } from "./payment.config";
import { PaymentReconciler } from "./payment-reconciler";
import { PaymentService } from "./payment.service";
import { PaymentSettlement } from "./payment-settlement";
import { REFUND_APPROVAL_CONFIG, RefundService } from "./refund.service";

@Module({
  imports: [PrismaModule, AuditModule, NotificationModule, AppointmentsModule],
  controllers: [PaymentController],
  providers: [
    // تنظیمات نامعتبر/ناامن (مثلاً sandbox در production) ⇒ ساخت DI شکست می‌خورد ⇒ اپ بالا نمی‌آید (fail-closed)
    { provide: PAYMENT_CONFIG, useFactory: () => loadPaymentConfig() },
    { provide: GatewayRegistry, inject: [PAYMENT_CONFIG], useFactory: (cfg: PaymentConfig) => buildGatewayRegistry(cfg) },
    { provide: REFUND_APPROVAL_CONFIG, inject: [PAYMENT_CONFIG], useFactory: (c: PaymentConfig) => ({ enabled: c.refundDualApproval, minAmountRial: c.refundDualApprovalMinRial }) },
    PaymentSettlement, PaymentService, PaymentReconciler, RefundService,
  ],
  exports: [PaymentService, PaymentSettlement, PaymentReconciler, RefundService, PAYMENT_CONFIG],
})
export class PaymentModule {}
