export type SettleState = "PAID" | "PENDING" | "FAILED" | "REVIEW";
export interface SettleResult { state: SettleState; code?: string }
export type SettleSource = "callback" | "reconcile" | "initiate";

export interface AttemptRow {
  id: string;
  gateway: string;
  authority: string;
  amountRial: bigint;
  status: string;
  createdAt: Date;
  paymentId: string;
  payment: { id: string; status: string; amountRial: bigint; appointmentId: string; appointment: { patientId: string } };
}

export const ATTEMPT_SELECT = {
  id: true, gateway: true, authority: true, amountRial: true, status: true, createdAt: true, paymentId: true,
  payment: { select: { id: true, status: true, amountRial: true, appointmentId: true, appointment: { select: { patientId: true } } } },
} as const;
