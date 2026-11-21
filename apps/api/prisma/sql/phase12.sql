-- ═══════════════════════════════════════════════════════════════
-- نوبتیار — فاز PWA/Web Push (نقشه‌ی راه، بخش ۵)
--   push_subscriptions: RLS؛ هر کاربر فقط اشتراک‌های خودش (و SYSTEM برای ارسال)
--   backfill: مکالمه برای نوبت‌های قدیمی که رکورد conversation نداشتند
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_owner ON push_subscriptions FOR ALL
  USING (user_id = app_user_id() OR app_is_system())
  WITH CHECK (user_id = app_user_id() OR app_is_system());

ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_failure_check CHECK (failure_count >= 0);

-- نوبت‌های پیش از این فاز مکالمه نداشتند (هیچ کدی آن را نمی‌ساخت)
INSERT INTO conversations (id, appointment_id, patient_id, doctor_id, created_at)
SELECT gen_random_uuid(), a.id, a.patient_id, a.doctor_id, a.created_at
FROM appointments a
WHERE NOT EXISTS (SELECT 1 FROM conversations c WHERE c.appointment_id = a.id)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nobatyar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO nobatyar_app;
  END IF;
END $$;
