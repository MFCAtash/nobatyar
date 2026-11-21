#!/usr/bin/env node
/** A0: هر ورودی prisma/sql/ORDER باید معادل یک migration و SQL موجود باشد. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const order = readFileSync(join(root, "prisma", "sql", "ORDER"), "utf8")
  .split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
const dirs = readdirSync(join(root, "prisma", "migrations")).filter((d) => /^\d+_/.test(d));
const missing = order.filter((name) =>
  !existsSync(join(root, "prisma", "sql", `${name}.sql`)) ||
  !dirs.some((d) => d.endsWith(`_${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`)));
if (missing.length) {
  console.error(`migrations missing for: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`✓ ${order.length} SQL hardening migrations + init present`);
