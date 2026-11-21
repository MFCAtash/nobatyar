-- ═══════════════════════════════════════════════════════════════
-- فاز ۱۸ (مانیتورینگ و عملیات): صفحه‌ی وضعیت عمومی — قیدهای سطح DB
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE status_incidents
  ADD CONSTRAINT status_incident_resolved_consistent CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL)),
  ADD CONSTRAINT status_incident_title_len CHECK (char_length(title_fa) BETWEEN 3 AND 150);
ALTER TABLE status_incident_updates
  ADD CONSTRAINT status_incident_update_body_len CHECK (char_length(body_fa) BETWEEN 3 AND 1000);

-- تاریخچه‌ی عمومی تغییرناپذیر است: به‌روزرسانی/حذف ردیف‌های update ممنوع (فقط افزودن)
CREATE OR REPLACE FUNCTION status_incident_updates_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'status incident updates are append-only'; END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS status_incident_updates_append_only_trg ON status_incident_updates;
CREATE TRIGGER status_incident_updates_append_only_trg BEFORE UPDATE ON status_incident_updates FOR EACH ROW EXECUTE FUNCTION status_incident_updates_append_only();
