import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { AuthUser, CurrentUser, Roles } from "../common/decorators";
import { ZodPipe } from "../common/zod.pipe";
import { LedgerService } from "./ledger.service";

const amount = z.union([z.string().regex(/^\d{1,13}$/), z.number().int().positive()]).transform((v) => BigInt(v));

export const topupSchema = z.object({ amountRial: amount, idempotencyKey: z.string().min(8).max(120) }).strict();
export const payoutSchema = z.object({ amountRial: amount, note: z.string().max(300).optional() }).strict();
export const decisionSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED", "PAID"]) }).strict();
export const insuranceSchema = z.object({
  insurer: z.string().min(2).max(80),
  policyNumber: z.string().min(3).max(60).optional(),
  coveragePercent: z.number().int().min(0).max(100),
  validUntil: z.string().datetime({ offset: true }).optional(),
}).strict();
export const settleSchema = z.object({
  policyId: z.string().uuid(), doctorId: z.string().uuid(), amountRial: amount, appointmentId: z.string().uuid().optional(),
}).strict();

@Controller("wallet")
export class WalletController {
  constructor(@Inject(LedgerService) private readonly ledger: LedgerService) {}

  @Get()
  wallet(@CurrentUser() u: AuthUser) {
    return this.ledger.wallet(u);
  }

  @Get("history")
  history(@CurrentUser() u: AuthUser, @Query("take") take?: string) {
    return this.ledger.history(u, take ? Number(take) : 50);
  }

  @Post("topup")
  @HttpCode(201)
  topup(@CurrentUser() u: AuthUser, @Body(new ZodPipe(topupSchema)) b: z.infer<typeof topupSchema>) {
    return this.ledger.topup(u, b.amountRial, b.idempotencyKey);
  }

  @Roles("DOCTOR")
  @Post("payouts")
  @HttpCode(201)
  requestPayout(@CurrentUser() u: AuthUser, @Body(new ZodPipe(payoutSchema)) b: z.infer<typeof payoutSchema>) {
    return this.ledger.requestPayout(u, b.amountRial, b.note);
  }

  @Get("payouts")
  payouts(@CurrentUser() u: AuthUser) {
    return this.ledger.listPayouts(u);
  }

  @Roles("ADMIN")
  @Patch("payouts/:id")
  decide(@CurrentUser() u: AuthUser, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodPipe(decisionSchema)) b: z.infer<typeof decisionSchema>) {
    return this.ledger.decidePayout(u, id, b.decision);
  }

  @Roles("PATIENT")
  @Get("insurance")
  insurance(@CurrentUser() u: AuthUser) {
    return this.ledger.listInsurance(u);
  }

  @Roles("PATIENT")
  @Post("insurance")
  @HttpCode(201)
  addInsurance(@CurrentUser() u: AuthUser, @Body(new ZodPipe(insuranceSchema)) b: z.infer<typeof insuranceSchema>) {
    return this.ledger.addInsurance(u, b);
  }

  @Roles("ADMIN")
  @Post("insurance/settle")
  @HttpCode(201)
  settle(@CurrentUser() u: AuthUser, @Body(new ZodPipe(settleSchema)) b: z.infer<typeof settleSchema>) {
    return this.ledger.settleInsurance(u, b);
  }
}
