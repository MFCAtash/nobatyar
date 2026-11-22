-- â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
-- ظپط§ط² غ²غµ â€” ظ…ط§عکظˆظ„ظ‡ط§غŒ ط§ط±طھظ‚ط§غŒط§ظپطھظ‡ M3â€“M14
-- طھظ…ط§ظ… ط¬ط¯ط§ظˆظ„ ط¯ط§ط±ط§غŒ RLSط§ظ†ط¯ط› ظ†ظˆط´طھظ† ظپظ‚ط· طھظˆط³ط· ظ…ط§ظ„ع©طŒ SYSTEM غŒط§ ADMIN.
-- â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS series_id uuid;

CREATE TABLE IF NOT EXISTS recurring_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  series_id uuid NOT NULL,
  rrule text NOT NULL,
  kind text NOT NULL DEFAULT 'VIDEO',
  next_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  occurrences integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_bookings(status, next_at);
CREATE INDEX IF NOT EXISTS idx_recurring_patient ON recurring_bookings(patient_id);

CREATE TABLE IF NOT EXISTS calendar_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  token_enc bytea NOT NULL,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  channel text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  quiet_from text,
  quiet_to text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, event_type, channel)
);

CREATE TABLE IF NOT EXISTS notification_templates (
  key text PRIMARY KEY,
  version integer NOT NULL,
  channels text NOT NULL,
  body_fa text NOT NULL,
  ab_group text,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS dead_letter_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  channel text NOT NULL,
  reason text NOT NULL,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dln_created ON dead_letter_notices(created_at);

CREATE TABLE IF NOT EXISTS file_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key text NOT NULL,
  sha256 text NOT NULL,
  mime text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes > 0),
  state text NOT NULL DEFAULT 'QUARANTINED',
  phi_flags text,
  ocr_text_key text,
  redacted_key text,
  score integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_file_analysis_key ON file_analyses(object_key);
CREATE INDEX IF NOT EXISTS idx_file_analysis_state ON file_analyses(state, created_at);

CREATE TABLE IF NOT EXISTS chat_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  text_fa text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_quick_doctor ON chat_quick_replies(doctor_id);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id uuid PRIMARY KEY,
  body_enc bytea NOT NULL,
  consent_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_room_policies (
  appointment_id uuid PRIMARY KEY,
  waiting_room boolean NOT NULL DEFAULT true,
  allow_screen_share boolean NOT NULL DEFAULT false,
  captions boolean NOT NULL DEFAULT false,
  record_consent boolean NOT NULL DEFAULT false,
  retention_hours integer
);

CREATE TABLE IF NOT EXISTS health_timeline_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  kind text NOT NULL,
  value_enc bytea NOT NULL,
  at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_patient ON health_timeline_points(patient_id, at);

CREATE TABLE IF NOT EXISTS medication_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  items_enc bytea NOT NULL,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meds_patient ON medication_reconciliations(patient_id);

CREATE TABLE IF NOT EXISTS consent_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  policy text NOT NULL,
  version text NOT NULL,
  channel text NOT NULL,
  hash text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consent_receipts ON consent_receipts(user_id, at);

CREATE TABLE IF NOT EXISTS triage_rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text UNIQUE NOT NULL,
  content_enc bytea NOT NULL,
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS second_opinion_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  specialty text NOT NULL,
  anonymous_key text UNIQUE NOT NULL,
  state text NOT NULL,
  sla_hours integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_so_case_state ON second_opinion_cases(state, created_at);

CREATE TABLE IF NOT EXISTS slo_budgets (
  service text PRIMARY KEY,
  objective double precision NOT NULL,
  burn_rate double precision NOT NULL DEFAULT 0,
  "window" text NOT NULL
);

CREATE TABLE IF NOT EXISTS chaos_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target text NOT NULL,
  result text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chaos_at ON chaos_drills(at);

CREATE TABLE IF NOT EXISTS funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id text NOT NULL,
  step text NOT NULL,
  meta_hash text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_funnel_step ON funnel_events(step, at);

