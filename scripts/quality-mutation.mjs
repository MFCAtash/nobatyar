#!/usr/bin/env node
/**
 * M12 — حداقل چارچوب جهش (mutation testing) بدون وابستگی خارجی.
 *
 * سه ماژول خالص تولیدی را جهش میدهد، تست متناظرشان را با vitest موجود اجرا میکند
 * و میسنجد که آیا تست «جهش را کشته» (شکست خورده) است یا خیر. فایل منبع همیشه
 * در بلوک finally بازگردانده میشود؛ حتی در صورت قطع فرایند (process.on("exit")).
 *
 * استفاده: node scripts/quality-mutation.mjs
 * خروجی: JSON روی stdout؛ exit 0 اگر نرخ کشتن >= ۵۰٪، در غیر این صورت ۱.
 * فقط از ماژولهای core node:fs و node:child_process استفاده میکند.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// ریشهٔ مخزن از روی URL اسکریپت (بدون وابستگی به cwd)، با اسلشهای سازگار با ویندوز.
const ROOT = (() => {
  const raw = decodeURIComponent(new URL("../", import.meta.url).pathname);
  return raw.replace(/^\/([A-Za-z]:)/, "$1").replace(/\/+$/, "");
})();
const API_DIR = `${ROOT}/apps/api`;
const VITEST_CLI = `${API_DIR}/node_modules/vitest/vitest.mjs`;

/** جهشهای کوچک، قطعی و امن (الگوی منحصربهفرد ⇒ جایگذاری دقیق). */
const MUTANTS = [
  {
    name: "room-policy: waitingRoom !== false ⇒ === false",
    file: `${API_DIR}/src/video/room-policy.ts`,
    testFile: "src/video/room-policy.test.ts",
    from: "waitingRoom: p.waitingRoom !== false,",
    to: "waitingRoom: p.waitingRoom === false,",
  },
  {
    name: "timeline: جهت روند معکوس شد (> ⇒ <)",
    file: `${API_DIR}/src/patient-record/timeline.ts`,
    testFile: "src/patient-record/patient-record.test.ts",
    from: 'delta > 0 ? "up" : "down"',
    to: 'delta < 0 ? "up" : "down"',
  },
  {
    name: "ui-preferences: clamp min/max جابجا شد",
    file: `${API_DIR}/src/design/ui-preferences.ts`,
    testFile: "src/design/ui-preferences.test.ts",
    from: "Math.min(Math.max(value, MIN_FONT_SCALE), MAX_FONT_SCALE)",
    to: "Math.max(Math.min(value, MIN_FONT_SCALE), MAX_FONT_SCALE)",
  },
];

const THRESHOLD = 0.5;

/** بازگرداندهندهٔ امنِ فایل فعال؛ هم در finally و هم هنگام خروج فراخوانی میشود. */
let active = null;
function restoreActive() {
  if (!active) return;
  const state = active;
  active = null;
  try {
    writeFileSync(state.file, state.original, "utf8");
    state.info.restored = readFileSync(state.file, "utf8") === state.original;
  } catch (error) {
    state.info.restored = false;
    state.info.restoreError = String(error?.message ?? error);
  }
}
process.on("exit", restoreActive);

function runTest(testFile) {
  const result = spawnSync(
    process.execPath,
    [VITEST_CLI, "run", testFile, "--config", "vitest.config.ts", "--reporter=dot", "--no-color"],
    {
      cwd: API_DIR,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  if (result.error) {
    return {
      exitCode: -1,
      error: String(result.error.message ?? result.error),
      tail: "",
      timedOut: result.error.code === "ETIMEDOUT",
    };
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  return {
    exitCode: result.status,
    signal: result.signal ?? null,
    tail: output.slice(-600),
    timedOut: !!result.error && result.error.code === "ETIMEDOUT",
  };
}

const results = [];
for (const mutant of MUTANTS) {
  const result = {
    name: mutant.name,
    file: mutant.file.replace(`${ROOT}/`, ""),
    test: mutant.testFile,
    applied: false,
    killed: false,
    exitCode: null,
    reason: null,
    restored: true,
  };

  let original;
  try {
    original = readFileSync(mutant.file, "utf8");
  } catch (error) {
    result.reason = `read-failed: ${error?.message ?? error}`;
    results.push(result);
    continue;
  }

  const occurrences = original.split(mutant.from).length - 1;
  if (occurrences !== 1) {
    result.reason = occurrences === 0 ? "pattern-not-found" : `pattern-ambiguous(${occurrences})`;
    results.push(result);
    continue;
  }

  const restoreInfo = { restored: true, restoreError: null };
  try {
    writeFileSync(mutant.file, original.replace(mutant.from, mutant.to), "utf8");
    result.applied = true;
    active = { file: mutant.file, original, info: restoreInfo };

    const testRun = runTest(mutant.testFile);
    result.exitCode = testRun.exitCode;
    result.killed = testRun.exitCode !== 0; // تست شکست خورده ⇒ جهش کشته شده
    result.reason = testRun.error ?? (result.killed ? "tests-failed" : "tests-passed");
    result.testTail = testRun.tail;
    if (testRun.timedOut) result.reason = "test-timeout";
  } catch (error) {
    result.reason = `harness-error: ${error?.message ?? error}`;
  } finally {
    // حتی با خطا، منبع اصلی بازگردانده میشود.
    restoreActive();
    result.restored = restoreInfo.restored;
    result.restoreError = restoreInfo.restoreError;
  }
  results.push(result);
}

const applied = results.filter((r) => r.applied);
const killed = applied.filter((r) => r.killed).length;
const skipped = results.length - applied.length;
const killRate = applied.length === 0 ? 0 : killed / applied.length;
const filesRestored = results.every((r) => r.restored);

const summary = {
  tool: "quality-mutation",
  generatedAt: new Date().toISOString(),
  threshold: THRESHOLD,
  total: results.length,
  applied: applied.length,
  skipped,
  killed,
  survived: applied.length - killed,
  killRate: Number(killRate.toFixed(3)),
  filesRestored,
  results,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(killRate >= THRESHOLD && filesRestored ? 0 : 1);
