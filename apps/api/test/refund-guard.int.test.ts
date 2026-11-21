/**
 * تست یکپارچه‌ی تریگر/قیدهای استرداد (prisma/sql/phase13-refunds.sql): سقف مبلغ، تغییرناپذیری، نهایی‌بودن PROCESSED، بدون DELETE.
 * قرارداد مثل payment-gateway.int.test.ts (TEST_OWNER_URL / TEST_APP_URL؛ بدون آن‌ها skip).
 * ⚠️ در محیط ساخت (بدون Postgres) اجرا نشده؛ CI (job ی integration) آن را اجرا می‌کند.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER = process.env.TEST_OWNER_URL, APP = process.env.TEST_APP_URL;
const d = OWNER && APP ? describe : describe.skip;

d("استرداد وجه — تریگرهای DB", () => {
  let owner: pg.Pool, app: pg.Pool;
  const P1 = randomUUID(), D1 = randomUUID(), APPT = randomUUID(), PAY = randomUUID(), ATT = randomUUID(), DUP = randomUUID();

  async function sys<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await app.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.user_id','',true), set_config('app.role','SYSTEM',true), set_config('app.break_glass','off',true)");
      const r = await fn(c);
      await c.query("ROLLBACK"); // هر تست خودش را برمی‌گرداند؛ نتیجه در همان تراکنش سنجیده می‌شود
      return r;
    } catch (e) { await c.query("ROLLBACK").catch(() => undefined); throw e; } finally { c.release(); }
  }
  const fails = (fn: (c: pg.PoolClient) => Promise<unknown>) => sys(fn).then(() => false, () => true);
  const ins = (c: pg.PoolClient, amount: number, attempt: string | null = null, status = "PENDING") =>
    c.query("INSERT INTO refunds (id, payment_id, attempt_id, amount_rial, reason, status, updated_at) VALUES ($1,$2,$3,$4,'T',$5::\"RefundStatus\", now()) RETURNING id", [randomUUID(), PAY, attempt, amount, status]);

  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: OWNER }); app = new pg.Pool({ connectionString: APP });
    await owner.query("INSERT INTO users (id, phone_hash, phone_enc, role, updated_at) VALUES ($1,$2,'\\x00','PATIENT'::\"Role\", now()),($3,$4,'\\x00','DOCTOR'::\"Role\", now())", [P1, `h-${P1}`, D1, `h-${D1}`]);
    await owner.query("INSERT INTO patient_profiles (user_id, full_name) VALUES ($1,'p')", [P1]);
    await owner.query("INSERT INTO doctor_profiles (user_id, full_name, is_listed) VALUES ($1,'d',true)", [D1]);
    await owner.query("INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, status, kind, price_rial, updated_at) VALUES ($1,$2,$3, now()+interval '2 days', now()+interval '2 days 20 minutes','CANCELLED_BY_PATIENT','VIDEO',1000000, now())", [APPT, D1, P1]);
    await owner.query("INSERT INTO payments (id, appointment_id, idempotency_key, amount_rial, status, gateway, paid_at, updated_at) VALUES ($1,$2,$3,1000000,'PAID','ZARINPAL',now(),now())", [PAY, APPT, `k-${PAY}`]);
    await owner.query("INSERT INTO payment_attempts (id, payment_id, gateway, authority, amount_rial, status, ref_id, verified_at, updated_at) VALUES ($1,$2,'ZARINPAL','A0001',1000000,'VERIFIED','R1', now(), now()),($3,$2,'ZIBAL','Z0002',400000,'VERIFIED','R2', now(), now())", [ATT, PAY, DUP]);
  });
  afterAll(async () => {
    await owner.query("SET session_replication_role = replica").catch(() => undefined);
    for (const t of ["refunds WHERE payment_id", "payment_attempts WHERE payment_id", "payments WHERE id"]) await owner.query(`DELETE FROM ${t}=$1`, [PAY]).catch(() => undefined);
    await owner.end(); await app.end();
  });

  it("مبلغ صفر/منفی رد می‌شود", async () => {
    expect(await fails((c) => ins(c, 0))).toBe(true);
    expect(await fails((c) => ins(c, -5))).toBe(true);
  });

  it("سقف: مجموع استردادهای غیر-FAILED ≤ مبلغ پرداخت", async () => {
    expect(await fails(async (c) => { await ins(c, 600_000); await ins(c, 400_000); })).toBe(false);
    expect(await fails(async (c) => { await ins(c, 600_000); await ins(c, 400_001); })).toBe(true);
    // FAILED در سقف حساب نمی‌شود
    expect(await fails(async (c) => { await ins(c, 900_000, null, "FAILED"); await ins(c, 1_000_000); })).toBe(false);
  });

  it("پرداخت تکراری: سقف به‌ازای همان تلاش (۴۰۰٬۰۰۰) است، نه Payment", async () => {
    expect(await fails((c) => ins(c, 400_000, DUP))).toBe(false);
    expect(await fails((c) => ins(c, 400_001, DUP))).toBe(true);
  });

  it("ستون‌های هویتی تغییرناپذیرند و DELETE ممنوع است", async () => {
    expect(await fails(async (c) => { const { rows } = await ins(c, 1000); await c.query("UPDATE refunds SET amount_rial=2000 WHERE id=$1", [rows[0].id]); })).toBe(true);
    expect(await fails(async (c) => { const { rows } = await ins(c, 1000); await c.query("UPDATE refunds SET reason='X' WHERE id=$1", [rows[0].id]); })).toBe(true);
    expect(await fails(async (c) => { const { rows } = await ins(c, 1000); await c.query("DELETE FROM refunds WHERE id=$1", [rows[0].id]); })).toBe(true);
  });

  it("PROCESSED نیازمند مرجع/زمان و نهایی است", async () => {
    expect(await fails((c) => ins(c, 1000, null, "PROCESSED"))).toBe(true); // بدون external_ref/processed_at
    expect(await fails(async (c) => {
      const { rows } = await ins(c, 1000);
      await c.query("UPDATE refunds SET status='PROCESSED', external_ref='R', processed_at=now() WHERE id=$1", [rows[0].id]);
      await c.query("UPDATE refunds SET status='FAILED' WHERE id=$1", [rows[0].id]);
    })).toBe(true);
    expect(await fails(async (c) => {
      const { rows } = await ins(c, 1000);
      await c.query("UPDATE refunds SET status='PROCESSED', external_ref='R', processed_at=now() WHERE id=$1", [rows[0].id]);
    })).toBe(false);
  });

  it("خلاصه", () => { expect(true).toBe(true); });
});
