-- ═══════════════════════════════════════════════════════════════
-- نوبتیار — استرداد وجه واقعی + پنل ادمین (بخش ۶)
--   محافظت در سطح DB: هرگز بیش از مبلغِ دریافتی استرداد نشود؛ ستون‌های هویتی ثابت؛ PROCESSED نهایی؛ بدون DELETE
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE refunds
  ADD CONSTRAINT refunds_amount_positive CHECK (amount_rial > 0),
  ADD CONSTRAINT refunds_try_count_check CHECK (try_count >= 0),
  ADD CONSTRAINT refunds_attempt_fk FOREIGN KEY (attempt_id) REFERENCES payment_attempts(id);

-- PROCESSED ⇒ باید زمان/مرجع ثبت شده باشد
ALTER TABLE refunds
  ADD CONSTRAINT refunds_processed_check CHECK (status <> 'PROCESSED' OR (processed_at IS NOT NULL AND external_ref IS NOT NULL));

CREATE OR REPLACE FUNCTION refunds_guard() RETURNS trigger AS $$
DECLARE
  cap   bigint;
  taken bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'refunds are append-only: delete is not allowed';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.payment_id IS DISTINCT FROM OLD.payment_id
       OR NEW.amount_rial IS DISTINCT FROM OLD.amount_rial
       OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'refund identity columns are immutable';
    END IF;
    IF OLD.status = 'PROCESSED' AND NEW.status <> 'PROCESSED' THEN
      RAISE EXCEPTION 'a PROCESSED refund is final';
    END IF;
    IF OLD.status = 'PROCESSED' AND (NEW.external_ref IS DISTINCT FROM OLD.external_ref OR NEW.processed_at IS DISTINCT FROM OLD.processed_at) THEN
      RAISE EXCEPTION 'a PROCESSED refund is final';
    END IF;
  END IF;

  -- سقف: مجموع استردادهای «غیر FAILED» ≤ مبلغ دریافت‌شده (تلاش مشخص ⇒ مبلغ همان تلاش؛ وگرنه مبلغ Payment)
  IF NEW.status <> 'FAILED' THEN
    IF NEW.attempt_id IS NOT NULL THEN
      SELECT amount_rial INTO cap FROM payment_attempts WHERE id = NEW.attempt_id;
      SELECT COALESCE(SUM(amount_rial), 0) INTO taken FROM refunds
        WHERE attempt_id = NEW.attempt_id AND status <> 'FAILED' AND id <> NEW.id;
    ELSE
      SELECT amount_rial INTO cap FROM payments WHERE id = NEW.payment_id;
      SELECT COALESCE(SUM(amount_rial), 0) INTO taken FROM refunds
        WHERE payment_id = NEW.payment_id AND attempt_id IS NULL AND status <> 'FAILED' AND id <> NEW.id;
    END IF;
    IF cap IS NULL OR taken + NEW.amount_rial > cap THEN
      RAISE EXCEPTION 'refund exceeds the amount received (cap %, already %, new %)', cap, taken, NEW.amount_rial;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS refunds_guard_trg ON refunds;
CREATE TRIGGER refunds_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON refunds
  FOR EACH ROW EXECUTE FUNCTION refunds_guard();

-- پنل ادمین با نقش SYSTEM (بدون داده‌ی سلامت) کار می‌کند؛ دسترسی به refunds برای نقش اپ از قبل برقرار است.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nobatyar_app') THEN
    GRANT SELECT, INSERT, UPDATE ON refunds TO nobatyar_app;
  END IF;
END $$;
