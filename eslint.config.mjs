import tseslint from "typescript-eslint";

/**
 * قاعده‌ی مشترک مخزن. `any` در کد تولیدی «خطا» است (بدون eslint-disable)؛ فقط mock های تست مجازند.
 * نگهبان بدون‌وابستگی: apps/api/src/quality/guardrails.test.ts (همین قواعد را بدون ESLint هم می‌سنجد).
 */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-ignore": true, "ts-nocheck": true, "ts-expect-error": "allow-with-description", minimumDescriptionLength: 10 }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  { files: ["**/*.test.{ts,tsx}", "**/test/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
);
