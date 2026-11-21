#!/usr/bin/env node
/**
 * ساخت مهاجرتهای baseline بدون نیاز به دیتابیس (A0).
 *  1) prisma migrate diff --from-empty → ایجاد 00000000000000_init
 *  2) هر ورودی prisma/sql/ORDER → یک migration جداگانه با همان SQL
 * این اسکریپت idempotent است؛ فایلهای موجود را بازنویسی نمیکند.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migDir = join(root, "prisma", "migrations");
const order = readFileSync(join(root, "prisma", "sql", "ORDER"), "utf8")
  .split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));

mkdirSync(migDir, { recursive: true });
writeFileSync(join(migDir, "migration_lock.toml"), 'provider = "postgresql"\n');

const initDir = join(migDir, "00000000000000_init");
const initFile = join(initDir, "migration.sql");
if (!existsSync(initFile)) {
  mkdirSync(initDir, { recursive: true });
  const sql = execFileSync(process.execPath, [
    resolve(root, "node_modules", "prisma", "build", "index.js"), "migrate", "diff",
    "--from-empty", "--to-schema-datamodel", join(root, "prisma", "schema.prisma"), "--script",
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  writeFileSync(initFile, sql);
  console.log("✓ init baseline");
}

let n = 1;
for (const name of order) {
  const dir = join(migDir, `${String(10000000000000 + n++)}_${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`);
  const file = join(dir, "migration.sql");
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, readFileSync(join(root, "prisma", "sql", `${name}.sql`), "utf8"));
    console.log(`✓ ${name}`);
  }
}
console.log(`migrations: ${readdirSync(migDir).filter((d) => /^\d+_/.test(d)).length}`);
