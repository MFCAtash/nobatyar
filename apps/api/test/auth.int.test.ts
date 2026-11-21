/**
 * جریان کامل احراز هویت روی اپ واقعی (Nest + Postgres). Redis با نسخه‌ی حافظه‌ای جایگزین می‌شود.
 * نیازمند TEST_OWNER_URL و TEST_APP_URL (مثل db.int.test.ts).
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

d("auth flow (e2e)", () => {
  let app: INestApplication;
  let owner: pg.Pool;
  const codes = new Map<string, string>();
  const b64 = () => randomBytes(32).toString("base64");
  const CSRF = { "X-Nobatyar-Csrf": "1" };
  let phoneSeq = Math.floor(Math.random() * 9_000_000) + 1_000_000;
  const newPhone = () => `0912${String(phoneSeq++).padStart(7, "0")}`;

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

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  const api = () => request(app.getHttpServer());

  async function login(phone: string) {
    await api().post("/api/v1/auth/otp/request").send({ phone }).expect(202);
    const { normalizeIranMobile } = await import("../src/crypto");
    const code = codes.get(normalizeIranMobile(phone)!)!;
    const res = await api().post("/api/v1/auth/otp/verify").send({ phone, code }).expect(200);
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("nb_refresh="))!;
    return { access: res.body.accessToken as string, refreshCookie: cookie.split(";")[0] };
  }
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  it("health is public; everything else needs a token", async () => {
    await api().get("/api/v1/health").expect(200);
    await api().get("/api/v1/me").expect(401);
    await api().get("/api/v1/me").set(bearer("garbage")).expect(401);
  });

  it("OTP request gives the same response for invalid numbers (no enumeration)", async () => {
    const a = await api().post("/api/v1/auth/otp/request").send({ phone: "12345678901" }).expect(202);
    const b = await api().post("/api/v1/auth/otp/request").send({ phone: newPhone() }).expect(202);
    expect(a.body).toEqual(b.body);
  });

  it("logs in, creates a PATIENT, and /me masks the phone", async () => {
    const phone = newPhone();
    const { access, refreshCookie } = await login(phone);
    expect(refreshCookie).toMatch(/^nb_refresh=/);
    const me = await api().get("/api/v1/me").set(bearer(access)).expect(200);
    expect(me.body.role).toBe("PATIENT");
    expect(me.body.phoneMasked).toContain("***");
    expect(JSON.stringify(me.body)).not.toContain(phone);
  });

  it("rejects a wrong code; refresh cookie is HttpOnly + SameSite=Strict + scoped path", async () => {
    const phone = newPhone();
    await api().post("/api/v1/auth/otp/request").send({ phone }).expect(202);
    await api().post("/api/v1/auth/otp/verify").send({ phone, code: "000000" }).expect(401);

    const p2 = newPhone();
    await api().post("/api/v1/auth/otp/request").send({ phone: p2 }).expect(202);
    const { normalizeIranMobile } = await import("../src/crypto");
    const res = await api().post("/api/v1/auth/otp/verify").send({ phone: p2, code: codes.get(normalizeIranMobile(p2)!) }).expect(200);
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("nb_refresh="))!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/v1/auth");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("refresh requires CSRF header, rotates, and detects reuse (revokes the family)", async () => {
    const { refreshCookie } = await login(newPhone());

    await api().post("/api/v1/auth/refresh").set("Cookie", refreshCookie).expect(401); // بدون هدر CSRF

    const r1 = await api().post("/api/v1/auth/refresh").set("Cookie", refreshCookie).set(CSRF).expect(200);
    const newCookie = (r1.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("nb_refresh="))!.split(";")[0];
    expect(newCookie).not.toBe(refreshCookie);

    // استفاده‌ی مجدد از توکن قدیمی ⇒ 401 و ابطال توکن جدید هم
    await api().post("/api/v1/auth/refresh").set("Cookie", refreshCookie).set(CSRF).expect(401);
    await api().post("/api/v1/auth/refresh").set("Cookie", newCookie).set(CSRF).expect(401);
  });

  it("logout-all revokes every session", async () => {
    const phone = newPhone();
    const a = await login(phone);
    await new Promise((r) => setTimeout(r, 1100)); // عبور از cooldown ارسال مجدد (۱ ثانیه در تست)
    const b = await login(phone);
    await api().post("/api/v1/auth/logout-all").set(bearer(a.access)).expect(204);
    await api().post("/api/v1/auth/refresh").set("Cookie", b.refreshCookie).set(CSRF).expect(401);
  });

  it("role guard: patient cannot reach admin endpoints", async () => {
    const { access } = await login(newPhone());
    await api().get("/api/v1/admin/doctor-verifications").set(bearer(access)).expect(403);
  });

  it("doctor application → admin approval → DOCTOR role after refresh", async () => {
    const { FieldCrypto, aad, normalizeIranMobile } = await import("../src/crypto");
    const crypto = FieldCrypto.fromEnv();

    // ادمین مستقیماً با نقش مالک ساخته می‌شود (در عمل: seed/فرایند داخلی)
    const adminPhone = newPhone();
    const adminId = randomUUID();
    const norm = normalizeIranMobile(adminPhone)!;
    await owner.query(
      `INSERT INTO users (id, phone_hash, phone_enc, role, updated_at) VALUES ($1,$2,$3,'ADMIN',now())`,
      [adminId, crypto.blindIndex(norm, "phone"), crypto.encrypt(norm, aad("users", adminId, "phone"))],
    );
    const admin = await login(adminPhone);

    const user = await login(newPhone());
    const me = await api().get("/api/v1/me").set(bearer(user.access)).expect(200);

    const badKey = { fullName: "دکتر تست", medicalCouncilNo: "۱۲۳۴۵۶", documentKey: `verification/${randomUUID()}/x.pdf` };
    await api().post("/api/v1/doctors/applications").set(bearer(user.access)).send(badKey).expect(400);

    const app1 = await api().post("/api/v1/doctors/applications").set(bearer(user.access))
      .send({ ...badKey, documentKey: `verification/${me.body.id}/license.pdf`, medicalCouncilNo: String(100000 + Math.floor(Math.random() * 899_999)) }).expect(201);
    await api().post("/api/v1/doctors/applications").set(bearer(user.access))
      .send({ ...badKey, documentKey: `verification/${me.body.id}/license2.pdf` }).expect(409); // pending

    const pending = await api().get("/api/v1/admin/doctor-verifications").set(bearer(admin.access)).expect(200);
    expect(pending.body.some((v: { id: string }) => v.id === app1.body.id)).toBe(true);

    await api().post(`/api/v1/admin/doctor-verifications/${app1.body.id}/approve`).set(bearer(admin.access)).expect(200);
    await api().post(`/api/v1/admin/doctor-verifications/${app1.body.id}/approve`).set(bearer(admin.access)).expect(409);

    // نقش جدید با refresh بعدی در توکن می‌آید
    const r = await api().post("/api/v1/auth/refresh").set("Cookie", user.refreshCookie).set(CSRF).expect(200);
    const me2 = await api().get("/api/v1/me").set(bearer(r.body.accessToken)).expect(200);
    expect(me2.body.role).toBe("DOCTOR");
    expect(me2.body.doctor.isListed).toBe(true);

    // پزشک دیگر نمی‌تواند دوباره درخواست دهد
    await api().post("/api/v1/doctors/applications").set(bearer(r.body.accessToken))
      .send({ ...badKey, documentKey: `verification/${me.body.id}/x.pdf` }).expect(403);
  });

  it("consents are idempotent and revocable", async () => {
    const { access } = await login(newPhone());
    const body = { type: "HEALTH_DATA_PROCESSING", version: "1.0" };
    expect((await api().post("/api/v1/me/consents").set(bearer(access)).send(body).expect(200)).body.status).toBe("granted");
    expect((await api().post("/api/v1/me/consents").set(bearer(access)).send(body).expect(200)).body.status).toBe("already_granted");
    expect((await api().post("/api/v1/me/consents/HEALTH_DATA_PROCESSING/revoke").set(bearer(access)).expect(200)).body.count).toBe(1);
  });
});
