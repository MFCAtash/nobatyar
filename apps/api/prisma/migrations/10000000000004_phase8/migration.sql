-- ═══════════════════════════════════════════════════════════════
-- نوبتیار — فاز ۸: RLS و تریگرهای تغییرناپذیری برای
--   پروفایل سلامت، SOAP، خلاصه‌ی ویزیت، نسخه، نظر دوم
-- پس از مهاجرت schema فاز ۸ (db:phase8) اعمال می‌شود. ⚠️ جدول second_opinions باید خالی باشد (هیچ کدی تا فاز ۷ در آن نمی‌نوشت).
-- قاعده: «به‌حداقل‌رساندن دسترسی در خود دیتابیس» — حتی اگر کد API باگ داشته باشد، RLS مرز را نگه می‌دارد.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_health_profiles','soap_notes','soap_addenda','visit_summaries','prescriptions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ───────────── ۱) پروفایل سلامت ─────────────
-- بیمار: همه‌کاره. پزشک: فقط خواندن، آن هم فقط اگر «نوبت فعال/اخیر» با این بیمار دارد (ایمنی دارویی: حساسیت‌ها).
CREATE POLICY php_read ON patient_health_profiles FOR SELECT USING (
  patient_id = app_user_id()
  OR EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.patient_id = patient_health_profiles.patient_id AND a.doctor_id = app_user_id()
      AND (a.status IN ('CONFIRMED','IN_PROGRESS') OR (a.status = 'COMPLETED' AND a.ends_at > now() - interval '90 days'))
  )
  OR app_admin_break_glass()
);
CREATE POLICY php_write ON patient_health_profiles FOR ALL
  USING (patient_id = app_user_id()) WITH CHECK (patient_id = app_user_id());

-- ───────────── ۲) SOAP: فقط پزشکِ همان نوبت (بیمار «هرگز» جدول SOAP را نمی‌خواند) ─────────────
CREATE POLICY soap_doctor_all ON soap_notes FOR ALL
  USING (doctor_id = app_user_id())
  WITH CHECK (
    doctor_id = app_user_id()
    AND EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id AND a.doctor_id = app_user_id() AND a.patient_id = soap_notes.patient_id)
  );
CREATE POLICY soap_break_glass ON soap_notes FOR SELECT USING (app_admin_break_glass());

CREATE POLICY soap_addenda_read ON soap_addenda FOR SELECT
  USING (doctor_id = app_user_id() OR app_admin_break_glass());
CREATE POLICY soap_addenda_insert ON soap_addenda FOR INSERT
  WITH CHECK (doctor_id = app_user_id() AND EXISTS (SELECT 1 FROM soap_notes n WHERE n.id = note_id AND n.doctor_id = app_user_id() AND n.status = 'SIGNED'));

-- امضاشده ⇒ هیچ تغییری (حتی از نقش مالک اپ)؛ حذف هم ممنوع
CREATE OR REPLACE FUNCTION soap_notes_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'soap_notes cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'SIGNED' THEN
    RAISE EXCEPTION 'signed soap_notes are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.appointment_id <> OLD.appointment_id OR NEW.doctor_id <> OLD.doctor_id OR NEW.patient_id <> OLD.patient_id THEN
    RAISE EXCEPTION 'soap_notes identity columns are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER soap_notes_guard_trg BEFORE UPDATE OR DELETE ON soap_notes
  FOR EACH ROW EXECUTE FUNCTION soap_notes_guard();

-- ───────────── ۳) خلاصه‌ی ویزیت برای بیمار ─────────────
-- نویسنده: پزشک (هنگام امضا). خواننده: بیمار، پزشک، پزشکِ نظر‌دهنده (فقط اگر بیمار صراحتاً اجازه داده)، break-glass.
CREATE POLICY vs_read ON visit_summaries FOR SELECT USING (
  patient_id = app_user_id() OR doctor_id = app_user_id() OR app_admin_break_glass()
  OR EXISTS (
    SELECT 1 FROM second_opinions so
    WHERE so.appointment_id = visit_summaries.appointment_id AND so.doctor_id = app_user_id()
      AND so.include_visit_summary AND so.status IN ('REQUESTED','ACCEPTED','ANSWERED')
  )
);
CREATE POLICY vs_insert ON visit_summaries FOR INSERT WITH CHECK (
  doctor_id = app_user_id()
  AND EXISTS (SELECT 1 FROM soap_notes n WHERE n.appointment_id = visit_summaries.appointment_id AND n.doctor_id = app_user_id())
);

-- ───────────── ۴) نسخه ─────────────
CREATE POLICY rx_read ON prescriptions FOR SELECT
  USING (patient_id = app_user_id() OR doctor_id = app_user_id() OR app_admin_break_glass() OR app_is_system());
CREATE POLICY rx_insert ON prescriptions FOR INSERT WITH CHECK (
  doctor_id = app_user_id()
  AND EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id AND a.doctor_id = app_user_id() AND a.patient_id = prescriptions.patient_id)
);
CREATE POLICY rx_update ON prescriptions FOR UPDATE
  USING (doctor_id = app_user_id()) WITH CHECK (doctor_id = app_user_id());

