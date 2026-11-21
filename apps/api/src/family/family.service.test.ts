/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FieldCrypto } from "../crypto/field-crypto";
import { FamilyService, nationalIdAad } from "./family.service";

const crypto = new FieldCrypto({ keys: `1:${randomBytes(32).toString("base64")}`, activeKeyId: 1, blindIndexKey: randomBytes(32).toString("base64") });
const owner = { id: "owner-1", role: "PATIENT" } as any;

function make() {
  const rows: any[] = [];
  const prisma = {
    familyMember: {
      create: async ({ data }: any) => { rows.push({ createdAt: new Date(0), ...data }); return data; },
      findMany: async () => rows,
      findUnique: async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
      update: async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id); Object.assign(r, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))); return r; },
    },
  };
  return { svc: new FamilyService(prisma as any, crypto), rows };
}

describe("FamilyService — national id encryption", () => {
  it("add → list round-trips (AAD ی رمزنگاری و رمزگشایی یکی است) و کد ملی ماسک می‌شود", async () => {
    const { svc, rows } = make();
    await svc.add(owner, { fullName: "علی رضایی", relation: "فرزند", nationalId: "0012345678" });
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    const [m] = await svc.list(owner);
    expect(m.nationalIdMasked).toBe("****5678");
  });

  it("update با کد ملی تازه هم خوانا می‌ماند", async () => {
    const { svc, rows } = make();
    await svc.add(owner, { fullName: "زهرا", relation: "همسر", nationalId: "0012345678" });
    await svc.update(owner, rows[0].id, { nationalId: "1234567890" });
    expect((await svc.list(owner))[0].nationalIdMasked).toBe("****7890");
  });

  it("رکورد با AAD ناهمخوان (داده‌ی قدیمی) ⇒ null، نه خطای ۵۰۰ برای کل لیست", async () => {
    const { svc, rows } = make();
    rows.push({ id: "old-1", ownerId: "owner-1", fullName: "قدیمی", relation: "والد", birthYear: null, createdAt: new Date(0), nationalId: crypto.encrypt(Buffer.from("0012345678"), "family-national-id:owner-1:undefined") });
    await svc.add(owner, { fullName: "جدید", relation: "فرزند", nationalId: "0012345678" });
    const list = await svc.list(owner);
    expect(list.map((m) => m.nationalIdMasked)).toEqual([null, "****5678"]);
  });

  it("AAD به شناسه‌ی عضو وابسته است (کد ملی یک عضو با عضو دیگر قابل‌جابه‌جایی نیست)", () => {
    expect(nationalIdAad("a")).not.toBe(nationalIdAad("b"));
    expect(nationalIdAad("a").split(":")).toHaveLength(3);
  });
});
