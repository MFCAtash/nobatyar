/**
 * فاز ۱۷ — تست یکپارچه: ابطال فوری نشست (sid)، Idempotency-Key، Outbox (SKIP LOCKED)، قید DB ی Maker/Checker.
 * قرارداد مثل auth.int.test.ts (TEST_OWNER_URL / TEST_APP_URL؛ بدون آن‌ها skip).
 * ⚠️ در محیط ساخت (بدون Postgres/Redis) اجرا نشده؛ CI (job ی integration) اجرا می‌کند.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER = process.env.TEST_OWNER_URL;
const APP = process.env.TEST_APP_URL;
const d = OWNER && APP ? describe : describe.skip;

d("backend hardening (e2e)", () => {
  let app: INestApplication;
  let owner: pg.Pool;
  const codes = new Map<string, string>();
  const b64 = () => randomBytes(32).toString("base64");
  const CSRF = { "X-Nobatyar-Csrf": "1" };
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let phoneSeq = Math.floor(Math.random() * 9_000_000) + 1_000_000;
  const newPhone = () => `0913${String(phoneSeq++).padStart(7, "0")}`;
  const KEY = () => randomUUID();

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: "test", APP_DATABASE_URL: APP, DATABASE_URL: APP,
      FIELD_KEYS: `1:${b64()}`, FIELD_KEY_ACTIVE: "1", BLIND_INDEX_KEY: b64(),
      JWT_ACCESS_SECRET: b64(), OTP_SECRET: b64(), SMS_PROVIDER: "console",
      OTP_PER_IP_HOURLY: "10000", VERIFY_PER_IP_10MIN: "10000", REFRESH_PER_IP_10MIN: "10000", OTP_RESEND_COOLDOWN_SEC: "1", OTP_PER_PHONE_HOURLY: "100", OTP_GLOBAL_DAILY_CAP: "100000",
    });
    owner = new pg.Pool({ connectionString: OWNER });
    const { AppModule } = await import("../src/app.module");
    const { KV_STORE, InMemoryKv } = await import("../src/redis/kv-store");
    const { SMS_PROVIDER } = await import("../src/sms/sms.provider");
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KV_STORE).useValue(new InMemoryKv())
      .overrideProvider(SMS_PROVIDER).useValue({ sendOtp: async (p: string, c: string) => void codes.set(p, c) })
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });
  afterAll(async () => { await app?.close(); await owner?.end(); });

  const api = () => request(app.getHttpServer());

  async function login(phone: string) {
    await api().post("/api/v1/auth/otp/request").send({ phone }).expect(202);
    const { normalizeIranMobile } = await import("../src/crypto");
    const code = codes.get(normalizeIranMobile(phone)!)!;
    const res = await api().post("/api/v1/auth/otp/verify").send({ phone, code }).expect(200);
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("nb_refresh="))!;
    return { access: res.body.accessToken as string, refreshCookie: cookie.split(";")[0] };
  }

  async function makeAdmin() {
    const { FieldCrypto, aad, normalizeIranMobile } = await import("../src/crypto");
    const crypto = FieldCrypto.fromEnv();
    const phone = newPhone();
    const id = randomUUID();
    const norm = normalizeIranMobile(phone)!;
    await owner.query(`INSERT INTO users (id, phone_hash, phone_enc, role, updated_at) VALUES ($1,$2,$3,'ADMIN',now())`, [id, crypto.blindIndex(norm, "phone"), crypto.encrypt(norm, aad("users", id, "phone"))]);
    return { id, ...(await login(phone)) };
  }

  describe("ابطال فوری access token", () => {
    it("logout: access token ی همان نشست همین حالا ۴۰۱ می‌شود", async () => {
      const s = await login(newPhone());
      await api().get("/api/v1/me").set(bearer(s.access)).expect(200);
      await api().post("/api/v1/auth/logout").set("Cookie", s.refreshCookie).set(CSRF).expect(204);
      await api().get("/api/v1/me").set(bearer(s.access)).expect(401);
    });

    it("logout یک دستگاه، دستگاه دیگر را باطل نمی‌کند", async () => {
      const phone = newPhone();
      const a = await login(phone);
      await new Promise((r) => setTimeout(r, 1100));
      const b = await login(phone);
      await api().post("/api/v1/auth/logout").set("Cookie", a.refreshCookie).set(CSRF).expect(204);
      await api().get("/api/v1/me").set(bearer(a.access)).expect(401);
      await api().get("/api/v1/me").set(bearer(b.access)).expect(200);
    });

    it("logout-all: همه‌ی access token ها باطل؛ ورود تازه بلافاصله معتبر", async () => {
      const phone = newPhone();
      const a = await login(phone);
      await api().post("/api/v1/auth/logout-all").set(bearer(a.access)).expect(204);
      await api().get("/api/v1/me").set(bearer(a.access)).expect(401);
      await new Promise((r) => setTimeout(r, 1100));
      const fresh = await login(phone);
      await api().get("/api/v1/me").set(bearer(fresh.access)).expect(200); // ims ی بعد از cutoff ⇒ معتبر
    });

    it("reuse ی refresh (توکن دزدیده‌شده): access token ی همان نشست هم باطل می‌شود", async () => {
      const s = await login(newPhone());
      const r1 = await api().post("/api/v1/auth/refresh").set("Cookie", s.refreshCookie).set(CSRF).expect(200);
      await api().get("/api/v1/me").set(bearer(r1.body.accessToken)).expect(200);
      await api().post("/api/v1/auth/refresh").set("Cookie", s.refreshCookie).set(CSRF).expect(401); // reuse
      await api().get("/api/v1/me").set(bearer(r1.body.accessToken)).expect(401);
    });

    it("تعلیق ادمین: توکن، refresh و ورود تازه رد می‌شود؛ بازگردانی ⇒ دوباره ممکن", async () => {
      const admin = await makeAdmin();
      const phone = newPhone();
      const u = await login(phone);
      const me = await api().get("/api/v1/me").set(bearer(u.access)).expect(200);

      await api().post(`/api/v1/admin/users/${me.body.id}/suspend`).set(bearer(admin.access)).send({ reason: "سوءاستفاده" }).expect(200);
      await api().get("/api/v1/me").set(bearer(u.access)).expect(401);
      await api().post("/api/v1/auth/refresh").set("Cookie", u.refreshCookie).set(CSRF).expect(401);
      await api().post(`/api/v1/admin/users/${me.body.id}/suspend`).set(bearer(admin.access)).send({ reason: "دوباره" }).expect(409);

      await api().post(`/api/v1/admin/users/${me.body.id}/reinstate`).set(bearer(admin.access)).expect(200);
      await new Promise((r) => setTimeout(r, 1100));
      const again = await login(phone);
      await api().get("/api/v1/me").set(bearer(again.access)).expect(200);
    });

    it("ادمین نمی‌تواند خودش را تعلیق کند", async () => {
      const admin = await makeAdmin();
      await api().post(`/api/v1/admin/users/${admin.id}/suspend`).set(bearer(admin.access)).send({ reason: "تست خودتعلیقی" }).expect(403);
    });

    it("توکن بدون sid (قدیمی) با ACCESS_REQUIRE_SID=true رد می‌شود", async () => {
      const { TokenService } = await import("../src/auth/token.service");
      const tokens = app.get(TokenService);
      const { token } = await tokens.signAccess({ sub: randomUUID(), role: "PATIENT" });
      await api().get("/api/v1/me").set(bearer(token)).expect(401);
    });
  });

  describe("Idempotency-Key روی endpoint های مالی", () => {
    it("initiate بدون هدر ⇒ ۴۰۰ idempotency_key_required؛ هدر کوتاه ⇒ idempotency_key_invalid", async () => {
      const u = await login(newPhone());
      const body = { appointmentId: randomUUID(), callbackUrl: "http://localhost:3000" };
      expect((await api().post("/api/v1/payments/initiate").set(bearer(u.access)).send(body).expect(400)).body.error).toBe("idempotency_key_required");
      expect((await api().post("/api/v1/payments/initiate").set(bearer(u.access)).set("Idempotency-Key", "short").send(body).expect(400)).body.error).toBe("idempotency_key_invalid");
    });

    it("endpoint های Maker/Checker هم هدر را اجباری می‌کنند", async () => {
      const admin = await makeAdmin();
      const id = randomUUID();
      for (const path of ["request-approval", "approval/approve", "approval/reject", "execute", "mark-processed", "mark-not-refunded"]) {
        const r = await api().post(`/api/v1/admin/refunds/${id}/${path}`).set(bearer(admin.access)).send({}).expect(400);
        expect(r.body.error).toBe("idempotency_key_required");
      }
    });

    it("رقابت ۱۰ درخواست هم‌کلید روی store: دقیقاً یکی «قفل» می‌گیرد", async () => {
      const { IDEMPOTENCY_STORE } = await import("../src/idempotency/idempotency.tokens");
      const store = app.get(IDEMPOTENCY_STORE) as import("../src/idempotency/idempotency-store").IdempotencyStore;
      const scope = `race:${randomUUID()}`, key = KEY(), now = new Date();
      const res = await Promise.all(Array.from({ length: 10 }, () => store.begin(scope, key, "fp", 60_000, 3_600_000, now)));
      expect(res.filter((r) => r.kind === "acquired")).toHaveLength(1);
      expect(res.filter((r) => r.kind === "in_progress")).toHaveLength(9);
      await store.complete(scope, key, 201, { ok: true }, now);
      expect(await store.begin(scope, key, "fp", 60_000, 3_600_000, now)).toEqual({ kind: "replay", status: 201, body: { ok: true } });
      expect(await store.begin(scope, key, "other", 60_000, 3_600_000, now)).toEqual({ kind: "mismatch" });
    });
  });

  describe("Outbox (SKIP LOCKED + trigger)", () => {
    const ins = (type = "payment.settled") => owner.query(
      `INSERT INTO outbox_events (id, type, aggregate_type, aggregate_id, payload) VALUES ($1,$2,'payment','p1','{"appointmentId":"a","patientId":"b"}') RETURNING id`, [randomUUID(), type]);

    it("دو relay هم‌زمان رویدادهای جدا می‌گیرند (بدون هم‌پوشانی)", async () => {
      const { PrismaService } = await import("../src/prisma/prisma.service");
      const { PrismaOutboxStore } = await import("../src/outbox/prisma-outbox-store");
      const prisma = app.get(PrismaService);
      const tag = `race-${randomUUID()}`;
      await owner.query("DELETE FROM outbox_events WHERE status = 'PENDING' AND aggregate_id = 'p1'");
      for (let i = 0; i < 12; i++) await owner.query(`INSERT INTO outbox_events (id, type, aggregate_type, aggregate_id, payload) VALUES ($1,'payment.settled','payment',$2,'{"appointmentId":"a","patientId":"b"}')`, [randomUUID(), tag]);
      const store = new PrismaOutboxStore(prisma);
      const [a, b] = await Promise.all([store.claim(new Date(), 8), store.claim(new Date(), 8)]);
      const ids = [...a, ...b].map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThanOrEqual(12); // مجموع دو claim همه‌ی ۱۲ رویداد را پوشش می‌دهد (۸+۴)
      expect([...a, ...b].every((e) => e.attempts === 1)).toBe(true);
      await owner.query("DELETE FROM outbox_events WHERE aggregate_id = $1", [tag]).catch(() => undefined);
    });

    it("تریگر: محتوا تغییرناپذیر، PROCESSED نهایی، PENDING حذف‌ناشدنی", async () => {
      const { rows } = await ins();
      const id = rows[0].id as string;
      await expect(owner.query("UPDATE outbox_events SET payload = '{}' WHERE id = $1", [id])).rejects.toThrow(/immutable/);
      await expect(owner.query("DELETE FROM outbox_events WHERE id = $1", [id])).rejects.toThrow(/cannot be deleted/);
      await owner.query("UPDATE outbox_events SET status='PROCESSED', processed_at=now() WHERE id = $1", [id]);
      await expect(owner.query("UPDATE outbox_events SET status='PENDING', processed_at=NULL WHERE id = $1", [id])).rejects.toThrow();
      await owner.query("DELETE FROM outbox_events WHERE id = $1", [id]); // PROCESSED قابل پاکسازی است
    });
  });

  describe("Maker/Checker — قید DB", () => {
    it("checker = maker رد می‌شود (CHECK)", async () => {
      const { FieldCrypto, aad, normalizeIranMobile } = await import("../src/crypto");
      const crypto = FieldCrypto.fromEnv();
      const uid = randomUUID(), norm = normalizeIranMobile(newPhone())!;
      await owner.query(`INSERT INTO users (id, phone_hash, phone_enc, role, updated_at) VALUES ($1,$2,$3,'ADMIN',now())`, [uid, crypto.blindIndex(norm, "phone"), crypto.encrypt(norm, aad("users", uid, "phone"))]);
      const P = randomUUID(), D = randomUUID(), APPT = randomUUID(), PAY = randomUUID(), R = randomUUID();
      await owner.query("INSERT INTO users (id, phone_hash, phone_enc, role, updated_at) VALUES ($1,$2,'\\x00','PATIENT'::\"Role\", now()),($3,$4,'\\x00','DOCTOR'::\"Role\", now())", [P, `h-${P}`, D, `h-${D}`]);
      await owner.query("INSERT INTO patient_profiles (user_id, full_name) VALUES ($1,'p')", [P]);
      await owner.query("INSERT INTO doctor_profiles (user_id, full_name, is_listed) VALUES ($1,'d',true)", [D]);
      await owner.query("INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, status, kind, price_rial, updated_at) VALUES ($1,$2,$3, now()+interval '2 days', now()+interval '2 days 20 minutes','CANCELLED_BY_PATIENT','VIDEO',1000000, now())", [APPT, D, P]);
      await owner.query("INSERT INTO payments (id, appointment_id, idempotency_key, amount_rial, status, gateway, paid_at, updated_at) VALUES ($1,$2,$3,1000000,'PAID','ZARINPAL',now(),now())", [PAY, APPT, `k-${PAY}`]);
      await owner.query("INSERT INTO refunds (id, payment_id, amount_rial, reason, status, updated_at) VALUES ($1,$2,500000,'T','PENDING'::\"RefundStatus\", now())", [R, PAY]);
      await expect(owner.query("UPDATE refunds SET approval_state='APPROVED', approval_action='EXECUTE', maker_id=$2, checker_id=$2, decided_at=now() WHERE id=$1", [R, uid])).rejects.toThrow(/refunds_maker_checker_differ/);
      await expect(owner.query("UPDATE refunds SET approval_state='REQUESTED', approval_action='EXECUTE' WHERE id=$1", [R])).rejects.toThrow(/refunds_approval_has_maker/);
      await owner.query("SET session_replication_role = replica").catch(() => undefined);
      await owner.query("DELETE FROM refunds WHERE id = $1", [R]).catch(() => undefined);
      await owner.query("DELETE FROM payments WHERE id = $1", [PAY]).catch(() => undefined);
      await owner.query("DELETE FROM appointments WHERE id = $1", [APPT]).catch(() => undefined);
    });
  });
});
