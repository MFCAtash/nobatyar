-- ═══════════════════════════════════════════════════════════════
-- نوبتیار — فاز ۳: RLS زمان‌بندی، نمای ساعت‌های اشغال، ایندکس جستجو
-- پس از مهاجرت schema فاز ۳ (جدول appointment_busy و ستون‌های جدید) اعمال می‌شود.
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS doctor_profiles_name_trgm ON doctor_profiles USING gin (full_name gin_trgm_ops);

-- ───────────── RLS جداول زمان‌بندی: خواندن عمومی، نوشتن مالک/ادمین/سیستم ─────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['availability_rules','time_offs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t || '_read', t);
    EXECUTE format($f$CREATE POLICY %I ON %I FOR ALL
      USING (doctor_id = app_user_id() OR app_is_admin() OR app_is_system())
      WITH CHECK (doctor_id = app_user_id() OR app_is_admin() OR app_is_system())$f$, t || '_write', t);
  END LOOP;
END $$;

ALTER TABLE doctor_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_specialties FORCE ROW LEVEL SECURITY;
CREATE POLICY doctor_specialties_read ON doctor_specialties FOR SELECT USING (true);
CREATE POLICY doctor_specialties_write ON doctor_specialties FOR ALL
  USING (doctor_id = app_user_id() OR app_is_admin() OR app_is_system())
  WITH CHECK (doctor_id = app_user_id() OR app_is_admin() OR app_is_system());

-- ───────────── نمای ساعت‌های اشغال (بدون اطلاعات بیمار) ─────────────
-- هر کسی می‌تواند بخواند (برای نمایش اسلات‌های آزاد)؛ هیچ‌کس جز trigger نمی‌تواند بنویسد.
ALTER TABLE appointment_busy ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointment_busy_read ON appointment_busy FOR SELECT USING (true);
-- نکته: FORCE عمداً نیست تا تابع SECURITY DEFINER (مالک) بتواند بنویسد.

CREATE OR REPLACE FUNCTION appointment_busy_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM appointment_busy WHERE appointment_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.status IN ('PENDING_PAYMENT','PENDING_CONFIRMATION','CONFIRMED','IN_PROGRESS') THEN
    INSERT INTO appointment_busy (appointment_id, doctor_id, starts_at, ends_at)
    VALUES (NEW.id, NEW.doctor_id, NEW.starts_at, NEW.ends_at)
    ON CONFLICT (appointment_id) DO UPDATE
      SET doctor_id = EXCLUDED.doctor_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at;
  ELSE
    DELETE FROM appointment_busy WHERE appointment_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER appointments_busy_sync
  AFTER INSERT OR UPDATE OR DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointment_busy_sync();

-- پر کردن اولیه از نوبت‌های موجود
INSERT INTO appointment_busy (appointment_id, doctor_id, starts_at, ends_at)
SELECT id, doctor_id, starts_at, ends_at FROM appointments
WHERE status IN ('PENDING_PAYMENT','PENDING_CONFIRMATION','CONFIRMED','IN_PROGRESS')
ON CONFLICT (appointment_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nobatyar_app') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON appointment_busy FROM nobatyar_app;
    GRANT SELECT ON appointment_busy TO nobatyar_app;
  END IF;
END $$;
