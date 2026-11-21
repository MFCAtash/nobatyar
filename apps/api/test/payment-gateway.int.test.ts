/**
 * تست یکپارچه‌ی قراردادهای SQL پرداخت (prisma/sql/payment-gateway.sql): RLS و تریگرهای تغییرناپذیری.
 * همان قرارداد phase8.int.test.ts: TEST_OWNER_URL (مالک) و TEST_APP_URL (نقش nobatyar_app)؛ بدون این‌ها skip می‌شود.
 * ⚠️ در محیط ساخت (بدون Postgres) اجرا نشده؛ CI (job ی integration) آن را اجرا می‌کند.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER = process.env.TEST_OWNER_URL, APP = process.env.TEST_APP_URL;
const d = OWNER && APP ? describe : describe.skip;
type Ctx = { role: string; userId?: string };

d("درگاه پرداخت — RLS و تریگرها", () => {
  let owner: pg.Pool, app: pg.Pool;
  const P1 = randomUUID(), P2 = randomUUID(), D1 = randomUUID();
  const APPT = randomUUID(), PAY = randomUUID(), ATT = randomUUID();

  async function as<T>(ctx: Ctx, fn: (c: pg.PoolClient) => Promise<T>, commit = false): Promise<T> {
    const c = await app.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.user_id',$1,true), set_config('app.role',$2,true), set_config('app.break_glass','off',true)", [ctx.userId ?? "", ctx.role]);
      const r = await fn(c);
      await c.query(commit ? "COMMIT" : "ROLLBACK");
      return r;
    } catch (e) { await c.query("ROLLBACK").catch(() => undefined); throw e; } finally { c.release(); }
  }
  const code = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code ?? "unknown");
  const rows = (ctx: Ctx, sql: string, args: unknown[] = []) => as(ctx, async (c) => (await c.query(sql, args)).rows);
  const pat = (id: string): Ctx => ({ role: "PATIENT", userId: id });
  const SYS: Ctx = { role: "SYSTEM" };

  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: OWNER }); app = new pg.Pool({ connectionString: APP });
    for (const [id, role] of [[P1, "PATIENT"], [P2, "PATIENT"], [D1, "DOCTOR"]] as const)
      await owner.query("INSERT INTO users (id, phone_hash, phone_enc, role, updated_at) VALUES ($1,$2,'\\x00',$3::\"Role\", now())", [id, `h-${id}`, role]);
    for (const id of [P1, P2]) await owner.query("INSERT INTO patient_profiles (user_id, full_name) VALUES ($1,'p')", [id]);
    await owner.query("INSERT INTO doctor_profiles (user_id, full_name, is_listed) VALUES ($1,'d',true)", [D1]);
    await owner.query("INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, status, kind, price_rial, updated_at) VALUES ($1,$2,$3, now()+interval '2 days', now()+interval '2 days 20 minutes','PENDING_PAYMENT','VIDEO',1000000, now())", [APPT, D1, P1]);
    await owner.query("INSERT INTO payments (id, appointment_id, idempotency_key, amount_rial, status, updated_at) VALUES ($1,$2,$3,1000000,'INITIATED', now())", [PAY, APPT, `k-${PAY}`]);
    await owner.query("INSERT INTO payment_attempts (id, payment_id, gateway, authority, amount_rial, updated_at) VALUES ($1,$2,'ZARINPAL','A000TEST',1000000, now())", [ATT, PAY]);
  });
  afterAll(async () => {
    await owner.query("SET session_replication_role = replica").catch(() => undefined);
    await owner.query("DELETE FROM payment_attempts WHERE payment_id=$1", [PAY]).catch(() => undefined);
    await owner.query("DELETE FROM payments WHERE id=$1", [PAY]).catch(() => undefined);
    await owner.end(); await app.end();
  });

  it("RLS: بیمارِ نوبت و پزشک و SYSTEM می‌بینند؛ بیمار دیگر نه", async () => {
    expect(await rows(pat(P1), "SELECT 1 FROM payment_attempts WHERE id=$1", [ATT])).toHaveLength(1);
    expect(await rows({ role: "DOCTOR", userId: D1 }, "SELECT 1 FROM payment_attempts WHERE id=$1", [ATT])).toHaveLength(1);
    expect(await rows(SYS, "SELECT 1 FROM payment_attempts WHERE id=$1", [ATT])).toHaveLength(1);
    expect(await rows(pat(P2), "SELECT 1 FROM payment_attempts WHERE id=$1", [ATT])).toHaveLength(0);
  });

  it("RLS: بیمار دیگر نمی‌تواند برای نوبتِ دیگری تلاش بسازد؛ SYSTEM می‌تواند", async () => {
    const ins = (c: pg.PoolClient) => c.query("INSERT INTO payment_attempts (id, payment_id, gateway, authority, amount_rial, updated_at) VALUES ($1,$2,'ZIBAL',$3,1000000, now())", [randomUUID(), PAY, `T${Date.now()}`]);
    expect(await code(as(pat(P2), ins))).not.toBeNull();
    expect(await code(as(SYS, ins))).toBeNull();
  });

  it("یکتایی (gateway, authority)", async () => {
    const dup = (c: pg.PoolClient) => c.query("INSERT INTO payment_attempts (id, payment_id, gateway, authority, amount_rial, updated_at) VALUES ($1,$2,'ZARINPAL','A000TEST',1000000, now())", [randomUUID(), PAY]);
    expect(await code(as(SYS, dup))).toBe("23505");
  });

  it("قیدها: مبلغ مثبت، VERIFIED نیازمند ref_id، PAN فقط ماسک‌شده", async () => {
    const bad = (sql: string, args: unknown[]) => code(as(SYS, (c) => c.query(sql, args)));
    expect(await bad("INSERT INTO payment_attempts (id, payment_id, gateway, authority, amount_rial, updated_at) VALUES ($1,$2,'IDPAY','X1',0, now())", [randomUUID(), PAY])).toBe("23514");
    expect(await bad("UPDATE payment_attempts SET status='VERIFIED' WHERE id=$1", [ATT])).toBe("23514");
    expect(await bad("UPDATE payment_attempts SET card_pan_masked='6037991234567890' WHERE id=$1", [ATT])).toBe("23514");
  });

  it("تغییرناپذیری: هویت تلاش عوض نمی‌شود، حذف ممنوع، پس از VERIFIED هیچ تغییر وضعیتی نیست", async () => {
    expect(await code(as(SYS, (c) => c.query("UPDATE payment_attempts SET amount_rial=1 WHERE id=$1", [ATT])))).toBe("42501");
    expect(await code(as(SYS, (c) => c.query("UPDATE payment_attempts SET authority='other' WHERE id=$1", [ATT])))).toBe("42501");
    expect(await code(as(SYS, (c) => c.query("DELETE FROM payment_attempts WHERE id=$1", [ATT])))).not.toBeNull();
    // INITIATED → VERIFIED (مجاز، با ref_id) و commit؛ سپس هر تغییر وضعیت ممنوع
    await as(SYS, (c) => c.query("UPDATE payment_attempts SET status='VERIFIED', ref_id='R1', verified_at=now() WHERE id=$1", [ATT]), true);
    expect(await code(as(SYS, (c) => c.query("UPDATE payment_attempts SET status='FAILED' WHERE id=$1", [ATT])))).toBe("42501");
    expect(await code(as(SYS, (c) => c.query("UPDATE payment_attempts SET ref_id='R2' WHERE id=$1", [ATT])))).toBe("42501");
  });

  it("Payment: مبلغ پس از شروع تغییرناپذیر است؛ نوبت هرگز عوض نمی‌شود", async () => {
    await as(SYS, (c) => c.query("UPDATE payments SET status='PAID', gateway='ZARINPAL', paid_at=now() WHERE id=$1", [PAY]), true);
    expect(await code(as(SYS, (c) => c.query("UPDATE payments SET amount_rial=5 WHERE id=$1", [PAY])))).toBe("42501");
    expect(await code(as(SYS, (c) => c.query("UPDATE payments SET appointment_id=$2 WHERE id=$1", [PAY, randomUUID()])))).not.toBeNull();
  });

  it("قید: PAID بدون gateway/paid_at معتبر نیست", async () => {
    const id = randomUUID(), appt = randomUUID();
    await owner.query("INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, status, kind, price_rial, updated_at) VALUES ($1,$2,$3, now()+interval '3 days', now()+interval '3 days 20 minutes','PENDING_PAYMENT','VIDEO',1000, now())", [appt, D1, P1]);
    expect(await code(owner.query("INSERT INTO payments (id, appointment_id, idempotency_key, amount_rial, status, updated_at) VALUES ($1,$2,$3,1000,'PAID', now())", [id, appt, randomUUID()]))).toBe("23514");
    await owner.query("SET session_replication_role = replica").catch(() => undefined);
    await owner.query("DELETE FROM appointments WHERE id=$1", [appt]).catch(() => undefined);
  });

  it("نقش app نمی‌تواند payment_attempts را DELETE کند (REVOKE)", async () => {
    expect(await code(as(SYS, (c) => c.query("DELETE FROM payment_attempts")))).toBe("42501");
  });
});
