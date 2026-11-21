-- ═══════════════════════════════════════════════════════════════════════════
-- فاز ۲۴: Passkey، دفتر کل مالی (Ledger)، بیمه، Payout و Read Model داشبورد
-- این فایل فقط سیاست‌های RLS، قیدها، triggerها و view را اضافه می‌کند.
-- ساخت جداول توسط baseline (schema.prisma) انجام می‌شود.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Passkey / WebAuthn ────────────────────────────────────────────────────
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY webauthn_own_read ON webauthn_credentials FOR SELECT
  USING (user_id = app_user_id() OR app_is_system());
CREATE POLICY webauthn_own_write ON webauthn_credentials FOR ALL
  USING (user_id = app_user_id() OR app_is_system())
  WITH CHECK (user_id = app_user_id() OR app_is_system());

-- ── کیف پول ───────────────────────────────────────────────────────────────
ALTER TABLE wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY wallet_read ON wallet_accounts FOR SELECT
  USING (user_id = app_user_id() OR app_is_admin() OR app_is_system());
CREATE POLICY wallet_write ON wallet_accounts FOR ALL
  USING (user_id = app_user_id() OR app_is_system())
  WITH CHECK (user_id = app_user_id() OR app_is_system());

ALTER TABLE wallet_accounts ADD CONSTRAINT wallet_balance_nonnegative CHECK (user_id IS NULL OR balance_rial >= 0);
ALTER TABLE wallet_accounts ADD CONSTRAINT wallet_currency_len CHECK (char_length(currency) = 3);
ALTER TABLE wallet_accounts ADD CONSTRAINT wallet_owner_or_code CHECK ((user_id IS NULL) <> (code IS NULL));

-- ── دفتر کل ───────────────────────────────────────────────────────────────
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY ledger_tx_read ON ledger_transactions FOR SELECT USING (
  app_is_admin() OR app_is_system() OR EXISTS (
    SELECT 1 FROM ledger_entries e JOIN wallet_accounts w ON w.id = e.account_id
    WHERE e.transaction_id = ledger_transactions.id AND w.user_id = app_user_id()
  )
);
CREATE POLICY ledger_tx_write ON ledger_transactions FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY ledger_entry_read ON ledger_entries FOR SELECT USING (
  app_is_admin() OR app_is_system() OR EXISTS (
    SELECT 1 FROM wallet_accounts w WHERE w.id = ledger_entries.account_id AND w.user_id = app_user_id()
  )
);
CREATE POLICY ledger_entry_write ON ledger_entries FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());

ALTER TABLE ledger_entries ADD CONSTRAINT ledger_amount_positive CHECK (amount_rial > 0);

-- اعمال اثر هر قلم روی موجودی کیف پول (منبع حقیقت = ledger_entries)
CREATE OR REPLACE FUNCTION ledger_apply_entry() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.direction = 'CREDIT' THEN
    UPDATE wallet_accounts SET balance_rial = balance_rial + NEW.amount_rial, updated_at = now()
    WHERE id = NEW.account_id;
  ELSE
    UPDATE wallet_accounts SET balance_rial = balance_rial - NEW.amount_rial, updated_at = now()
    WHERE id = NEW.account_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ledger_entry_apply ON ledger_entries;
CREATE TRIGGER ledger_entry_apply AFTER INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_apply_entry();

-- هر تراکنش باید در پایان تراکنش DB متوازن باشد (ΣDEBIT = ΣCREDIT)
CREATE OR REPLACE FUNCTION ledger_tx_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE d bigint; c bigint;
BEGIN
  SELECT COALESCE(SUM(amount_rial) FILTER (WHERE direction = 'DEBIT'), 0),
         COALESCE(SUM(amount_rial) FILTER (WHERE direction = 'CREDIT'), 0)
    INTO d, c FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF d <> c THEN
    RAISE EXCEPTION 'ledger transaction % unbalanced (debit=%, credit=%)', NEW.transaction_id, d, c;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS ledger_tx_balanced_check ON ledger_entries;
CREATE CONSTRAINT TRIGGER ledger_tx_balanced_check AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_tx_balanced();

-- ── Payout پزشک ───────────────────────────────────────────────────────────
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts FORCE ROW LEVEL SECURITY;
CREATE POLICY payout_read ON payouts FOR SELECT
  USING (doctor_id = app_user_id() OR app_is_admin() OR app_is_system());
CREATE POLICY payout_write ON payouts FOR ALL
  USING (doctor_id = app_user_id() OR app_is_admin() OR app_is_system())
  WITH CHECK (doctor_id = app_user_id() OR app_is_admin() OR app_is_system());

ALTER TABLE payouts ADD CONSTRAINT payout_amount_positive CHECK (amount_rial > 0);

-- ── بیمه ──────────────────────────────────────────────────────────────────
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY insurance_read ON insurance_policies FOR SELECT
  USING (patient_id = app_user_id() OR app_is_system() OR app_admin_break_glass());
CREATE POLICY insurance_write ON insurance_policies FOR ALL
  USING (patient_id = app_user_id() OR app_is_system())
  WITH CHECK (patient_id = app_user_id() OR app_is_system());

ALTER TABLE insurance_policies ADD CONSTRAINT insurance_coverage_range
  CHECK (coverage_percent BETWEEN 0 AND 100);

-- ── Read Model داشبورد پزشک ────────────────────────────────────────────────
-- view با security_invoker تا RLS جداول پایه برای نقش اپ اعمال شود (PostgreSQL 15+).
CREATE OR REPLACE VIEW v_doctor_daily_stats WITH (security_invoker = true) AS
SELECT
  a.doctor_id,
  (a.starts_at AT TIME ZONE 'Asia/Tehran')::date AS day,
  count(*) FILTER (WHERE a.status IN ('CONFIRMED', 'COMPLETED'))::bigint AS visits,
  count(*) FILTER (WHERE a.status IN ('NO_SHOW_PATIENT', 'NO_SHOW_DOCTOR'))::bigint AS no_shows,
  count(*) FILTER (WHERE a.status IN ('CANCELLED_BY_PATIENT', 'CANCELLED_BY_DOCTOR'))::bigint AS cancellations,
  COALESCE(sum(p.amount_rial) FILTER (WHERE p.status = 'PAID'), 0)::bigint AS revenue_rial
FROM appointments a
LEFT JOIN payments p ON p.appointment_id = a.id
GROUP BY a.doctor_id, (a.starts_at AT TIME ZONE 'Asia/Tehran')::date;

COMMENT ON VIEW v_doctor_daily_stats IS 'فاز ۲۴ — Read Model روزانه پزشک (CQRS سبک)';
