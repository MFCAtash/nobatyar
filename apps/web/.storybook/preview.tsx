import type { Preview } from "@storybook/react";
import "@fontsource-variable/vazirmatn";
import "../src/app/globals.css";

/** همان تنظیمات layout.tsx: فارسی، RTL، تم از نوار ابزار (و ?globals=theme:light برای تست بصری). */
const preview: Preview = {
  globalTypes: {
    theme: {
      description: "تم",
      toolbar: { icon: "circlehollow", dynamicTitle: true, items: [{ value: "dark", title: "تیره" }, { value: "light", title: "روشن" }] },
    },
  },
  initialGlobals: { theme: "dark" },
  decorators: [
    (Story, ctx) => {
      const root = document.documentElement;
      root.dataset.theme = String(ctx.globals.theme ?? "dark");
      root.lang = "fa";
      root.dir = "rtl";
      return <div className="container page"><Story /></div>;
    },
  ],
  parameters: { layout: "fullscreen", controls: { expanded: true }, a11y: { config: { rules: [{ id: "region", enabled: false }] } } },
};
export default preview;
