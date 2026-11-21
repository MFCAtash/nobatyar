# ADR 0003 — SSE چند-instance با Redis pub/sub و بازیابی از DB

**وضعیت:** پذیرفته‌شده

**زمینه:** اعلان‌ها با `Map<userId, Subject>` در حافظه‌ی هر پروسه تحویل می‌شدند؛ با بیش از یک نمونه‌ی API، اعلانِ ساخته‌شده در نمونه‌ی A به کاربرِ متصل به B نمی‌رسید. چت هم رویدادها را فقط در همان پروسه emit می‌کرد.

**تصمیم**
- اعلان همچنان «اول در DB» ذخیره می‌شود (منبع حقیقت) و سپس روی کانال Redis `nb:notif:user:<userId>` منتشر می‌شود.
- هر پروسه «یک» اتصال subscriber (جدا از publisher) دارد و کانال کاربر را فقط تا وقتی SSE ی محلی دارد subscribe می‌کند (refcount).
- Redis pub/sub تضمین تحویل ندارد؛ پس `id` ی هر رویداد SSE همان id ی اعلان است و کلاینت با `Last-Event-ID` موارد از دست‌رفته را از DB می‌گیرد. ارزان‌ترین راهِ اطمینان از رسیدن اعلان است (بدون Redis Streams/صف جداگانه).
- هر ۲۵ ثانیه heartbeat (کامنت SSE) و `proxy_buffering off` + `X-Accel-Buffering: no` روی reverse proxy.
- چت: `@socket.io/redis-adapter`؛ انتقال فقط websocket ⇒ بدون sticky session.
- کلاینت وب به‌جای `EventSource` از fetch استفاده می‌کند چون EventSource هدر Authorization نمی‌فرستد و توکن نباید در URL بیاید.

**پیامد:** قطع Redis اعلان را گم نمی‌کند (تأخیر تا reconnect)؛ هزینه: یک اتصال Redis اضافه به‌ازای پروسه، و پارسر SSE در کلاینت.
