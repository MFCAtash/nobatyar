/**
 * تست‌های یکپارچه‌ی امنیت فاز ۸ (RLS + تریگرها). همان قرارداد db.int.test.ts:
 *   TEST_OWNER_URL (مالک) و TEST_APP_URL (نقش nobatyar_app)؛ بدون این‌ها skip می‌شود.
 * ⚠️ این فایل در محیط ساخت اجرا نشده (Postgres نبود) — پیش از اتکا، یک‌بار اجرا و اصلاح شود.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER = process.env.TEST_OWNER_URL, APP = process.env.TEST_APP_URL;
const d = OWNER && APP ? describe : describe.skip;
type Ctx = { role: string; userId?: string; breakGlass?: boolean };
const B = Buffer.from([0]);

d("phase 8 — RLS و تریگرها", () => {
  let owner: pg.Pool, app: pg.Pool;
  const P1 = randomUUID(), P2 = randomUUID(), D1 = randomUUID(), D2 = randomUUID();
  const APPT = randomUUID(), SOAP = randomUUID(), RX = randomUUID(), SO = randomUUID();

  async function as<T>(ctx: Ctx, fn: (c: pg.PoolClient) => Promise<T>, commit = false): Promise<T> {
    const c = await app.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.user_id',$1,true), set_config('app.role',$2,true), set_config('app.break_glass',$3,true)", [ctx.userId ?? "", ctx.role, ctx.breakGlass ? "on" : "off"]);
      const r = await fn(c);
      await c.query(commit ? "COMMIT" : "ROLLBACK");
      return r;
    } catch (e) { await c.query("ROLLBACK").catch(() => undefined); throw e; } finally { c.release(); }
  }
  const code = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code ?? "unknown");
  const rows = (ctx: Ctx, sql: string, args: unknown[] = []) => as(ctx, async (c) => (await c.query(sql, args)).rows);
  const pat = (id: string): Ctx => ({ role: "PATIENT", userId: id });
  const doc = (id: string): Ctx => ({ role: "DOCTOR", userId: id });
  const SYS: Ctx = { role: "SYSTEM" };
  const future = () => new Date(Date.now() + 48 * 3600_000).toISOString();

  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: OWNER }); app = new pg.Pool({ connectionString: APP });
    for (const [id, role] of [[P1, "PATIENT"], [P2, "PATIENT"], [D1, "DOCTOR"], [D2, "DOCTOR"]] as const)
      await owner.query("INSERT INTO users (id, phone_hash, phone_enc, role, updated_at) VALUES ($1,$2,'\\x00',$3::\"Role\", now())", [id, `h-${id}`, role]);
    for (const id of [P1, P2]) await owner.query("INSERT INTO patient_profiles (user_id, full_name) VALUES ($1,'p')", [id]);
    for (const id of [D1, D2]) await owner.query("INSERT INTO doctor_profiles (user_id, full_name, is_listed, accepts_second_opinions) VALUES ($1,'d',true,true)", [id]);
    await owner.query("INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, status, kind, price_rial, updated_at) VALUES ($1,$2,$3, now()-interval '2 hours', now()-interval '1 hour','COMPLETED','VIDEO',1000, now())", [APPT, D1, P1]);
    await owner.query("INSERT INTO patient_health_profiles (patient_id, data_enc, updated_at) VALUES ($1,$2, now())", [P1, B]);
  });
  afterAll(async () => {
    // تریگرها حذف را می‌بندند؛ پاک‌سازی با نادیده‌گرفتن تریگر (نیازمند superuser)
    await owner.query("SET session_replication_role = replica").catch(() => undefined);
    await owner.query("DELETE FROM second_opinions WHERE patient_id=$1", [P1]).catch(() => undefined);
    await owner.query("DELETE FROM prescriptions WHERE patient_id=$1", [P1]).catch(() => undefined);
    await owner.query("DELETE FROM visit_summaries WHERE patient_id=$1", [P1]).catch(() => undefined);
    await owner.query("DELETE FROM soap_notes WHERE patient_id=$1", [P1]).catch(() => undefined);
    await owner.end(); await app.end();
  });

  it("پروفایل سلامت: بیمار و پزشکِ دارای نوبت اخیر می‌بینند؛ پزشک غریبه و بیمار دیگر نه", async () => {
    expect(await rows(pat(P1), "SELECT 1 FROM patient_health_profiles")).toHaveLength(1);
    expect(await rows(doc(D1), "SELECT 1 FROM patient_health_profiles")).toHaveLength(1);
    expect(await rows(doc(D2), "SELECT 1 FROM patient_health_profiles")).toHaveLength(0);
    expect(await rows(pat(P2), "SELECT 1 FROM patient_health_profiles")).toHaveLength(0);
  });

  it("SOAP: فقط پزشک همان نوبت می‌نویسد؛ بیمار/پزشک دیگر نمی‌بینند", async () => {
    const ins = (u: string) => (c: pg.PoolClient) => c.query("INSERT INTO soap_notes (id, appointment_id, doctor_id, patient_id, content_enc, updated_at) VALUES ($1,$2,$3,$4,$5, now())", [SOAP, APPT, u, P1, B]);
    expect(await code(as(doc(D2), ins(D2)))).not.toBeNull();     // پزشک دیگر
    expect(await code(as(pat(P1), ins(D1)))).not.toBeNull();     // بیمار
    await as(doc(D1), ins(D1), true);
    expect(await rows(doc(D1), "SELECT 1 FROM soap_notes")).toHaveLength(1);
    expect(await rows(pat(P1), "SELECT 1 FROM soap_notes")).toHaveLength(0);
    expect(await rows(doc(D2), "SELECT 1 FROM soap_notes")).toHaveLength(0);
  });

  it("SOAP امضاشده تغییرناپذیر است؛ حذف ممنوع است", async () => {
    await as(doc(D1), (c) => c.query("UPDATE soap_notes SET status='SIGNED', signed_at=now(), version=2 WHERE id=$1", [SOAP]), true);
    expect(await code(as(doc(D1), (c) => c.query("UPDATE soap_notes SET content_enc=$2 WHERE id=$1", [SOAP, Buffer.from([1])])))).toBe("42501");
    expect(await code(as(doc(D1), (c) => c.query("DELETE FROM soap_notes WHERE id=$1", [SOAP])))).not.toBeNull();
  });

  it("خلاصه‌ی ویزیت: بیمار می‌بیند، بیمار دیگر نه؛ پزشک نظر دوم فقط با اجازه", async () => {
    await as(doc(D1), (c) => c.query("INSERT INTO visit_summaries (id, appointment_id, doctor_id, patient_id, summary_enc) VALUES ($1,$2,$3,$4,$5)", [randomUUID(), APPT, D1, P1, B]), true);
    expect(await rows(pat(P1), "SELECT 1 FROM visit_summaries")).toHaveLength(1);
    expect(await rows(pat(P2), "SELECT 1 FROM visit_summaries")).toHaveLength(0);
    expect(await rows(doc(D2), "SELECT 1 FROM visit_summaries")).toHaveLength(0);
    expect(await code(as(pat(P1), (c) => c.query("UPDATE visit_summaries SET summary_enc=$1", [B])))).not.toBeNull(); // REVOKE UPDATE
  });

  it("نسخه: فقط پزشک نوبت صادر می‌کند؛ اقلام تغییرناپذیر؛ ابطال با زمان و دلیل", async () => {
    const ins = (u: string) => (c: pg.PoolClient) => c.query("INSERT INTO prescriptions (id, number, appointment_id, doctor_id, patient_id, items_enc, valid_until) VALUES ($1,$2,$3,$4,$5,$6,$7)", [RX, "NV-TEST-0001", APPT, u, P1, B, future()]);
    expect(await code(as(doc(D2), ins(D2)))).not.toBeNull();
    await as(doc(D1), ins(D1), true);
    expect(await rows(pat(P1), "SELECT 1 FROM prescriptions")).toHaveLength(1);
    expect(await rows(pat(P2), "SELECT 1 FROM prescriptions")).toHaveLength(0);
    expect(await code(as(doc(D1), (c) => c.query("UPDATE prescriptions SET items_enc=$2 WHERE id=$1", [RX, Buffer.from([9])])))).toBe("42501");
    expect(await code(as(doc(D1), (c) => c.query("UPDATE prescriptions SET status='CANCELLED' WHERE id=$1", [RX])))).toBe("23514"); // بدون زمان/دلیل
    await as(doc(D1), (c) => c.query("UPDATE prescriptions SET status='CANCELLED', cancelled_at=now(), cancel_reason_enc=$2 WHERE id=$1", [RX, B]), true);
    expect(await code(as(doc(D1), (c) => c.query("UPDATE prescriptions SET cancelled_at=now() WHERE id=$1", [RX])))).toBe("42501"); // نهایی
  });

  it("نظر دوم: دسترسی‌ها و ماشین‌وضعیت در DB", async () => {
    await as(pat(P1), (c) => c.query("INSERT INTO second_opinions (id, appointment_id, patient_id, doctor_id, request_enc, accept_deadline_at, shares_expire_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now())", [SO, APPT, P1, D2, B, future(), future()]), true);
    expect(await rows(doc(D2), "SELECT 1 FROM second_opinions")).toHaveLength(1);
    expect(await rows(doc(D1), "SELECT 1 FROM second_opinions")).toHaveLength(0);   // پزشک اولیه نمی‌بیند
    expect(await rows(pat(P2), "SELECT 1 FROM second_opinions")).toHaveLength(0);
    expect(await code(as(pat(P1), (c) => c.query("UPDATE second_opinions SET status='ACCEPTED' WHERE id=$1", [SO])))).toBe("42501"); // بیمار نمی‌پذیرد
    expect(await code(as(doc(D2), (c) => c.query("UPDATE second_opinions SET status='ANSWERED', response_enc=$2 WHERE id=$1", [SO, B])))).toBe("23514"); // REQUESTED→ANSWERED مجاز نیست
    expect(await code(as(doc(D2), (c) => c.query("UPDATE second_opinions SET status='CANCELLED' WHERE id=$1", [SO])))).toBe("42501"); // لغو فقط بیمار
    expect(await code(as(doc(D2), (c) => c.query("UPDATE second_opinions SET request_enc=$2 WHERE id=$1", [SO, Buffer.from([2])])))).toBe("42501");
    await as(doc(D2), (c) => c.query("UPDATE second_opinions SET status='ACCEPTED', answer_deadline_at=$2 WHERE id=$1", [SO, future()]), true);
    expect(await code(as(doc(D2), (c) => c.query("UPDATE second_opinions SET status='ANSWERED' WHERE id=$1", [SO])))).toBe("23514"); // پاسخ لازم
    await as(doc(D2), (c) => c.query("UPDATE second_opinions SET status='ANSWERED', response_enc=$2 WHERE id=$1", [SO, B]), true);
    expect(await code(as(SYS, (c) => c.query("UPDATE second_opinions SET status='EXPIRED' WHERE id=$1", [SO])))).toBe("42501"); // نهایی
  });
});
