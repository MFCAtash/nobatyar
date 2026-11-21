export const IDEMPOTENCY_STORE = Symbol("IDEMPOTENCY_STORE");
export const IDEMPOTENT_KEY = "idempotent";
export interface IdempotentOptions { /** true ⇒ نبود هدر Idempotency-Key خطای ۴۰۰ است (endpoint مالی) */ required: boolean }
