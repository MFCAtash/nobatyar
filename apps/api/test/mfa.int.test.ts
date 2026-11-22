/**
 * تست یکپارچه‌ی MFA ادمین با سیاست ADMIN_REQUIRE_MFA=true (فاز ۱۹/۲۰).
 * الگوی apps/api/test/auth.int.test.ts: اپ واقعی Nest + Postgres، Redis حافظهای، SMS جعلی.
 * نیازمند TEST_OWNER_URL و TEST_APP_URL؛ بدون آنها تست skip میشود.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { base32Decode, totpAt } from "../src/auth/totp";

const OWNER = process.env.TEST_OWNER_URL;
const APP = process.env.TEST_APP_URL;
const d = OWNER && APP ? describe : describe.skip;

d("admin MFA policy (integration)", () => {
  let app: INestApplication;
  let owner: pg.Pool;
  const codes = new Map<string, string>();
  const b64 = () => randomBytes(32).toString("base64");
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let phoneSeq = Math.floor(Math.random() * 9_000_000) + 1_000_000;
  const newPhone = () => `0912${String(phoneSeq++).padStart(7, "0")}`;

  const api = () => request(app.getHttpServer());

  /** TOTP مطابق RFC 6238 — معادل generateCode در totp.ts (این ماژول totpAt/base32Decode صادر میکند). */
  const totp = (secret: string) => totpAt(base32Decode(secret), Date.now());
  const claims = (token: string) =>
    JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>;

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: "test", APP_DATABASE_URL: APP, DATABASE_URL: APP,
      FIELD_KEYS: `1:${b64()}`, FIELD_KEY_ACTIVE: "1", BLIND_INDEX_KEY: b64(),
      JWT_ACCESS_SECRET: b64(), OTP_SECRET: b64(), SMS_PROVIDER: "console",
      OTP_PER_IP_HOURLY: "10000", VERIFY_PER_IP_10MIN: "10000", REFRESH_PER_IP_10MIN: "10000",
      OTP_RESEND_COOLDOWN_SEC: "1", OTP_PER_PHONE_HOURLY: "100", OTP_GLOBAL_DAILY_CAP: "100000",
      ADMIN_REQUIRE_MFA: "true", // ← سیاست مورد تست
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

  async function login(phone: string) {
    await api().post("/api/v1/auth/otp/request").send({ phone }).expect(202);
    const { normalizeIranMobile } = await import("../src/crypto");
    const code = codes.get(normalizeIranMobile(phone)!)!;
    const res = await api().post("/api/v1/auth/otp/verify").send({ phone, code }).expect(200);
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("nb_refresh="))!;
    return { access: res.body.accessToken as string, refreshCookie: cookie.split(";")[0] };
  }

  /** ادمین مستقیماً توسط اتصال مالک ساخته میشود (همانند auth.int.test.ts). */
  async function createAdmin() {
    const { FieldCrypto, aad, normalizeIranMobile } = await import("../src/crypto");
    const crypto = FieldCrypto.fromEnv();
    const phone = newPhone();
    const id = randomUUID();
    const norm = normalizeIranMobile(phone)!;
    await owner.query(
      `INSERT INTO users (id, phone_hash, phone_enc, role, updated_at) VALUES ($1,$2,$3,'ADMIN',now())`,
      [id, crypto.blindIndex(norm, "phone"), crypto.encrypt(norm, aad("users", id, "phone"))],
    );
    const session = await login(phone);
    return { phone, id, ...session };
  }

  /** ادمین با MFA فعال + هم توکن قدیمی (بدون claim) و هم توکن دارای claim. */
  async function enabledAdmin() {
    const admin = await createAdmin();
    const enroll = await api().post("/api/v1/me/mfa/enroll").set(bearer(admin.access)).expect(200);
    const secret = enroll.body.secret as string;
    const recoveryCodes = enroll.body.recoveryCodes as string[];
    const enabled = await api().post("/api/v1/me/mfa/enable").set(bearer(admin.access))
      .send({ code: totp(secret) }).expect(200);
    return { ...admin, secret, recoveryCodes, mfaAccess: enabled.body.accessToken as string };
  }

  it("ادمین بدون MFA روی /me با 403 mfa_required روبهرو میشود؛ مسیرهای معاف کار میکنند و غیرادمین unaffected است", async () => {
    const admin = await createAdmin();

    const blocked = await api().get("/api/v1/me").set(bearer(admin.access)).expect(403);
    expect(blocked.body.error).toBe("mfa_required");

    // /me/mfa معاف است و وضعیت policy را نشان میدهد
    const status = await api().get("/api/v1/me/mfa").set(bearer(admin.access)).expect(200);
    expect(status.body).toMatchObject({ enabled: false, required: true, enrolledAt: null, recoveryCodesLeft: 0 });

    // /auth/mfa/verify هم معاف است: خطای mfa_required نگرفته، چون MFA فعال نشده mfa_not_enabled میدهد
    const verify = await api().post("/api/v1/auth/mfa/verify").set(bearer(admin.access))
      .send({ code: "000000" }).expect(403);
    expect(verify.body.error).toBe("mfa_not_enabled");

    const patient = await login(newPhone());
    const me = await api().get("/api/v1/me").set(bearer(patient.access)).expect(200);
    expect(me.body.role).toBe("PATIENT");
    const patientStatus = await api().get("/api/v1/me/mfa").set(bearer(patient.access)).expect(200);
    expect(patientStatus.body.required).toBe(false);
  });

  it("enroll راز، URI و ۸ کد پشتیبان برمیگرداند", async () => {
    const admin = await createAdmin();
    const r = await api().post("/api/v1/me/mfa/enroll").set(bearer(admin.access)).expect(200);

    expect(typeof r.body.secret).toBe("string");
    expect((r.body.secret as string).length).toBeGreaterThanOrEqual(16);
    expect(r.body.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(r.body.uri).toContain(r.body.secret);
    expect(r.body.recoveryCodes).toHaveLength(8);
    expect((r.body.recoveryCodes as string[]).every((c) => /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(c))).toBe(true);

    const status = await api().get("/api/v1/me/mfa").set(bearer(admin.access)).expect(200);
    expect(status.body).toMatchObject({ enabled: false, required: true, recoveryCodesLeft: 8 });
  });

  it("enable با کد نادرست 422 mfa_invalid_code میدهد و پس از ۵ شکست حساب قفل میشود", async () => {
    const admin = await createAdmin();
    const enroll = await api().post("/api/v1/me/mfa/enroll").set(bearer(admin.access)).expect(200);
    const secret = enroll.body.secret as string;
    // کدی که قطعاً با کد پنجره‌ی جاری متفاوت است
    const wrong = String((Number(totp(secret)) + 1) % 1_000_000).padStart(6, "0");

    for (let i = 0; i < 5; i++) {
      const r = await api().post("/api/v1/me/mfa/enable").set(bearer(admin.access))
        .send({ code: wrong }).expect(422);
      expect(r.body.error).toBe("mfa_invalid_code");
    }
    // قفل در پنجمین شکست ثبت میشود و از درخواست بعدی به بعد به صورت mfa_locked برگردانده میشود
    const locked = await api().post("/api/v1/me/mfa/enable").set(bearer(admin.access))
      .send({ code: totp(secret) }).expect(422);
    expect(locked.body.error).toBe("mfa_locked");
    expect(locked.body.retryAfterSec).toBeGreaterThan(0);
  });

  it("enable با TOTP معتبر توکن دارای claim مfa صادر میکند و /me دیگر 403 نمیدهد", async () => {
    const admin = await createAdmin();
    const enroll = await api().post("/api/v1/me/mfa/enroll").set(bearer(admin.access)).expect(200);
    const secret = enroll.body.secret as string;

    const enabled = await api().post("/api/v1/me/mfa/enable").set(bearer(admin.access))
      .send({ code: totp(secret) }).expect(200);
    const mfaAccess = enabled.body.accessToken as string;
    expect(claims(mfaAccess).mfa).toBe(true);
    expect(claims(mfaAccess).role).toBe("ADMIN");

    await api().get("/api/v1/me").set(bearer(mfaAccess)).expect(200);
    // توکن قدیمی (قبل از فعالسازی) همچنان فاقد claim است و چالش میخورد
    const stillBlocked = await api().get("/api/v1/me").set(bearer(admin.access)).expect(403);
    expect(stillBlocked.body.error).toBe("mfa_required");

    const status = await api().get("/api/v1/me/mfa").set(bearer(mfaAccess)).expect(200);
    expect(status.body).toMatchObject({ enabled: true, required: true, recoveryCodesLeft: 8 });
  });

  it("verify با کد پشتیبان 200 میدهد ولی مصرف دوبارهی همان کد 422 میدهد", async () => {
    const admin = await enabledAdmin();
    const code = admin.recoveryCodes[0]!;

    const first = await api().post("/api/v1/auth/mfa/verify").set(bearer(admin.access))
      .send({ code }).expect(200);
    expect(first.body.verified).toBe(true);
    expect(claims(first.body.accessToken).mfa).toBe(true);

    const reuse = await api().post("/api/v1/auth/mfa/verify").set(bearer(admin.access))
      .send({ code }).expect(422);
    expect(reuse.body.error).toBe("mfa_invalid_code");

    const status = await api().get("/api/v1/me/mfa").set(bearer(admin.mfaAccess)).expect(200);
    expect(status.body.recoveryCodesLeft).toBe(7);
  });

  it("rotate راز را عوض میکند و TOTP/کد پشتیبان قدیمی را باطل میشاند", async () => {
    const admin = await enabledAdmin();
    const oldCode = totp(admin.secret);
    const oldRecovery = admin.recoveryCodes[0]!;

    const rotated = await api().post("/api/v1/me/mfa/rotate").set(bearer(admin.mfaAccess))
      .send({ code: oldCode }).expect(200);
    const newSecret = rotated.body.secret as string;
    const newRecovery = rotated.body.recoveryCodes as string[];
    expect(newSecret).not.toBe(admin.secret);
    expect(newRecovery).toHaveLength(8);
    expect(newRecovery).not.toContain(oldRecovery);

    const oldTotp = await api().post("/api/v1/auth/mfa/verify").set(bearer(admin.access))
      .send({ code: oldCode }).expect(422);
    expect(oldTotp.body.error).toBe("mfa_invalid_code");

    const oldRecoveryRes = await api().post("/api/v1/auth/mfa/verify").set(bearer(admin.access))
      .send({ code: oldRecovery }).expect(422);
    expect(oldRecoveryRes.body.error).toBe("mfa_invalid_code");

    const fresh = await api().post("/api/v1/auth/mfa/verify").set(bearer(admin.access))
      .send({ code: totp(newSecret) }).expect(200);
    expect(claims(fresh.body.accessToken).mfa).toBe(true);
  });

  it("disable با وجود سیاست ADMIN_REQUIRE_MFA ممنوع است", async () => {
    const admin = await enabledAdmin();
    const r = await api().post("/api/v1/me/mfa/disable").set(bearer(admin.mfaAccess))
      .send({ code: totp(admin.secret) }).expect(403);
    expect(r.body.error).toBe("mfa_required_by_policy");

    const status = await api().get("/api/v1/me/mfa").set(bearer(admin.mfaAccess)).expect(200);
    expect(status.body.enabled).toBe(true);
  });

  it("غیرادمینها حتی با سیاست فعال نیاز به MFA ندارند", async () => {
    const patient = await login(newPhone());
    await api().get("/api/v1/me").set(bearer(patient.access)).expect(200);
    const status = await api().get("/api/v1/me/mfa").set(bearer(patient.access)).expect(200);
    expect(status.body).toMatchObject({ enabled: false, required: false });
  });
});
