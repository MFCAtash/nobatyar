-- ═══════════════════════════════════════════════════════════════
-- نوبتیار — درگاه پرداخت واقعی (نقشه‌ی راه، بخش ۴)
--   جدول payment_attempts: هر رفتن به درگاه یک «تلاش»؛ RLS، قیدها، تریگر تغییرناپذیری، backfill.
-- پس از مهاجرت schema (pnpm db:payment-gateway) اعمال می‌شود.
-- ═══════════════════════════════════════════════════════════════

-- ───────────── ۱) قیدها ─────────────
ALTER TABLE payment_attempts
  ADD CONSTRAINT payment_attempts_amount_check CHECK (amount_rial > 0),
  ADD CONSTRAINT payment_attempts_verified_check
    CHECK (status <> 'VERIFIED' OR (ref_id IS NOT NULL AND verified_at IS NOT NULL)),
  ADD CONSTRAINT payment_attempts_card_check
    CHECK (card_pan_masked IS NULL OR card_pan_masked ~ '^\*{4}[0-9]{4}$');   -- PAN کامل هرگز ذخیره نمی‌شود

-- «پرداخت‌شده» بدون درگاه/زمان معنی ندارد (ردیف‌های بازپرداخت‌شده هم PAID بوده‌اند)
ALTER TABLE payments
  ADD CONSTRAINT payments_paid_check
    CHECK (status IN ('INITIATED','FAILED') OR (gateway IS NOT NULL AND paid_at IS NOT NULL)) NOT VALID;

-- ───────────── ۲) Row-Level Security ─────────────
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts FORCE ROW LEVEL SECURITY;

-- هر کس Payment را ببیند (⇒ نوبتش را ببیند)، تلاش‌ها را هم می‌بیند؛ نوشتن: بیمارِ همان نوبت یا SYSTEM
CREATE POLICY payment_attempts_read ON payment_attempts FOR SELECT
  USING (EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id));
CREATE POLICY payment_attempts_write ON payment_attempts FOR ALL
  USING (
    app_is_system()
    OR EXISTS (SELECT 1 FROM payments p JOIN appointments a ON a.id = p.appointment_id
               WHERE p.id = payment_id AND a.patient_id = app_user_id())
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (SELECT 1 FROM payments p JOIN appointments a ON a.id = p.appointment_id
               WHERE p.id = payment_id AND a.patient_id = app_user_id())
  );

-- ───────────── ۳) تغییرناپذیری ─────────────
-- · حذف ممنوع (سابقه‌ی مالی)
-- · هویت تلاش (درگاه، authority، مبلغ، payment) هرگز عوض نمی‌شود
-- · VERIFIED نهایی است؛ FAILED/EXPIRED/MISMATCH هم نهایی‌اند (فقط INITIATED می‌تواند تغییر وضعیت بدهد)
CREATE OR REPLACE FUNCTION payment_attempts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payment_attempts cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.gateway <> OLD.gateway OR NEW.authority <> OLD.authority
     OR NEW.amount_rial <> OLD.amount_rial OR NEW.payment_id <> OLD.payment_id THEN
    RAISE EXCEPTION 'payment_attempts identity columns are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'INITIATED' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'payment_attempts status % is final', OLD.status USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'VERIFIED' AND (NEW.ref_id IS DISTINCT FROM OLD.ref_id OR NEW.verified_at IS DISTINCT FROM OLD.verified_at) THEN
    RAISE EXCEPTION 'verified payment_attempts are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_attempts_guard_trg BEFORE UPDATE OR DELETE ON payment_attempts
  FOR EACH ROW EXECUTE FUNCTION payment_attempts_guard();

-- Payment پرداخت‌شده: مبلغ و نوبت تغییر نمی‌کند
CREATE OR REPLACE FUNCTION payments_amount_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount_rial <> OLD.amount_rial AND OLD.status <> 'INITIATED' THEN
    RAISE EXCEPTION 'payments.amount_rial is immutable after initiation' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.appointment_id <> OLD.appointment_id THEN
    RAISE EXCEPTION 'payments.appointment_id is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payments_amount_guard_trg ON payments;
CREATE TRIGGER payments_amount_guard_trg BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_amount_guard();

-- ───────────── ۴) داده‌ی قبلی (فاز ۵: stub ی سندباکس) ─────────────
-- ردیف‌های قبلی همه «SANDBOX» بودند. در production اپ هرگز attempt ی SANDBOX را verify نمی‌کند؛
-- پیش از go-live این داده‌ها باید پاک/آرشیو شوند (docs/payment-gateway.md، بخش «پیش از پول واقعی»).
UPDATE payments SET gateway = 'SANDBOX' WHERE gateway IS NULL AND gateway_ref IS NOT NULL;
UPDATE payments SET paid_at = updated_at WHERE status IN ('PAID','REFUNDED','PARTIALLY_REFUNDED') AND paid_at IS NULL;
UPDATE payments SET appointment_synced_at = updated_at WHERE status IN ('PAID','REFUNDED','PARTIALLY_REFUNDED') AND appointment_synced_at IS NULL;

INSERT INTO payment_attempts (id, payment_id, gateway, authority, amount_rial, status, ref_id, verified_at, created_at, updated_at)
SELECT gen_random_uuid(), p.id, 'SANDBOX', p.gateway_ref, GREATEST(p.amount_rial, 1),
       CASE WHEN p.status IN ('PAID','REFUNDED','PARTIALLY_REFUNDED') THEN 'VERIFIED'::"PaymentAttemptStatus"
            WHEN p.status = 'FAILED' THEN 'FAILED'::"PaymentAttemptStatus"
            ELSE 'INITIATED'::"PaymentAttemptStatus" END,
       CASE WHEN p.status IN ('PAID','REFUNDED','PARTIALLY_REFUNDED') THEN 'LEGACY-SANDBOX' END,
       CASE WHEN p.status IN ('PAID','REFUNDED','PARTIALLY_REFUNDED') THEN p.updated_at END,
       p.created_at, p.updated_at
FROM payments p
WHERE p.gateway_ref IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE payments VALIDATE CONSTRAINT payments_paid_check;

-- ───────────── ۵) دسترسی نقش اپلیکیشن ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nobatyar_app') THEN
    GRANT SELECT, INSERT, UPDATE ON payment_attempts TO nobatyar_app;
    REVOKE DELETE, TRUNCATE ON payment_attempts FROM nobatyar_app;   -- سابقه‌ی مالی: هرگز حذف نمی‌شود
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nobatyar_app;
  END IF;
END $$;
