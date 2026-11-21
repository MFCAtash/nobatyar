-- ═══════════════════════════════════════════════════════════════
-- نوبتیار — فاز ۷: RLS اتاق‌های ویدئو و رویدادهای حضور
-- پس از مهاجرت schema فاز ۷ (video_rooms گسترش‌یافته + video_events) اعمال می‌شود.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE video_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_rooms FORCE ROW LEVEL SECURITY;

-- خواندن: هر کس نوبت را ببیند (RLS جدول appointments اعمال می‌شود)
CREATE POLICY video_rooms_read ON video_rooms FOR SELECT
  USING (EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id));

-- نوشتن: فقط دو طرفِ نوبت (ساخت اتاق هنگام اولین ورود) یا SYSTEM (webhook / بستن اتاق)
CREATE POLICY video_rooms_write ON video_rooms FOR ALL
  USING (EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id
                 AND (a.patient_id = app_user_id() OR a.doctor_id = app_user_id() OR app_is_system())))
  WITH CHECK (EXISTS (SELECT 1 FROM appointments a WHERE a.id = appointment_id
                 AND (a.patient_id = app_user_id() OR a.doctor_id = app_user_id() OR app_is_system())));

ALTER TABLE video_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_events FORCE ROW LEVEL SECURITY;

CREATE POLICY video_events_read ON video_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM video_rooms r WHERE r.id = room_id));

-- فقط webhook (زمینه‌ی SYSTEM) می‌نویسد؛ هیچ کاربری نمی‌تواند حضور جعلی ثبت کند
CREATE POLICY video_events_insert ON video_events FOR INSERT
  WITH CHECK (app_is_system());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nobatyar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON video_rooms TO nobatyar_app;
    GRANT SELECT, INSERT ON video_events TO nobatyar_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON video_events FROM nobatyar_app;  -- append-only
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nobatyar_app;
  END IF;
END $$;
