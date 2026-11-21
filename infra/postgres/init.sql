-- اجرا فقط در اولین راه‌اندازی‌ی volume
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid و توابع رمزنگاری
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- برای EXCLUDE constraint نوبت‌ها (فاز ۱)
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- جستجوی فازی نام پزشک/تخصص
