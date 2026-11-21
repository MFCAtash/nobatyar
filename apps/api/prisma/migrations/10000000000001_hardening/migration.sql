-- ═══════════════════════════════════════════════════════════════
-- نوبتیار — سخت‌سازی دیتابیس (فاز ۱)
-- پس از مهاجرت init اعمال می‌شود (اسکریپت scripts/db-init.sh آن را در یک مهاجرت قرار می‌دهد).
-- ۱) ضد رزرو دوبل  ۲) Audit append-only با زنجیره‌ی هش  ۳) RLS  ۴) دسترسی‌ها
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ───────────── ۰) توابع زمینه (context) ─────────────
-- API در هر تراکنش با set_config('app.user_id'|'app.role'|'app.break_glass', ..., true) مقدار می‌دهد.
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('app.role', true), '') $$;

CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app_role() = 'ADMIN' $$;

CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app_role() = 'SYSTEM' $$;

-- دسترسی اضطراری ادمین به محتوای HEALTH (باید در لایه‌ی اپ دلیل ثبت و Audit شود)
CREATE OR REPLACE FUNCTION app_admin_break_glass() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_role() = 'ADMIN' AND COALESCE(current_setting('app.break_glass', true), '') = 'on'
$$;

-- ───────────── ۱) ضد رزرو دوبل ─────────────
ALTER TABLE appointments
  ADD CONSTRAINT appointments_time_check CHECK (ends_at > starts_at);

ALTER TABLE appointments
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status IN ('PENDING_PAYMENT','PENDING_CONFIRMATION','CONFIRMED','IN_PROGRESS'));

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_check CHECK (amount_rial >= 0);

-- ───────────── ۲) Audit: append-only + زنجیره‌ی هش ─────────────
-- جدول audit_chain_head توسط مهاجرت init ساخته می‌شود (در schema.prisma تعریف شده)
ALTER TABLE audit_chain_head ADD CONSTRAINT audit_chain_head_single CHECK (id = 1);
INSERT INTO audit_chain_head (id, last_seq) VALUES (1, 0);

CREATE OR REPLACE FUNCTION audit_compute_hash(
  prev text, p_seq bigint, p_id bigint, p_actor uuid, p_role text, p_action text,
  p_otype text, p_oid text, p_meta jsonb, p_at timestamptz
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(digest(
    COALESCE(prev,'') || '|' || p_seq::text || '|' || p_id::text || '|' ||
    COALESCE(p_actor::text,'') || '|' || COALESCE(p_role,'') || '|' || p_action || '|' ||
    p_otype || '|' || COALESCE(p_oid,'') || '|' || COALESCE(p_meta::text,'') || '|' ||
    (extract(epoch FROM p_at) * 1000000)::bigint::text,
    'sha256'), 'hex')
$$;

CREATE OR REPLACE FUNCTION audit_logs_chain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE h audit_chain_head%ROWTYPE;
BEGIN
  -- قفل ردیف head تا پایان تراکنش → ترتیب زنجیره قطعی
  SELECT * INTO h FROM audit_chain_head WHERE id = 1 FOR UPDATE;
  NEW.seq := h.last_seq + 1;
  NEW.prev_hash := h.hash;
  NEW.hash := audit_compute_hash(h.hash, NEW.seq, NEW.id, NEW.actor_id, NEW.actor_role,
                                 NEW.action, NEW.object_type, NEW.object_id, NEW.meta, NEW.at);
  UPDATE audit_chain_head SET last_seq = NEW.seq, hash = NEW.hash WHERE id = 1;
  RETURN NEW;
END $$;

CREATE TRIGGER audit_logs_chain_trg
  BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_chain();

CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();

-- بررسی سلامت زنجیره: سطرهای خراب (خالی = سالم)
CREATE OR REPLACE FUNCTION verify_audit_chain()
RETURNS TABLE (broken_seq bigint, reason text)
LANGUAGE plpgsql STABLE AS $$
DECLARE r audit_logs%ROWTYPE; expected_prev text := NULL; expected_seq bigint := 0;
BEGIN
  FOR r IN SELECT * FROM audit_logs ORDER BY seq LOOP
    expected_seq := expected_seq + 1;
    IF r.seq <> expected_seq THEN
      broken_seq := r.seq; reason := 'gap in sequence (expected ' || expected_seq || ')'; RETURN NEXT;
      expected_seq := r.seq;
    END IF;
    IF r.prev_hash IS DISTINCT FROM expected_prev THEN
      broken_seq := r.seq; reason := 'prev_hash mismatch'; RETURN NEXT;
    END IF;
    IF r.hash IS DISTINCT FROM audit_compute_hash(r.prev_hash, r.seq, r.id, r.actor_id, r.actor_role,
         r.action, r.object_type, r.object_id, r.meta, r.at) THEN
      broken_seq := r.seq; reason := 'hash mismatch (row modified)'; RETURN NEXT;
    END IF;
    expected_prev := r.hash;
  END LOOP;
END $$;

-- ───────────── ۳) Row-Level Security ─────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','sessions','consents','patient_profiles','doctor_profiles','doctor_verifications',
    'appointments','appointment_status_history','payments','refunds',
    'health_records','record_attachments','record_shares',
    'conversations','messages','triage_sessions','second_opinions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- users / sessions / consents: خود کاربر، ادمین، یا زمینه‌ی SYSTEM (فرایند ورود/کارهای زمان‌بندی‌شده)
