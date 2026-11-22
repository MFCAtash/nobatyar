-- M13–M15: تکمیل سیاست‌های RLS و جدول بازخورد محصول.
-- در migration 13 این جداول RLS فعال داشتند ولی policy نداشتند ⇒ عملاً هیچ نقشی
-- (حتی SYSTEM) به آن‌ها دسترسی نداشت. اینجا policy صریح تعریف می‌شود.

CREATE TABLE IF NOT EXISTS product_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  anonymous_id text NOT NULL,
  score integer NOT NULL CHECK (score >= 0 AND score <= 10),
  step text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_feedback_at ON product_feedback(at);
CREATE INDEX IF NOT EXISTS idx_product_feedback_step ON product_feedback(step, at);

ALTER TABLE product_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_feedback FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_feedback_all ON product_feedback;
CREATE POLICY product_feedback_all ON product_feedback
  USING (app_is_system() OR app_is_admin() OR user_id = app_user_id())
  WITH CHECK (app_is_system() OR user_id = app_user_id());

-- M15: ترجیحات UI هر کاربر فقط برای خودش (و سیستم برای پشتیبانی).
CREATE TABLE IF NOT EXISTS user_ui_preferences (
  user_id uuid PRIMARY KEY,
  theme text NOT NULL DEFAULT 'system',
  font_scale double precision NOT NULL DEFAULT 1,
  contrast text NOT NULL DEFAULT 'normal',
  reduced_motion boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'fa',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_ui_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ui_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_ui_preferences_all ON user_ui_preferences;
CREATE POLICY user_ui_preferences_all ON user_ui_preferences
  USING (app_is_system() OR user_id = app_user_id())
  WITH CHECK (app_is_system() OR user_id = app_user_id());

-- قالب‌های اعلان و DLQ: فقط ادمین/سیستم
DROP POLICY IF EXISTS notification_templates_all ON notification_templates;
CREATE POLICY notification_templates_all ON notification_templates
  USING (app_is_system() OR app_is_admin())
  WITH CHECK (app_is_system() OR app_is_admin());

DROP POLICY IF EXISTS dead_letter_notices_all ON dead_letter_notices;
CREATE POLICY dead_letter_notices_all ON dead_letter_notices
  USING (app_is_system() OR app_is_admin())
  WITH CHECK (app_is_system() OR app_is_admin());

-- تحلیل فایل: موتور امنیتی با نقش SYSTEM می‌نویسد؛ ادمین فقط می‌خواند.
DROP POLICY IF EXISTS file_analyses_all ON file_analyses;
CREATE POLICY file_analyses_all ON file_analyses
  USING (app_is_system() OR app_is_admin())
  WITH CHECK (app_is_system());

-- ruleset: ادمین می‌نویسد، هر کاربر احرازشدهٔ فعال می‌خواند (نسخهٔ فعال triage).
DROP POLICY IF EXISTS triage_rule_sets_all ON triage_rule_sets;
CREATE POLICY triage_rule_sets_all ON triage_rule_sets
  USING (app_is_system() OR app_is_admin() OR app_user_id() IS NOT NULL)
  WITH CHECK (app_is_system() OR app_is_admin());

-- SLO و chaos: فقط ادمین/سیستم
DROP POLICY IF EXISTS slo_budgets_all ON slo_budgets;
CREATE POLICY slo_budgets_all ON slo_budgets
  USING (app_is_system() OR app_is_admin())
  WITH CHECK (app_is_system() OR app_is_admin());

DROP POLICY IF EXISTS chaos_drills_all ON chaos_drills;
CREATE POLICY chaos_drills_all ON chaos_drills
  USING (app_is_system() OR app_is_admin())
  WITH CHECK (app_is_system() OR app_is_admin());

-- فونل: هر کاربر احرازشده ثبت می‌کند؛ خواندن فقط ادمین/سیستم.
DROP POLICY IF EXISTS funnel_events_all ON funnel_events;
CREATE POLICY funnel_events_all ON funnel_events
  USING (app_is_system() OR app_is_admin())
  WITH CHECK (app_is_system() OR app_user_id() IS NOT NULL);

-- آزمایش‌ها: خواندن برای کاربران (فقط برای نمایش واریانت)، نوشتن ادمین.
DROP POLICY IF EXISTS experiments_all ON experiments;
CREATE POLICY experiments_all ON experiments
  USING (app_is_system() OR app_is_admin() OR app_user_id() IS NOT NULL)
  WITH CHECK (app_is_system() OR app_is_admin());

-- کلینیک‌ها: خواندن عمومیِ احرازشده، نوشتن ادمین.
DROP POLICY IF EXISTS clinics_all ON clinics;
CREATE POLICY clinics_all ON clinics
  USING (app_is_system() OR app_is_admin() OR app_user_id() IS NOT NULL)
  WITH CHECK (app_is_system() OR app_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON product_feedback TO nobatyar_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_ui_preferences TO nobatyar_app;
