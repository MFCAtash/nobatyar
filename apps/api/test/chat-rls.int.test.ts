/**
 * چت زیر RLS — با «نقش اپ» (بدون BYPASSRLS) و همان الگوی PrismaService.withContext.
 * نیازمند Postgres با مهاجرت‌ها (از جمله phase14-chat-rls.sql): TEST_OWNER_URL و TEST_APP_URL؛ وگرنه skip.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER = process.env.TEST_OWNER_URL;
const APP = process.env.TEST_APP_URL;
const d = OWNER && APP ? describe : describe.skip;

type Ctx = { role: string; userId?: string };

d("chat under RLS", () => {
  let owner: pg.Pool;
  let app: pg.Pool;
  const P1 = randomUUID(), P2 = randomUUID(), D1 = randomUUID();
  const APPT = randomUUID(), CONV = randomUUID();

  async function as<T>(ctx: Ctx | null, fn: (c: pg.PoolClient) => Promise<T>, commit = false): Promise<T> {
    const c = await app.connect();
    try {
      await c.query("BEGIN");
      if (ctx) await c.query("SELECT set_config('app.user_id',$1,true), set_config('app.role',$2,true)", [ctx.userId ?? "", ctx.role]);
      const r = await fn(c);
      await c.query(commit ? "COMMIT" : "ROLLBACK");
      return r;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }
  const code = async (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code ?? "unknown");
  const send = (ctx: Ctx, body: string) =>
    as(ctx, (c) => c.query("INSERT INTO messages (conversation_id, sender_id, body_enc) VALUES ($1,$2,$3)", [CONV, ctx.userId, Buffer.from(body)]), true);

  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: OWNER });
    app = new pg.Pool({ connectionString: APP });
    const ins = (id: string, role: string) =>
      owner.query("INSERT INTO users (id, phone_hash, phone_enc, role, updated_at) VALUES ($1,$2,'\\x00',$3::\"Role\", now())", [id, `h-${id}`, role]);
    for (const [id, role] of [[P1, "PATIENT"], [P2, "PATIENT"], [D1, "DOCTOR"]] as const) await ins(id, role);
    for (const id of [P1, P2]) await owner.query("INSERT INTO patient_profiles (user_id, full_name) VALUES ($1,'p')", [id]);
    await owner.query("INSERT INTO doctor_profiles (user_id, full_name) VALUES ($1,'d')", [D1]);
    const t = new Date(Date.now() + 40 * 24 * 3600_000);
    await owner.query(
      "INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, status, kind, price_rial, updated_at) VALUES ($1,$2,$3,$4,$5,'CONFIRMED','VIDEO',1000, now())",
      [APPT, D1, P1, t.toISOString(), new Date(t.getTime() + 20 * 60_000).toISOString()],
    );
    await owner.query("INSERT INTO conversations (id, appointment_id, patient_id, doctor_id) VALUES ($1,$2,$3,$4)", [CONV, APPT, P1, D1]);
  });
  afterAll(async () => { await owner?.end(); await app?.end(); });

  it("بدون زمینه‌ی RLS: هیچ ردیفی دیده نمی‌شود و درج رد می‌شود (دلیل ضرورت withContext در ChatService)", async () => {
    expect((await as(null, (c) => c.query("SELECT 1 FROM conversations"))).rowCount).toBe(0);
    expect(await code(as(null, (c) => c.query("INSERT INTO messages (conversation_id, sender_id, body_enc) VALUES ($1,$2,'\\x01')", [CONV, P1])))).toBe("42501");
  });

  it("اعضا با زمینه‌ی درست می‌خوانند و می‌نویسند؛ غیرعضو نه", async () => {
    await send({ role: "PATIENT", userId: P1 }, "سلام");
    await send({ role: "DOCTOR", userId: D1 }, "سلام، بفرمایید");
    expect((await as({ role: "PATIENT", userId: P1 }, (c) => c.query("SELECT 1 FROM conversations"))).rowCount).toBe(1);
    expect((await as({ role: "DOCTOR", userId: D1 }, (c) => c.query("SELECT 1 FROM messages WHERE conversation_id=$1", [CONV]))).rowCount).toBe(2);
    expect((await as({ role: "PATIENT", userId: P2 }, (c) => c.query("SELECT 1 FROM messages"))).rowCount).toBe(0);
    expect(await code(send({ role: "PATIENT", userId: P2 }, "نفوذی"))).toBe("42501");
  });

  it("read_at: فقط عضو، فقط پیام‌های طرف مقابل، فقط یک‌بار", async () => {
    // دکتر پیام‌های بیمار را «خوانده» می‌کند
    const r = await as({ role: "DOCTOR", userId: D1 },
      (c) => c.query("UPDATE messages SET read_at = now() WHERE conversation_id=$1 AND sender_id <> $2 AND read_at IS NULL", [CONV, D1]), true);
    expect(r.rowCount).toBe(1);
    // پیام خودش را نمی‌تواند «خوانده» کند (سیاست: sender_id <> کاربر) ⇒ ۰ ردیف
    const own = await as({ role: "DOCTOR", userId: D1}, (c) => c.query("UPDATE messages SET read_at = now() WHERE conversation_id=$1 AND sender_id = $2", [CONV, D1]));
    expect(own.rowCount).toBe(0);
    // غیرعضو ⇒ ۰ ردیف
    const out = await as({ role: "PATIENT", userId: P2 }, (c) => c.query("UPDATE messages SET read_at = now() WHERE conversation_id=$1", [CONV]));
    expect(out.rowCount).toBe(0);
    // read_at دوباره‌نویسی نمی‌شود (write-once)
    expect(await code(as({ role: "DOCTOR", userId: D1 }, (c) => c.query("UPDATE messages SET read_at = now() + interval '1 hour' WHERE conversation_id=$1 AND sender_id <> $2", [CONV, D1])))).toBe("42501");
  });

  it("هیچ ستون دیگری قابل تغییر نیست و حذف ممکن نیست", async () => {
    expect(await code(as({ role: "DOCTOR", userId: D1 }, (c) => c.query("UPDATE messages SET body_enc='\\x02'")))).toBe("42501");
    expect(await code(as({ role: "DOCTOR", userId: D1 }, (c) => c.query("UPDATE messages SET sender_id=$1", [P2])))).toBe("42501");
    expect(await code(as({ role: "DOCTOR", userId: D1 }, (c) => c.query("DELETE FROM messages")))).toBe("42501");
  });
});
