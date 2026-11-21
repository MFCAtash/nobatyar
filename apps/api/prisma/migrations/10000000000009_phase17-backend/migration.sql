-- ═══════════════════════════════════════════════════════════════
-- نوبتیار — فاز ۱۷ بک‌اند: تأیید دو نفره‌ی استرداد، Idempotency-Key، Outbox
--   (جدول‌ها و ستون‌ها از schema.prisma می‌آیند؛ اینجا فقط محدودیت‌های سطح DB)
-- ═══════════════════════════════════════════════════════════════

-- ── Maker/Checker: حتی اگر کد اپ اشتباه کند، DB اجازه‌ی «تأییدِ خود» را نمی‌دهد ──
ALTER TABLE refunds
  ADD CONSTRAINT refunds_maker_checker_differ CHECK (checker_id IS NULL OR maker_id IS NULL OR checker_id <> maker_id),
  ADD CONSTRAINT refunds_approval_has_maker CHECK (approval_state = 'NONE' OR maker_id IS NOT NULL),
  ADD CONSTRAINT refunds_decision_has_checker CHECK (approval_state NOT IN ('APPROVED', 'REJECTED') OR (checker_id IS NOT NULL AND decided_at IS NOT NULL)),
  ADD CONSTRAINT refunds_mark_has_reference CHECK (approval_state NOT IN ('REQUESTED', 'APPROVED') OR approval_action <> 'MARK_PROCESSED' OR approval_ref IS NOT NULL),
  ADD CONSTRAINT refunds_maker_fk FOREIGN KEY (maker_id) REFERENCES users(id),
  ADD CONSTRAINT refunds_checker_fk FOREIGN KEY (checker_id) REFERENCES users(id);

-- ── Idempotency-Key ──
ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_completed_has_status CHECK (state <> 'COMPLETED' OR (status_code IS NOT NULL AND response IS NOT NULL)),
  ADD CONSTRAINT idempotency_key_len CHECK (char_length(key) BETWEEN 16 AND 128);

-- ── Outbox ──
ALTER TABLE outbox_events
  ADD CONSTRAINT outbox_attempts_nonneg CHECK (attempts >= 0),
  ADD CONSTRAINT outbox_processed_state CHECK ((status = 'PROCESSED') = (processed_at IS NOT NULL)),
  ADD CONSTRAINT outbox_dead_has_error CHECK (status <> 'DEAD' OR last_error IS NOT NULL);

-- پیام‌های آماده‌ی ارسال را سریع پیدا کن (relay با FOR UPDATE SKIP LOCKED)
CREATE INDEX IF NOT EXISTS outbox_events_ready_idx ON outbox_events (available_at, created_at) WHERE status = 'PENDING';

-- رویداد Outbox بعد از ثبت، محتوایش تغییر نمی‌کند (فقط وضعیت/تلاش‌ها)؛ حذف فقط توسط job پاکسازی (PROCESSED قدیمی)
CREATE OR REPLACE FUNCTION outbox_events_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.type IS DISTINCT FROM OLD.type
       OR NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.aggregate_type IS DISTINCT FROM OLD.aggregate_type
       OR NEW.aggregate_id IS DISTINCT FROM OLD.aggregate_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'outbox event content is immutable';
    END IF;
    IF OLD.status = 'PROCESSED' AND NEW.status <> 'PROCESSED' THEN
      RAISE EXCEPTION 'a PROCESSED outbox event is final';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'PENDING' THEN
      RAISE EXCEPTION 'a PENDING outbox event cannot be deleted';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS outbox_events_guard_trg ON outbox_events;
CREATE TRIGGER outbox_events_guard_trg BEFORE UPDATE OR DELETE ON outbox_events FOR EACH ROW EXECUTE FUNCTION outbox_events_guard();