CREATE POLICY users_all ON users
  USING (id = app_user_id() OR app_is_admin() OR app_is_system())
  WITH CHECK (id = app_user_id() OR app_is_admin() OR app_is_system());

CREATE POLICY sessions_all ON sessions
  USING (user_id = app_user_id() OR app_is_system())
  WITH CHECK (user_id = app_user_id() OR app_is_system());

CREATE POLICY consents_all ON consents
  USING (user_id = app_user_id() OR app_is_admin() OR app_is_system())
  WITH CHECK (user_id = app_user_id() OR app_is_system());

-- پروفایل بیمار: خودش، پزشکِ دارای نوبت با او، ادمین/سیستم
CREATE POLICY patient_profiles_read ON patient_profiles FOR SELECT
  USING (
    user_id = app_user_id() OR app_is_admin() OR app_is_system()
    OR EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = patient_profiles.user_id AND a.doctor_id = app_user_id())
  );
CREATE POLICY patient_profiles_write ON patient_profiles FOR ALL
  USING (user_id = app_user_id() OR app_is_admin() OR app_is_system())
  WITH CHECK (user_id = app_user_id() OR app_is_admin() OR app_is_system());

-- پروفایل پزشک: خواندن عمومی، نوشتن فقط مالک/ادمین/سیستم
CREATE POLICY doctor_profiles_read ON doctor_profiles FOR SELECT USING (true);
CREATE POLICY doctor_profiles_write ON doctor_profiles FOR ALL
  USING (user_id = app_user_id() OR app_is_admin() OR app_is_system())
  WITH CHECK (user_id = app_user_id() OR app_is_admin() OR app_is_system());

CREATE POLICY doctor_verifications_all ON doctor_verifications
  USING (doctor_id = app_user_id() OR app_is_admin() OR app_is_system())
  WITH CHECK (doctor_id = app_user_id() OR app_is_admin() OR app_is_system());

-- نوبت
CREATE POLICY appointments_all ON appointments
  USING (patient_id = app_user_id() OR doctor_id = app_user_id() OR app_is_admin() OR app_is_system())
  WITH CHECK (patient_id = app_user_id() OR doctor_id = app_user_id() OR app_is_admin() OR app_is_system());

-- جداول وابسته به نوبت: هر کس نوبت را ببیند، این‌ها را هم می‌بیند (RLS جدول appointments اعمال می‌شود)
CREATE POLICY appt_history_all ON appointment_status_history
  USING (EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id))
  WITH CHECK (EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id));

CREATE POLICY payments_all ON payments
  USING (EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id))
  WITH CHECK (EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id));

CREATE POLICY refunds_all ON refunds
  USING (EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id))
  WITH CHECK (EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id));

CREATE POLICY second_opinions_read ON second_opinions FOR SELECT
  USING (EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id) OR app_admin_break_glass());
