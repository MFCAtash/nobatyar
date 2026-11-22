-- اصلاح سیاست‌های RLS ماژول‌های ارتقایافته:
-- اعضای مکالمه باید بتوانند خلاصهٔ چت را ایجاد/به‌روزرسانی کنند (پیش‌تر فقط SYSTEM مجاز بود).
DROP POLICY IF EXISTS conversation_summaries_all ON conversation_summaries;
CREATE POLICY conversation_summaries_all ON conversation_summaries
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.patient_id = app_user_id() OR c.doctor_id = app_user_id() OR app_is_system())
    )
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.patient_id = app_user_id() OR c.doctor_id = app_user_id())
    )
  );

-- M8: پزشکِ همان نوبت باید بتواند سیاست اتاق را بنویسد (پیش‌تر فقط SYSTEM/ADMIN).
DROP POLICY IF EXISTS video_room_policies_all ON video_room_policies;
CREATE POLICY video_room_policies_all ON video_room_policies
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_id
        AND (a.patient_id = app_user_id() OR a.doctor_id = app_user_id() OR app_is_system())
    )
  )
  WITH CHECK (
    app_is_system()
    OR app_is_admin()
    OR EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_id AND a.doctor_id = app_user_id()
    )
  );