CREATE TABLE IF NOT EXISTS experiments (
  key text PRIMARY KEY,
  variants text NOT NULL,
  enabled boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address_fa text NOT NULL,
  phone text NOT NULL,
  geo_lat double precision,
  geo_lng double precision,
  verified boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_clinic_name ON clinics(name);

CREATE TABLE IF NOT EXISTS doctor_workspaces (
  doctor_id uuid PRIMARY KEY,
  dashboard text NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  seats integer NOT NULL CHECK (seats > 0),
  active boolean NOT NULL DEFAULT true
);

-- â”€â”€â”€ RLS â”€â”€â”€
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'recurring_bookings','calendar_links','notification_preferences','notification_templates',
    'dead_letter_notices','file_analyses','chat_quick_replies','conversation_summaries',
    'video_room_policies','health_timeline_points','medication_reconciliations','consent_receipts',
    'triage_rule_sets','second_opinion_cases','slo_budgets','chaos_drills','funnel_events',
    'experiments','clinics','doctor_workspaces','organization_plans'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);
  END LOOP;
END $$;

-- ط¬ط¯ط§ظˆظ„ ظ…ط§ظ„ع©ظ…ط­ظˆط±
CREATE POLICY recurring_bookings_all ON recurring_bookings USING (patient_id = app_user_id() OR app_is_system() OR app_is_admin()) WITH CHECK (patient_id = app_user_id() OR app_is_system());
CREATE POLICY calendar_links_all ON calendar_links USING (user_id = app_user_id() OR app_is_system()) WITH CHECK (user_id = app_user_id() OR app_is_system());
CREATE POLICY notification_preferences_all ON notification_preferences USING (user_id = app_user_id() OR app_is_system()) WITH CHECK (user_id = app_user_id() OR app_is_system());
CREATE POLICY chat_quick_replies_all ON chat_quick_replies USING (doctor_id = app_user_id() OR app_is_system()) WITH CHECK (doctor_id = app_user_id() OR app_is_system());
CREATE POLICY health_timeline_points_all ON health_timeline_points USING (patient_id = app_user_id() OR app_is_system() OR app_is_admin()) WITH CHECK (patient_id = app_user_id() OR app_is_system());
CREATE POLICY medication_reconciliations_all ON medication_reconciliations USING (patient_id = app_user_id() OR app_is_system()) WITH CHECK (patient_id = app_user_id() OR app_is_system());
CREATE POLICY consent_receipts_all ON consent_receipts USING (user_id = app_user_id() OR app_is_system() OR app_is_admin()) WITH CHECK (user_id = app_user_id() OR app_is_system());
CREATE POLICY second_opinion_cases_all ON second_opinion_cases USING (patient_id = app_user_id() OR app_is_system() OR app_is_admin()) WITH CHECK (patient_id = app_user_id() OR app_is_system());
CREATE POLICY doctor_workspaces_all ON doctor_workspaces USING (doctor_id = app_user_id() OR app_is_system()) WITH CHECK (doctor_id = app_user_id() OR app_is_system());
CREATE POLICY video_room_policies_all ON video_room_policies USING (EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id AND (a.patient_id = app_user_id() OR a.doctor_id = app_user_id() OR app_is_system()))) WITH CHECK (app_is_system() OR app_is_admin());
CREATE POLICY conversation_summaries_all ON conversation_summaries USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND (c.patient_id = app_user_id() OR c.doctor_id = app_user_id() OR app_is_system()))) WITH CHECK (app_is_system());

-- ط¬ط¯ط§ظˆظ„ ط³غŒط³طھظ…غŒ/ط¹ظ…ظˆظ…غŒ
CREATE POLICY notification_templates_all ON notification_templates USING (true) WITH CHECK (app_is_system() OR app_is_admin());
CREATE POLICY dead_letter_notices_all ON dead_letter_notices USING (app_is_system() OR app_is_admin()) WITH CHECK (app_is_system());
CREATE POLICY file_analyses_all ON file_analyses USING (app_is_system() OR app_is_admin()) WITH CHECK (app_is_system());
CREATE POLICY triage_rule_sets_all ON triage_rule_sets USING (true) WITH CHECK (app_is_system());
CREATE POLICY slo_budgets_all ON slo_budgets USING (true) WITH CHECK (app_is_system() OR app_is_admin());
CREATE POLICY chaos_drills_all ON chaos_drills USING (app_is_system() OR app_is_admin()) WITH CHECK (app_is_system());
CREATE POLICY funnel_events_all ON funnel_events USING (app_is_system() OR app_is_admin()) WITH CHECK (true);
CREATE POLICY experiments_all ON experiments USING (true) WITH CHECK (app_is_system() OR app_is_admin());
CREATE POLICY clinics_all ON clinics USING (true) WITH CHECK (app_is_system() OR app_is_admin());
CREATE POLICY organization_plans_all ON organization_plans USING (app_is_system() OR app_is_admin()) WITH CHECK (app_is_system() OR app_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nobatyar_app;
