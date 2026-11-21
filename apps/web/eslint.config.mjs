import tseslint from "typescript-eslint";

/** نحو ممنوع برای یکدستی UI (دلیل هر مورد در پیام آمده؛ راهنما: docs/phase-16-frontend-ux.md) */
const STYLE_RULE = [
  {
    selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > :not(CallExpression[callee.name='cssVars'])",
    message: "style ی inline ممنوع است: کلاس utility یا کامپوننت-CSS بنویسید. فقط style={cssVars({ \"--x\": v })} برای مقدار پویا مجاز است.",
  },
];
const FORMAT_RULES = [
  { selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]", message: "از lib/format (formatNumber / formatDateTime / DateText …) استفاده کنید تا ارقام و تقویم شمسی یکدست بماند." },
  { selector: "NewExpression[callee.object.name='Intl']", message: "Intl فقط در lib/format.ts مجاز است." },
];

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "storybook-static/**"] },
  ...tseslint.configs.recommended,
  { files: ["src/**/*.{ts,tsx}"], rules: { "no-restricted-syntax": ["error", ...STYLE_RULE, ...FORMAT_RULES] } },
  // خود ابزار قالب‌بندی باید به Intl دسترسی داشته باشد
  { files: ["src/lib/format.ts", "src/**/*.test.{ts,tsx}"], rules: { "no-restricted-syntax": ["error", ...STYLE_RULE] } },
  { files: ["src/**/*.test.{ts,tsx}"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
  { files: ["src/**/*.{ts,tsx}"], rules: { "@typescript-eslint/no-explicit-any": "error" } },
);