-- فقط ابطال مجاز است: ISSUED → CANCELLED با cancelled_at؛ بقیه‌ی ستون‌ها قفل
CREATE OR REPLACE FUNCTION prescriptions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'prescriptions cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'cancelled prescription is final' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.number <> OLD.number OR NEW.appointment_id <> OLD.appointment_id OR NEW.doctor_id <> OLD.doctor_id
     OR NEW.patient_id <> OLD.patient_id OR NEW.items_enc IS DISTINCT FROM OLD.items_enc
     OR NEW.issued_at <> OLD.issued_at OR NEW.valid_until <> OLD.valid_until
     OR NEW.warnings_acknowledged <> OLD.warnings_acknowledged THEN
    RAISE EXCEPTION 'issued prescription is immutable (cancel and re-issue)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status = 'CANCELLED' AND (NEW.cancelled_at IS NULL OR NEW.cancel_reason_enc IS NULL) THEN
    RAISE EXCEPTION 'cancellation requires time and reason' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER prescriptions_guard_trg BEFORE UPDATE OR DELETE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION prescriptions_guard();

-- ───────────── ۵) نظر دوم ─────────────
-- سیاست‌های قدیمی (فاز ۱) فقط شرکت‌کنندگان نوبت مبدأ را می‌دیدند؛ پزشک نظر‌دهنده و بیمار باید مستقیم دسترسی داشته باشند.
-- پزشکِ «اولیه» عمداً دسترسی ندارد (تضاد منافع / آزادی بیمار).
DROP POLICY IF EXISTS second_opinions_read ON second_opinions;
DROP POLICY IF EXISTS second_opinions_write ON second_opinions;

CREATE POLICY so_read ON second_opinions FOR SELECT
  USING (patient_id = app_user_id() OR doctor_id = app_user_id() OR app_admin_break_glass() OR app_is_system());
CREATE POLICY so_insert ON second_opinions FOR INSERT WITH CHECK (
  patient_id = app_user_id()
  AND EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id AND a.patient_id = app_user_id())
);
CREATE POLICY so_update ON second_opinions FOR UPDATE
  USING (patient_id = app_user_id() OR doctor_id = app_user_id() OR app_is_system())
  WITH CHECK (patient_id = app_user_id() OR doctor_id = app_user_id() OR app_is_system());

-- ماشین وضعیت در خود دیتابیس: ستون‌های هویتی ثابت، وضعیت‌های پایانی منجمد، گذارها و «چه کسی» اجبار می‌شود.
CREATE OR REPLACE FUNCTION second_opinions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'second_opinions cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.appointment_id <> OLD.appointment_id OR NEW.patient_id <> OLD.patient_id OR NEW.doctor_id <> OLD.doctor_id
     OR NEW.request_enc IS DISTINCT FROM OLD.request_enc OR NEW.include_visit_summary <> OLD.include_visit_summary
     OR NEW.shared_record_ids IS DISTINCT FROM OLD.shared_record_ids
     OR NEW.accept_deadline_at <> OLD.accept_deadline_at OR NEW.shares_expire_at <> OLD.shares_expire_at THEN
    RAISE EXCEPTION 'second_opinions identity/request columns are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status IN ('DECLINED','ANSWERED','EXPIRED','CANCELLED') THEN
    RAISE EXCEPTION 'second_opinion is in a final state' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status = OLD.status THEN
    IF NEW.response_enc IS DISTINCT FROM OLD.response_enc THEN
      RAISE EXCEPTION 'response can only be set when answering' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT ((OLD.status = 'REQUESTED' AND NEW.status IN ('ACCEPTED','DECLINED','EXPIRED','CANCELLED'))
       OR (OLD.status = 'ACCEPTED'  AND NEW.status IN ('ANSWERED','EXPIRED','CANCELLED'))) THEN
    RAISE EXCEPTION 'illegal second_opinion transition % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IN ('ACCEPTED','DECLINED','ANSWERED') AND app_user_id() IS DISTINCT FROM OLD.doctor_id THEN
    RAISE EXCEPTION 'only the consulted doctor may do this' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status = 'CANCELLED' AND app_user_id() IS DISTINCT FROM OLD.patient_id THEN
    RAISE EXCEPTION 'only the patient may cancel' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status = 'EXPIRED' AND NOT app_is_system() THEN
    RAISE EXCEPTION 'only the system may expire' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status = 'ANSWERED' AND NEW.response_enc IS NULL THEN
    RAISE EXCEPTION 'answer requires a response' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status <> 'ANSWERED' AND NEW.response_enc IS DISTINCT FROM OLD.response_enc THEN
    RAISE EXCEPTION 'response can only be set when answering' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER second_opinions_guard_trg BEFORE UPDATE OR DELETE ON second_opinions
  FOR EACH ROW EXECUTE FUNCTION second_opinions_guard();

-- ───────────── ۶) دسترسی نقش اپلیکیشن ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nobatyar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON patient_health_profiles, soap_notes, soap_addenda, visit_summaries, prescriptions, second_opinions TO nobatyar_app;
    REVOKE DELETE, TRUNCATE ON soap_notes, prescriptions, second_opinions FROM nobatyar_app;      -- هرگز حذف نمی‌شوند
    REVOKE UPDATE, DELETE, TRUNCATE ON soap_addenda, visit_summaries FROM nobatyar_app;           -- append-only
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nobatyar_app;
  END IF;
END $$;

-- ───────────── ۷) لغو اشتراک پرونده‌ها توسط SYSTEM (پایان نظر دوم بدون پاسخ) ─────────────
-- فقط زمینه‌ی سروری SYSTEM؛ کاربران عادی این مسیر را ندارند. کد فقط ردیف‌های مشخصِ همان درخواست را لغو می‌کند.
CREATE POLICY record_shares_system ON record_shares FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