CREATE POLICY second_opinions_write ON second_opinions FOR ALL
  USING (EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id AND (a.patient_id = app_user_id() OR a.doctor_id = app_user_id() OR app_is_system())))
  WITH CHECK (EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id AND (a.patient_id = app_user_id() OR a.doctor_id = app_user_id() OR app_is_system())));

-- پرونده‌ی سلامت: مالک؛ پزشکِ دارای اشتراک فعال (فقط خواندن)؛ ادمین فقط با break-glass (فقط خواندن)
-- تابع SECURITY DEFINER از حلقهٔ RLS بین health_records و record_shares جلوگیری میکند.
CREATE OR REPLACE FUNCTION app_has_active_share(p_record uuid, p_doctor uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM record_shares s
    WHERE s.record_id = p_record AND s.doctor_id = p_doctor
      AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > now())
  )
$$;

CREATE POLICY health_records_read ON health_records FOR SELECT
  USING (
    patient_id = app_user_id()
    OR app_has_active_share(health_records.id, app_user_id())
    OR app_admin_break_glass()
  );
CREATE POLICY health_records_write ON health_records FOR ALL
  USING (patient_id = app_user_id())
  WITH CHECK (patient_id = app_user_id());

CREATE POLICY record_attachments_read ON record_attachments FOR SELECT
  USING (EXISTS (SELECT 1 FROM health_records r WHERE r.id = record_id));
CREATE POLICY record_attachments_write ON record_attachments FOR ALL
  USING (EXISTS (SELECT 1 FROM health_records r WHERE r.id = record_id AND r.patient_id = app_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM health_records r WHERE r.id = record_id AND r.patient_id = app_user_id()));

CREATE POLICY record_shares_read ON record_shares FOR SELECT
  USING (doctor_id = app_user_id()
         OR EXISTS (SELECT 1 FROM health_records r WHERE r.id = record_id AND r.patient_id = app_user_id()));
CREATE POLICY record_shares_write ON record_shares FOR ALL
  USING (EXISTS (SELECT 1 FROM health_records r WHERE r.id = record_id AND r.patient_id = app_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM health_records r WHERE r.id = record_id AND r.patient_id = app_user_id()));

-- گفتگو و پیام
CREATE POLICY conversations_read ON conversations FOR SELECT
  USING (patient_id = app_user_id() OR doctor_id = app_user_id() OR app_admin_break_glass());
CREATE POLICY conversations_write ON conversations FOR ALL
  USING (patient_id = app_user_id() OR doctor_id = app_user_id() OR app_is_system())
  WITH CHECK (patient_id = app_user_id() OR doctor_id = app_user_id() OR app_is_system());

CREATE POLICY messages_read ON messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id));
CREATE POLICY messages_insert ON messages FOR INSERT
  WITH CHECK (sender_id = app_user_id()
              AND EXISTS (SELECT 1 FROM conversations c
                          WHERE c.id = conversation_id
                            AND (c.patient_id = app_user_id() OR c.doctor_id = app_user_id())));

CREATE POLICY triage_read ON triage_sessions FOR SELECT
  USING (patient_id = app_user_id() OR app_admin_break_glass());
CREATE POLICY triage_write ON triage_sessions FOR ALL
  USING (patient_id = app_user_id()) WITH CHECK (patient_id = app_user_id());

-- ───────────── ۴) دسترسی نقش اپلیکیشن ─────────────
-- نقش nobatyar_app در docker/infra ساخته می‌شود (login، بدون superuser و بدون BYPASSRLS).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nobatyar_app') THEN
    GRANT USAGE ON SCHEMA public TO nobatyar_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nobatyar_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nobatyar_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nobatyar_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nobatyar_app;

    REVOKE ALL ON audit_chain_head FROM nobatyar_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM nobatyar_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON messages FROM nobatyar_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON appointment_status_history FROM nobatyar_app;
    REVOKE ALL ON _prisma_migrations FROM nobatyar_app;
    GRANT EXECUTE ON FUNCTION verify_audit_chain() TO nobatyar_app;
    GRANT EXECUTE ON FUNCTION app_has_active_share(uuid, uuid) TO nobatyar_app;
  ELSE
    RAISE NOTICE 'role nobatyar_app not found — grants skipped (create the role, then re-run grants)';
  END IF;
END $$;
