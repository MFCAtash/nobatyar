# ADR 0004 — Docker چندمرحله‌ای، migration جدا، Caddy برای TLS

**وضعیت:** پذیرفته‌شده

**تصمیم**
- یک `Dockerfile` با سه target (`api`, `web`, `migrate`) روی `node:20-alpine`؛ `turbo prune --docker` برای هر app تا کش لایه‌ها مستقل بماند؛ همه‌ی imageها با کاربر غیر root (`node`) و `tini` به‌عنوان PID 1 (SIGTERM ⇒ خاموشی تمیز SSE/چت).
- Next.js با `output: "standalone"` (+ `outputFileTracingRoot` برای monorepo): image ی web فقط فایل‌های ردیابی‌شده را دارد.
- image ی `api` فقط وابستگی‌های production دارد و کد فقط‌خواندنی است (`read_only`، `cap_drop: ALL`).
- مهاجرت «job ی جدا» است (target ی `migrate`، `prisma migrate deploy`)؛ API/worker با `service_completed_successfully` پس از آن بالا می‌آیند. دلیل: بالا آمدن هم‌زمان چند نمونه‌ی API نباید مهاجرت هم‌زمان اجرا کند. کاربر «مالک» فقط به job ی مهاجرت داده می‌شود؛ API با نقش بدون BYPASSRLS کار می‌کند.
- `worker` یک سرویس جدا با `ENABLE_WORKERS=true` است و API ها (`--scale api=N`) job زمان‌بندی‌شده اجرا نمی‌کنند.
- Caddy: TLS خودکار، upstream ی پویا (`dynamic a`) برای چند نمونه‌ی API، `flush_interval -1` برای SSE. (nginx: `infra/nginx/nobatyar.conf` برای کسانی که از nginx استفاده می‌کنند.)

**پیامد:** `API_URL` و `LIVEKIT_PUBLIC_URL` در زمان build داخل خروجی Next ثبت می‌شوند ⇒ تغییرشان rebuild ی web می‌خواهد. `pnpm-lock.yaml` باید commit شود. MinIO در compose ی production نیست چون `StorageService` فعلاً stub است.
