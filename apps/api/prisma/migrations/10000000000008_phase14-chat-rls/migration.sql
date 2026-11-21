-- فاز ۱۴ — چت: «خوانده‌شدن» پیام (read_at) با RLS، بدون سست‌کردن تغییرناپذیری پیام‌ها.
--
-- پیش‌زمینه: hardening.sql روی messages فقط سیاست SELECT و INSERT دارد و UPDATE/DELETE را از نقش اپ گرفته است؛
-- پس markRead (UPDATE read_at) برای نقش اپ همیشه «permission denied» می‌شد. اینجا فقط ستون read_at باز می‌شود:
--   ۱) سیاست UPDATE: فقط عضوِ مکالمه، فقط روی پیام‌های «طرف مقابل».
--   ۲) GRANT UPDATE (read_at) — ستونی؛ هیچ ستون دیگری برای نقش اپ قابل تغییر نیست.
--   ۳) trigger ی messages_guard (دفاع در عمق، مستقل از grant ها: حتی اگر بعداً GRANT ... ON ALL TABLES دوباره اجرا شود):
--      هر تغییری جز read_at رد می‌شود و read_at فقط یک‌بار (NULL → زمان) قابل تنظیم است.

DROP POLICY IF EXISTS messages_mark_read ON messages;
CREATE POLICY messages_mark_read ON messages FOR UPDATE
  USING (
    sender_id <> app_user_id()
    AND EXISTS (SELECT 1 FROM conversations c
                WHERE c.id = conversation_id
                  AND (c.patient_id = app_user_id() OR c.doctor_id = app_user_id()))
  )
  WITH CHECK (
    sender_id <> app_user_id()
    AND EXISTS (SELECT 1 FROM conversations c
                WHERE c.id = conversation_id
                  AND (c.patient_id = app_user_id() OR c.doctor_id = app_user_id()))
  );

CREATE OR REPLACE FUNCTION messages_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'read_at') IS DISTINCT FROM (to_jsonb(OLD) - 'read_at') THEN
    RAISE EXCEPTION 'messages are immutable except read_at' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    RAISE EXCEPTION 'messages.read_at is write-once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS messages_guard_trg ON messages;
CREATE TRIGGER messages_guard_trg
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_guard();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nobatyar_app') THEN
    REVOKE UPDATE ON messages FROM nobatyar_app;
    GRANT UPDATE (read_at) ON messages TO nobatyar_app;
  ELSE
    RAISE NOTICE 'role nobatyar_app not found — column grant skipped (create the role, then re-run this block)';
  END IF;
END $$;
