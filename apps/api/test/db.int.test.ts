/**
 * تست‌های یکپارچه‌ی امنیت دیتابیس (RLS، ضد رزرو دوبل، Audit).
 * نیازمند Postgres با مهاجرت‌های اعمال‌شده:
 *   TEST_OWNER_URL = اتصال مالک/superuser (فقط برای seed و سناریوی دستکاری)
 *   TEST_APP_URL   = اتصال نقش nobatyar_app (همان‌که API استفاده می‌کند)
 * بدون این متغیرها تست‌ها skip می‌شوند.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const OWNER = process.env.TEST_OWNER_URL;
const APP = process.env.TEST_APP_URL;
const d = OWNER && APP ? describe : describe.skip;

type Ctx = { role: string; userId?: string; breakGlass?: boolean };

d("database security", () => {
  let owner: pg.Pool;
  let app: pg.Pool;

  const P1 = randomUUID(), P2 = randomUUID(), D1 = randomUUID(), D2 = randomUUID(), ADM = randomUUID();
  const APPT1 = randomUUID(), REC1 = randomUUID(), CONV1 = randomUUID();

  /** اجرای کوئری با زمینه‌ی RLS؛ پایان با ROLLBACK مگر commit=true. */
  async function as<T>(ctx: Ctx, fn: (c: pg.PoolClient) => Promise<T>, commit = false): Promise<T> {
    const c = await app.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "SELECT set_config('app.user_id',$1,true), set_config('app.role',$2,true), set_config('app.break_glass',$3,true)",
        [ctx.userId ?? "", ctx.role, ctx.breakGlass ? "on" : "off"],
      );
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

  const t0 = Date.now() + 7 * 24 * 3600_000;
  const at = (mins: number) => new Date(t0 + mins * 60_000).toISOString();

  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: OWNER });
    app = new pg.Pool({ connectionString: APP });
    const ins = (id: string, role: string) =>
      owner.query("INSERT INTO users (id, phone_hash, phone_enc, role, updated_at) VALUES ($1,$2,'\\x00',$3::\"Role\", now())", [id, `h-${id}`, role]);
    for (const [id, role] of [[P1, "PATIENT"], [P2, "PATIENT"], [D1, "DOCTOR"], [D2, "DOCTOR"], [ADM, "ADMIN"]] as const) await ins(id, role);
    for (const id of [P1, P2]) await owner.query("INSERT INTO patient_profiles (user_id, full_name) VALUES ($1,'p')", [id]);
    for (const id of [D1, D2]) await owner.query("INSERT INTO doctor_profiles (user_id, full_name) VALUES ($1,'d')", [id]);
    await owner.query(
      "INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, status, kind, price_rial, updated_at) VALUES ($1,$2,$3,$4,$5,'CONFIRMED','VIDEO',1000, now())",
      [APPT1, D1, P1, at(0), at(20)],
    );
    await owner.query("INSERT INTO health_records (id, patient_id, title, content_enc, updated_at) VALUES ($1,$2,'t','\\x01', now())", [REC1, P1]);
    await owner.query("INSERT INTO conversations (id, appointment_id, patient_id, doctor_id) VALUES ($1,$2,$3,$4)", [CONV1, APPT1, P1, D1]);
  });

  afterAll(async () => {
    await owner?.end();
    await app?.end();
  });

  describe("RLS — appointments & profiles", () => {
    it("patient sees only own appointments", async () => {
      expect((await as({ role: "PATIENT", userId: P1 }, (c) => c.query("SELECT id FROM appointments"))).rowCount).toBe(1);
      expect((await as({ role: "PATIENT", userId: P2 }, (c) => c.query("SELECT id FROM appointments"))).rowCount).toBe(0);
    });

    it("no context → no rows (default deny)", async () => {
      expect((await as({ role: "" }, (c) => c.query("SELECT id FROM appointments"))).rowCount).toBe(0);
    });

    it("patient cannot create an appointment for someone else", async () => {
      const err = await code(as({ role: "PATIENT", userId: P2 }, (c) =>
        c.query("INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, price_rial, updated_at) VALUES ($1,$2,$3,$4,$5,1,now())",
          [randomUUID(), D2, P1, at(600), at(620)])));
      expect(err).toBe("42501"); // new row violates row-level security policy
    });

    it("doctor sees patient profile only with a shared appointment", async () => {
      expect((await as({ role: "DOCTOR", userId: D1 }, (c) => c.query("SELECT 1 FROM patient_profiles WHERE user_id=$1", [P1]))).rowCount).toBe(1);
      expect((await as({ role: "DOCTOR", userId: D2 }, (c) => c.query("SELECT 1 FROM patient_profiles WHERE user_id=$1", [P1]))).rowCount).toBe(0);
    });

    it("another patient cannot read users row", async () => {
      expect((await as({ role: "PATIENT", userId: P2 }, (c) => c.query("SELECT 1 FROM users WHERE id=$1", [P1]))).rowCount).toBe(0);
    });
  });

  describe("RLS — health records", () => {
    it("owner reads; other patient and unrelated doctor cannot", async () => {
      const q = (ctx: Ctx) => as(ctx, (c) => c.query("SELECT id FROM health_records WHERE id=$1", [REC1]));
      expect((await q({ role: "PATIENT", userId: P1 })).rowCount).toBe(1);
      expect((await q({ role: "PATIENT", userId: P2 })).rowCount).toBe(0);
      expect((await q({ role: "DOCTOR", userId: D1 })).rowCount).toBe(0);
    });

    it("doctor reads after share, but cannot modify or delete; revoked share blocks again", async () => {
      await as({ role: "PATIENT", userId: P1 }, (c) =>
        c.query("INSERT INTO record_shares (id, record_id, doctor_id) VALUES ($1,$2,$3)", [randomUUID(), REC1, D1]), true);
      try {
        const doc: Ctx = { role: "DOCTOR", userId: D1 };
        expect((await as(doc, (c) => c.query("SELECT id FROM health_records WHERE id=$1", [REC1]))).rowCount).toBe(1);
        expect((await as(doc, (c) => c.query("UPDATE health_records SET title='x' WHERE id=$1", [REC1]))).rowCount).toBe(0);
        expect((await as(doc, (c) => c.query("DELETE FROM health_records WHERE id=$1", [REC1]))).rowCount).toBe(0);

        await as({ role: "PATIENT", userId: P1 }, (c) =>
          c.query("UPDATE record_shares SET revoked_at = now() WHERE record_id=$1", [REC1]), true);
        expect((await as(doc, (c) => c.query("SELECT id FROM health_records WHERE id=$1", [REC1]))).rowCount).toBe(0);
      } finally {
        await owner.query("DELETE FROM record_shares WHERE record_id=$1", [REC1]);
      }
    });

    it("admin needs break-glass for HEALTH content", async () => {
      const q = (ctx: Ctx) => as(ctx, (c) => c.query("SELECT id FROM health_records WHERE id=$1", [REC1]));
      expect((await q({ role: "ADMIN", userId: ADM })).rowCount).toBe(0);
      expect((await q({ role: "ADMIN", userId: ADM, breakGlass: true })).rowCount).toBe(1);
    });
  });

  describe("RLS — messages", () => {
    it("participants can post; outsiders cannot; messages are immutable", async () => {
      const post = (userId: string, role: string, sender = userId) =>
        as({ role, userId }, (c) => c.query("INSERT INTO messages (conversation_id, sender_id, body_enc) VALUES ($1,$2,'\\x01')", [CONV1, sender]), true);

      expect(await code(post(P1, "PATIENT"))).toBeNull();
      expect(await code(post(P2, "PATIENT"))).toBe("42501");           // not a participant
      expect(await code(post(P1, "PATIENT", D1))).toBe("42501");       // spoofed sender

      expect(await code(as({ role: "PATIENT", userId: P1 }, (c) => c.query("UPDATE messages SET body_enc='\\x02'")))).toBe("42501");
      expect(await code(as({ role: "PATIENT", userId: P1 }, (c) => c.query("DELETE FROM messages")))).toBe("42501");
    });

    it("outsider cannot read a conversation", async () => {
      expect((await as({ role: "PATIENT", userId: P2 }, (c) => c.query("SELECT 1 FROM messages"))).rowCount).toBe(0);
    });
  });

  describe("double booking", () => {
    const insert = (c: pg.PoolClient, doctor: string, start: string, end: string, status = "PENDING_PAYMENT") =>
      c.query("INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, status, price_rial, updated_at) VALUES ($1,$2,$3,$4,$5,$6::\"AppointmentStatus\",1,now())",
        [randomUUID(), doctor, P2, start, end, status]);
    const ctx: Ctx = { role: "SYSTEM" };

    it("rejects overlapping active appointments (23P01)", async () => {
      expect(await code(as(ctx, async (c) => { await insert(c, D2, at(1000), at(1020)); await insert(c, D2, at(1010), at(1030)); }))).toBe("23P01");
    });

    it("allows adjacent slots and the same slot for another doctor", async () => {
      expect(await code(as(ctx, async (c) => {
        await insert(c, D2, at(2000), at(2020));
        await insert(c, D2, at(2020), at(2040));
        await insert(c, D1, at(2000), at(2020));
      }))).toBeNull();
    });

    it("frees the slot after cancellation", async () => {
      expect(await code(as(ctx, async (c) => {
        await insert(c, D2, at(3000), at(3020), "CANCELLED_BY_PATIENT");
        await insert(c, D2, at(3000), at(3020));
      }))).toBeNull();
    });

    it("rejects inverted time ranges", async () => {
      expect(await code(as(ctx, (c) => insert(c, D2, at(4020), at(4000))))).toBe("23514");
    });

    it("100 concurrent bookings for one slot → exactly one wins", async () => {
      const start = at(5000), end = at(5020);
      const results = await Promise.all(Array.from({ length: 100 }, () =>
        code(as(ctx, (c) => insert(c, D2, start, end), true))));
      expect(results.filter((r) => r === null)).toHaveLength(1);
      expect(results.filter((r) => r === "23P01")).toHaveLength(99);
    });
  });

  describe("audit log", () => {
    const log = (action: string) =>
      as({ role: "SYSTEM" }, (c) => c.query("INSERT INTO audit_logs (actor_role, action, object_type, meta) VALUES ('SYSTEM',$1,'test','{\"k\":1}')", [action]), true);

    it("app role can append but not update/delete/truncate", async () => {
      await log("t.append");
      expect(await code(as({ role: "SYSTEM" }, (c) => c.query("UPDATE audit_logs SET action='x'")))).toBe("42501");
      expect(await code(as({ role: "SYSTEM" }, (c) => c.query("DELETE FROM audit_logs")))).toBe("42501");
      expect(await code(as({ role: "SYSTEM" }, (c) => c.query("TRUNCATE audit_logs")))).toBe("42501");
    });

    it("chain verifies; concurrent inserts keep a gap-free chain", async () => {
      await Promise.all(Array.from({ length: 20 }, (_, i) => log(`t.concurrent.${i}`)));
      const r = await owner.query("SELECT * FROM verify_audit_chain()");
      expect(r.rows).toEqual([]);
    });

    it("tampering with a row is detected", async () => {
      await log("t.victim");
      const c = await owner.connect();
      try {
        await c.query("BEGIN");
        await c.query("SET LOCAL session_replication_role = replica"); // دور زدن trigger ها فقط در این تراکنش
        await c.query("UPDATE audit_logs SET action = 'tampered' WHERE action = 't.victim'");
        const r = await c.query("SELECT * FROM verify_audit_chain()");
        expect(r.rows.some((x) => String(x.reason).includes("hash mismatch"))).toBe(true);
      } finally {
        await c.query("ROLLBACK");
        c.release();
      }
    });
  });
});
