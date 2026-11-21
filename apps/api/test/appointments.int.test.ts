/**
 * چرخه‌ی کامل نوبت روی اپ واقعی (Nest + Postgres)؛ Redis با نسخه‌ی حافظه‌ای و اعلان با جاعل جایگزین می‌شود.
 * نیازمند TEST_OWNER_URL و TEST_APP_URL و اعمال مهاجرت‌های فاز ۳ (db:phase3).
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

d("appointment lifecycle (e2e)", () => {
  let app: INestApplication;
  let owner: pg.Pool;
  const codes = new Map<string, string>();
  const reminders: { appointmentId: string; kind: string }[] = [];
  const b64 = () => randomBytes(32).toString("base64");
  let phoneSeq = Math.floor(Math.random() * 9_000_000) + 1_000_000;
  const newPhone = () => `0913${String(phoneSeq++).padStart(7, "0")}`;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const api = () => request(app.getHttpServer());

  // مدول‌ها بعد از تنظیم env بارگذاری می‌شوند
  let sched: typeof import("../src/scheduling/slots");
  let crypto: import("../src/crypto").FieldCrypto;
  let cryptoMod: typeof import("../src/crypto");
  let svc: import("../src/appointments/appointments.service").AppointmentsService;
  let jobs: import("../src/jobs/appointment-jobs").AppointmentJobs;

  let docFree: Person; // هزینه ۰
  let docPaid: Person; // هزینه ۳٬۰۰۰٬۰۰۰ ریال
  type Person = { id: string; token: string; name: string };
  let day: import("../src/scheduling/slots").TehranDate;
  const slotStart = (i: number) => sched.tehranLocalToUtc(day, 9 * 60 + 20 * i); // ۰۹:۰۰ تهران + i×۲۰ دقیقه

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: "test", APP_DATABASE_URL: APP, DATABASE_URL: APP,
      FIELD_KEYS: `1:${b64()}`, FIELD_KEY_ACTIVE: "1", BLIND_INDEX_KEY: b64(),
      JWT_ACCESS_SECRET: b64(), OTP_SECRET: b64(), SMS_PROVIDER: "console",
      OTP_PER_IP_HOURLY: "10000", VERIFY_PER_IP_10MIN: "10000", REFRESH_PER_IP_10MIN: "10000", OTP_PER_PHONE_HOURLY: "100", OTP_GLOBAL_DAILY_CAP: "100000",
    });
    owner = new pg.Pool({ connectionString: OWNER });
    sched = await import("../src/scheduling/slots");
    cryptoMod = await import("../src/crypto");
    crypto = cryptoMod.FieldCrypto.fromEnv();

    const { AppModule } = await import("../src/app.module");
    const { KV_STORE, InMemoryKv } = await import("../src/redis/kv-store");
    const { SMS_PROVIDER } = await import("../src/sms/sms.provider");
    const { APPOINTMENT_NOTIFIER } = await import("../src/notifications/notifier");
    const { AppointmentsService } = await import("../src/appointments/appointments.service");
    const { AppointmentJobs } = await import("../src/jobs/appointment-jobs");

    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KV_STORE).useValue(new InMemoryKv())
      .overrideProvider(SMS_PROVIDER).useValue({ sendOtp: async (p: string, c: string) => void codes.set(p, c) })
      .overrideProvider(APPOINTMENT_NOTIFIER).useValue({ reminder: async (i: { appointmentId: string; kind: string }) => void reminders.push(i) })
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    svc = app.get(AppointmentsService);
    jobs = app.get(AppointmentJobs);

    day = sched.tehranDateOf(new Date(Date.now() + 3 * 86_400_000));
    docFree = await createDoctor(0n);
    docPaid = await createDoctor(3_000_000n);
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  // ───────────── کمکی‌ها ─────────────
  async function login(phone: string) {
    await api().post("/api/v1/auth/otp/request").send({ phone }).expect(202);
    const code = codes.get(cryptoMod.normalizeIranMobile(phone)!)!;
    const res = await api().post("/api/v1/auth/otp/verify").send({ phone, code }).expect(200);
    return res.body.accessToken as string;
  }

  async function createDoctor(fee: bigint): Promise<Person> {
    const phone = newPhone();
    const norm = cryptoMod.normalizeIranMobile(phone)!;
    const id = randomUUID();
    const name = `Dr Test ${randomBytes(4).toString("hex")}`;
    await owner.query(`INSERT INTO users (id, phone_hash, phone_enc, role, updated_at) VALUES ($1,$2,$3,'DOCTOR',now())`,
      [id, crypto.blindIndex(norm, "phone"), crypto.encrypt(norm, cryptoMod.aad("users", id, "phone"))]);
    await owner.query(`INSERT INTO doctor_profiles (user_id, full_name, consultation_fee_rial, slot_minutes, auto_confirm, is_listed) VALUES ($1,$2,$3,20,false,true)`, [id, name, fee.toString()]);
    await owner.query(`INSERT INTO availability_rules (id, doctor_id, weekday, start_time, end_time) VALUES ($1,$2,$3,'09:00','12:00')`, [randomUUID(), id, day.weekday]);
    return { id, name, token: await login(phone) };
  }

  async function newPatient(consent = true): Promise<Person> {
    const token = await login(newPhone());
    const me = await api().get("/api/v1/me").set(bearer(token)).expect(200);
    if (consent) await api().post("/api/v1/me/consents").set(bearer(token)).send({ type: "HEALTH_DATA_PROCESSING", version: "1.0" }).expect(200);
    return { id: me.body.id, token, name: "" };
  }

  const book = (p: Person, doctor: Person, start: Date, extra: object = {}) =>
    api().post("/api/v1/appointments").set(bearer(p.token)).send({ doctorId: doctor.id, startsAt: start.toISOString(), kind: "VIDEO", ...extra });

  const freeSlots = async (doctor: Person): Promise<string[]> => {
    const f = sched.formatDateStr(day);
    const r = await api().get(`/api/v1/doctors/${doctor.id}/slots?from=${f}&to=${f}`).expect(200);
    return r.body.slots.map((s: { startsAt: string }) => new Date(s.startsAt).toISOString());
  };

  const act = (p: Person, id: string, action: string) => api().post(`/api/v1/appointments/${id}/${action}`).set(bearer(p.token));

  async function insertAppt(doctor: Person, patient: Person, startOffsetMin: number, status: string, durationMin = 20) {
    const id = randomUUID();
    const s = new Date(Date.now() + startOffsetMin * 60_000);
    await owner.query(
      `INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, status, kind, price_rial, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::"AppointmentStatus",'VIDEO',0,now())`,
      [id, doctor.id, patient.id, s, new Date(s.getTime() + durationMin * 60_000), status],
    );
    return id;
  }
  const statusOf = async (id: string) => (await owner.query("SELECT status FROM appointments WHERE id=$1", [id])).rows[0].status as string;

  // ───────────── دایرکتوری عمومی ─────────────
  describe("public directory", () => {
    it("search and profile need no auth and expose only public fields", async () => {
      const r = await api().get(`/api/v1/doctors?q=${encodeURIComponent(docFree.name.slice(-8))}`).expect(200);
      expect(r.body.items.map((x: { id: string }) => x.id)).toContain(docFree.id);
      const one = await api().get(`/api/v1/doctors/${docFree.id}`).expect(200);
      expect(Object.keys(one.body).sort()).toEqual(["bio", "clinic", "consultationFeeRial", "fullName", "id", "slotMinutes", "specialties"]);
      expect(one.body.consultationFeeRial).toBe("0");
    });

    it("unlisted or unknown doctors are 404", async () => {
      await api().get(`/api/v1/doctors/${randomUUID()}`).expect(404);
      await api().get(`/api/v1/doctors/${randomUUID()}/slots`).expect(404);
    });

    it("lists 9 slots (09:00–12:00 Tehran, 20 min) and validates the range", async () => {
      const s = await freeSlots(docFree);
      expect(s).toHaveLength(9);
      expect(s[0]).toBe(slotStart(0).toISOString());
      const f = sched.formatDateStr(day);
      await api().get(`/api/v1/doctors/${docFree.id}/slots?from=${f}&to=2099-01-01`).expect(400);
      await api().get(`/api/v1/doctors/${docFree.id}/slots?from=2026-02-30`).expect(400);
    });
  });

  // ───────────── رزرو ─────────────
  describe("booking", () => {
    it("requires auth, PATIENT role and health-data consent", async () => {
      await api().post("/api/v1/appointments").send({}).expect(401);
      const noConsent = await newPatient(false);
      const r = await book(noConsent, docFree, slotStart(0)).expect(403);
      expect(r.body.error).toBe("consent_required");
      await api().post("/api/v1/appointments").set(bearer(docFree.token)).send({}).expect(403);
    });

    it("rejects times that are not valid slots, in the past, or with unknown fields", async () => {
      const p = await newPatient();
      expect((await book(p, docFree, new Date(slotStart(0).getTime() + 10 * 60_000)).expect(400)).body.error).toBe("invalid_slot");
      expect((await book(p, docFree, new Date(Date.now() - 3_600_000)).expect(400)).body.error).toBe("invalid_slot");
      await book(p, docFree, slotStart(0), { hacked: true }).expect(400);
    });

    it("books a slot, hides it from the public list, and encrypts the reason at rest", async () => {
      const p = await newPatient();
      const reason = "سردرد شدید از دیروز";
      const r = await book(p, docFree, slotStart(0), { reason }).expect(201);
      expect(r.body.status).toBe("PENDING_CONFIRMATION");
      expect(r.body.priceRial).toBe("0");
      expect(await freeSlots(docFree)).not.toContain(slotStart(0).toISOString());

      const raw = (await owner.query("SELECT reason_enc FROM appointments WHERE id=$1", [r.body.id])).rows[0].reason_enc as Buffer;
      expect(raw.includes(Buffer.from(reason))).toBe(false);

      const mine = await api().get(`/api/v1/appointments/${r.body.id}`).set(bearer(p.token)).expect(200);
      expect(mine.body.reason).toBe(reason);
      const doc = await api().get(`/api/v1/appointments/${r.body.id}`).set(bearer(docFree.token)).expect(200);
      expect(doc.body.reason).toBe(reason);

      const stranger = await newPatient();
      await api().get(`/api/v1/appointments/${r.body.id}`).set(bearer(stranger.token)).expect(404);
      const list = await api().get("/api/v1/appointments").set(bearer(p.token)).expect(200);
      expect(list.body.items.find((x: { id: string }) => x.id === r.body.id)).toBeTruthy();
      expect(JSON.stringify(list.body)).not.toContain(reason);
      const strangerList = await api().get("/api/v1/appointments").set(bearer(stranger.token)).expect(200);
      expect(strangerList.body.items).toHaveLength(0);
    });

    it("second booking of the same slot → 409 slot_taken", async () => {
      const a = await newPatient();
      const b = await newPatient();
      await book(a, docFree, slotStart(1)).expect(201);
      expect((await book(b, docFree, slotStart(1)).expect(409)).body.error).toBe("slot_taken");
    });

    it("8 concurrent patients on one slot → exactly one wins", async () => {
      const patients = await Promise.all(Array.from({ length: 8 }, () => newPatient()));
      const res = await Promise.all(patients.map((p) => book(p, docFree, slotStart(2))));
      expect(res.filter((r) => r.status === 201)).toHaveLength(1);
      expect(res.filter((r) => r.status === 409)).toHaveLength(7);
    });

    it("enforces the open-appointment cap and prevents the same patient double-booking a time", async () => {
      const p = await newPatient();
      await book(p, docFree, slotStart(3)).expect(201);
      expect((await book(p, docPaid, slotStart(3)).expect(409)).body.error).toBe("patient_time_conflict");
      await book(p, docFree, slotStart(4)).expect(201);
      await book(p, docFree, slotStart(5)).expect(201);
      expect((await book(p, docFree, slotStart(6)).expect(409)).body.error).toBe("too_many_open_appointments");
    });
  });

  // ───────────── تأیید، لغو، شروع، پایان ─────────────
  describe("state transitions", () => {
    it("doctor confirms; repeated confirm and foreign users are rejected", async () => {
      const p = await newPatient();
      const a = (await book(p, docFree, slotStart(7)).expect(201)).body.id as string;

      await act(p, a, "confirm").expect(403); // نقش بیمار
      const stranger = await createDoctor(0n);
      await act(stranger, a, "confirm").expect(404); // پزشک دیگر: RLS نوبت را نمی‌بیند

      expect((await act(docFree, a, "confirm").expect(200)).body.status).toBe("CONFIRMED");
      expect((await act(docFree, a, "confirm").expect(409)).body.error).toBe("invalid_state");
    });

    it("patient cancel frees the slot", async () => {
      const p = await newPatient();
      const a = (await book(p, docFree, slotStart(8)).expect(201)).body.id as string;
      expect(await freeSlots(docFree)).not.toContain(slotStart(8).toISOString());
      expect((await act(p, a, "cancel").expect(200)).body.status).toBe("CANCELLED_BY_PATIENT");
      expect(await freeSlots(docFree)).toContain(slotStart(8).toISOString());
      expect((await act(p, a, "cancel").expect(409)).body.error).toBe("invalid_state");
    });

    it("start/complete respect time windows and actors", async () => {
      const p = await newPatient();
      const early = await insertAppt(docFree, p, 120, "CONFIRMED");
      expect((await act(docFree, early, "start").expect(422)).body.error).toBe("too_early");

      const a = await insertAppt(docFree, p, 5, "CONFIRMED");
      await act(p, a, "start").expect(403);
      expect((await act(docFree, a, "start").expect(200)).body.status).toBe("IN_PROGRESS");
      expect((await act(docFree, a, "complete").expect(200)).body.status).toBe("COMPLETED");
    });

    it("no-show reports: doctor → patient no-show, patient → doctor no-show", async () => {
      const p = await newPatient();
      const a = await insertAppt(docFree, p, -25, "CONFIRMED");
      expect((await act(docFree, a, "report-no-show").expect(200)).body.status).toBe("NO_SHOW_PATIENT");
      const b = await insertAppt(docFree, p, -70, "CONFIRMED");
      expect((await act(p, b, "report-no-show").expect(200)).body.status).toBe("NO_SHOW_DOCTOR");
    });
  });

  // ───────────── پرداخت و بازپرداخت ─────────────
  describe("payment hook and refunds", () => {
    it("paid doctor: PENDING_PAYMENT → paid → patient cancels early → full refund row", async () => {
      const p = await newPatient();
      const r = await book(p, docPaid, slotStart(0)).expect(201);
      expect(r.body.status).toBe("PENDING_PAYMENT");
      expect(r.body.holdExpiresAt).toBeTruthy();
      const id = r.body.id as string;

      const payId = randomUUID();
      await owner.query(`INSERT INTO payments (id, appointment_id, idempotency_key, amount_rial, status, gateway, paid_at, updated_at) VALUES ($1,$2,$3,3000000,'PAID','ZARINPAL',now(),now())`, [payId, id, randomUUID()]);
      expect((await svc.onPaymentSucceeded(id)).status).toBe("PENDING_CONFIRMATION");

      const c = await act(p, id, "cancel").expect(200);
      expect(c.body.status).toBe("CANCELLED_BY_PATIENT");
      expect(c.body.refundRial).toBe("3000000");
      const refund = await owner.query("SELECT amount_rial::text AS a, status FROM refunds WHERE payment_id=$1", [payId]);
      expect(refund.rows).toEqual([{ a: "3000000", status: "PENDING" }]);
      expect((await owner.query("SELECT status FROM payments WHERE id=$1", [payId])).rows[0].status).toBe("REFUNDED");
    });

    it("payment hook is idempotent-safe: second call conflicts", async () => {
      const p = await newPatient();
      const id = (await book(p, docPaid, slotStart(1)).expect(201)).body.id as string;
      await svc.onPaymentSucceeded(id);
      await expect(svc.onPaymentSucceeded(id)).rejects.toMatchObject({ status: 409 });
    });
  });

  // ───────────── انقضا و یادآوری ─────────────
  describe("background jobs", () => {
    it("expires unpaid holds and unconfirmed requests, freeing their slots", async () => {
      const p1 = await newPatient();
      const unpaid = (await book(p1, docPaid, slotStart(2)).expect(201)).body.id as string;
      await owner.query("UPDATE appointments SET hold_expires_at = now() - interval '1 minute' WHERE id=$1", [unpaid]);

      const p2 = await newPatient();
      const stale = (await book(p2, docFree, slotStart(6)).expect(201)).body.id as string;
      await owner.query("UPDATE appointments SET created_at = now() - interval '25 hours' WHERE id=$1", [stale]);

      await jobs.tick();
      expect(await statusOf(unpaid)).toBe("EXPIRED");
      expect(await statusOf(stale)).toBe("EXPIRED");
      expect(await freeSlots(docPaid)).toContain(slotStart(2).toISOString());
      await jobs.tick(); // ایدمپوتنت
      expect(await statusOf(unpaid)).toBe("EXPIRED");
    });

    it("sends each reminder once (1h and 24h)", async () => {
      const p = await newPatient();
      const soon = await insertAppt(docFree, p, 300, "CONFIRMED");   // ~۵ ساعت دیگر ⇒ یادآوری ۲۴ساعته
      const closer = await insertAppt(docFree, p, 200, "CONFIRMED"); // ~۳٫۳ ساعت دیگر ⇒ ۲۴ساعته
      const imminent = await insertAppt(docFree, p, 50, "CONFIRMED"); // کمتر از ۱ ساعت ⇒ ۱ساعته
      await jobs.tick();
      await jobs.tick();
      const kinds = (id: string) => reminders.filter((r) => r.appointmentId === id).map((r) => r.kind);
      expect(kinds(soon)).toEqual(["24h"]);
      expect(kinds(closer)).toEqual(["24h"]);
      expect(kinds(imminent)).toEqual(["1h"]);
    });
  });

  // ───────────── برنامه‌ی پزشک ─────────────
  describe("doctor schedule management", () => {
    it("validates availability and blocks time-off over active appointments", async () => {
      const bad = { rules: [{ weekday: 1, startTime: "09:00", endTime: "11:00" }, { weekday: 1, startTime: "10:00", endTime: "12:00" }] };
      expect((await api().put("/api/v1/doctors/me/availability").set(bearer(docFree.token)).send(bad).expect(400)).body.error).toBe("invalid_availability");
      await api().put("/api/v1/doctors/me/availability").set(bearer(docFree.token)).send({ rules: [{ weekday: day.weekday, startTime: "09:00", endTime: "12:00" }] }).expect(200);
      await api().put("/api/v1/doctors/me/availability").set(bearer(await login(newPhone()))).send(bad).expect(403); // بیمار

      const startsAt = slotStart(0).toISOString();
      const endsAt = slotStart(1).toISOString();
      const c = await api().post("/api/v1/doctors/me/time-off").set(bearer(docFree.token)).send({ startsAt, endsAt }).expect(409);
      expect(c.body.error).toBe("active_appointments_in_range");

      const far = new Date(Date.now() + 20 * 86_400_000);
      const ok = await api().post("/api/v1/doctors/me/time-off").set(bearer(docFree.token))
        .send({ startsAt: far.toISOString(), endsAt: new Date(far.getTime() + 3_600_000).toISOString() }).expect(201);
      await api().delete(`/api/v1/doctors/me/time-off/${ok.body.id}`).set(bearer(docFree.token)).expect(204);
      await api().delete(`/api/v1/doctors/me/time-off/${ok.body.id}`).set(bearer(docFree.token)).expect(404);
    });

    it("time-off removes slots from the public list", async () => {
      const doc = await createDoctor(0n);
      const from = slotStart(0), to = slotStart(3);
      await api().post("/api/v1/doctors/me/time-off").set(bearer(doc.token)).send({ startsAt: from.toISOString(), endsAt: to.toISOString() }).expect(201);
      const s = await freeSlots(doc);
      expect(s).toHaveLength(6);
      expect(s[0]).toBe(to.toISOString());
    });

    it("settings: slot size must stay compatible with the weekly windows", async () => {
      const doc = await createDoctor(0n);
      await api().patch("/api/v1/doctors/me/settings").set(bearer(doc.token)).send({ slotMinutes: 30, consultationFeeRial: "1500000", autoConfirm: true }).expect(200);
      await api().patch("/api/v1/doctors/me/settings").set(bearer(doc.token)).send({ slotMinutes: 7 }).expect(400);
      await api().patch("/api/v1/doctors/me/settings").set(bearer(doc.token)).send({ role: "ADMIN" }).expect(400); // strict
      expect((await freeSlots(doc))).toHaveLength(6); // ۱۸۰ دقیقه ÷ ۳۰
    });
  });
});
