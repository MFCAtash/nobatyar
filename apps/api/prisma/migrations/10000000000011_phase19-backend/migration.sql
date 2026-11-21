-- ═══════════════════════════════════════════════════════════════════════════════
-- نوبتیار — فاز ۱۹: MFA، RPM، Ambient Scribe،FHIR/حق حذف، لیستانتظار
-- جدولها و ستونها از schema.prisma میآیند؛ اینجا فقط قیدها و RLS اند.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── MFA: راز بدون active نمیتواند باشد ──
ALTER TABLE users ADD CONSTRAINT users_mfa_requires_secret
  CHECK (mfa_enabled_at IS NULL OR mfa_secret_enc IS NOT NULL);
ALTER TABLE users ADD CONSTRAINT users_mfa_attempts_nonnegative CHECK (mfa_failed_count >= 0);

-- ── RPM: بازهی فیزیولوژیک معقول ──
ALTER TABLE vital_readings ADD CONSTRAINT vital_primary_range
  CHECK (value_primary >= 1 AND value_primary <= 1000);
ALTER TABLE vital_readings ADD CONSTRAINT vital_secondary_range
  CHECK (value_secondary IS NULL OR (value_secondary >= 1 AND value_secondary <= 1000));
ALTER TABLE vital_readings ADD CONSTRAINT vital_bp_pair
  CHECK (type <> 'BLOOD_PRESSURE' OR (value_secondary IS NOT NULL AND value_secondary < value_primary));
-- A10: CHECK با now() معنای متغیری در dump/restore دارد ⇒ trigger جایگزین شد.
CREATE OR REPLACE FUNCTION vital_measured_not_future() RETURNS trigger AS $$
BEGIN
  IF NEW.measured_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'measured_at must not be in the future';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS vital_measured_not_future_trg ON vital_readings;
CREATE TRIGGER vital_measured_not_future_trg BEFORE INSERT OR UPDATE ON vital_readings
  FOR EACH ROW EXECUTE FUNCTION vital_measured_not_future();
CREATE INDEX IF NOT EXISTS vital_readings_recent_idx ON vital_readings (patient_id, measured_at DESC);

-- RLS: بیمار مالک، پزشک دارای نوبت فقط خواندن، ادمین/سیستم
ALTER TABLE vital_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vital_readings FORCE ROW LEVEL SECURITY;
-- A3: پزشک فقط در چارچوب رابطه درمانی «فعال» و با رضایت سلامت فعال میخواند.
CREATE POLICY vital_readings_read ON vital_readings FOR SELECT USING (
  patient_id = app_user_id() OR app_is_admin() OR app_is_system()
  OR (
    EXISTS (SELECT 1 FROM appointments a
            WHERE a.patient_id = vital_readings.patient_id
              AND a.doctor_id = app_user_id()
              AND a.status IN ('CONFIRMED','COMPLETED','IN_PROGRESS'))
    AND EXISTS (SELECT 1 FROM consents c
                WHERE c.user_id = vital_readings.patient_id
                  AND c.type = 'HEALTH_DATA_PROCESSING'
                  AND c.revoked_at IS NULL)
  )
);
CREATE POLICY vital_readings_write ON vital_readings FOR ALL
  USING (patient_id = app_user_id() OR app_is_admin() OR app_is_system())
  WITH CHECK (patient_id = app_user_id() OR app_is_system());

-- ── لیست انتظار ──
ALTER TABLE appointment_waitlist ADD CONSTRAINT waitlist_window CHECK (desired_from < desired_to);
ALTER TABLE appointment_waitlist ADD CONSTRAINT waitlist_expiry CHECK (expires_at > created_at);
ALTER TABLE appointment_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_waitlist FORCE ROW LEVEL SECURITY;
CREATE POLICY waitlist_read ON appointment_waitlist FOR SELECT USING (
  patient_id = app_user_id() OR doctor_id = app_user_id() OR app_is_admin() OR app_is_system()
);
CREATE POLICY waitlist_write ON appointment_waitlist FOR ALL
  USING (patient_id = app_user_id() OR app_is_system())
  WITH CHECK (patient_id = app_user_id() OR app_is_system());

-- ── Ambient Scribe ──
ALTER TABLE scribe_sessions ADD CONSTRAINT scribe_dual_consent
  CHECK (doctor_consent_at IS NOT NULL AND patient_consent_at IS NOT NULL);
ALTER TABLE scribe_sessions ADD CONSTRAINT scribe_ttl CHECK (expires_at > created_at);
ALTER TABLE scribe_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scribe_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY scribe_read ON scribe_sessions FOR SELECT USING (
  doctor_id = app_user_id() OR patient_id = app_user_id() OR app_is_system()
);
CREATE POLICY scribe_write ON scribe_sessions FOR ALL
  USING (doctor_id = app_user_id() OR app_is_system())
  WITH CHECK (doctor_id = app_user_id() OR app_is_system());

-- ── حق حذف/خروجی ──
ALTER TABLE data_requests ADD CONSTRAINT data_request_completion
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL));
ALTER TABLE data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY data_requests_read ON data_requests FOR SELECT USING (
  user_id = app_user_id() OR app_is_admin() OR app_is_system()
);
CREATE POLICY data_requests_write ON data_requests FOR ALL
  USING (user_id = app_user_id() OR app_is_system())
  WITH CHECK (user_id = app_user_id() OR app_is_system());

-- A10: تغییر status تنها توسط SYSTEM (پس از تأیید دو نفره) مجاز است.
CREATE OR REPLACE FUNCTION data_request_status_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT app_is_system() THEN
    RAISE EXCEPTION 'data request status is system-managed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS data_request_status_guard_trg ON data_requests;
CREATE TRIGGER data_request_status_guard_trg BEFORE UPDATE ON data_requests
  FOR EACH ROW EXECUTE FUNCTION data_request_status_guard();

-- A10: وضعیت لیست انتظار توسطjob سیستم مدیریت میشود.
CREATE OR REPLACE FUNCTION waitlist_status_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT app_is_system() THEN
    RAISE EXCEPTION 'waitlist status is system-managed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS waitlist_status_guard_trg ON appointment_waitlist;
CREATE TRIGGER waitlist_status_guard_trg BEFORE UPDATE ON appointment_waitlist
  FOR EACH ROW EXECUTE FUNCTION waitlist_status_guard();

-- A6: آرای تأیید ادمینها — خواندن توسط ادمین/سیستم، نوشتن تنها توسط سرویس با نقش SYSTEM.
ALTER TABLE data_request_reviews ADD CONSTRAINT data_request_review_decision
  CHECK (decision IN ('APPROVE','REJECT'));
ALTER TABLE data_request_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_request_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY data_request_reviews_read ON data_request_reviews FOR SELECT USING (app_is_admin() OR app_is_system());
CREATE POLICY data_request_reviews_write ON data_request_reviews FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());

-- ── مطب: شماره تلفن فقط کاراکترهای مجاز (داده عمومی، نه HEALTH) ──
ALTER TABLE doctor_profiles ADD CONSTRAINT doctor_clinic_phone_format
  CHECK (clinic_phone IS NULL OR clinic_phone ~ '^[0-9+\-\s()]{7,20}$');
