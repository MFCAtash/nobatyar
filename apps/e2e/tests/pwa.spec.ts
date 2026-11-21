import { expect, test } from "@playwright/test";

/** PWA: manifest معتبر، SW ثبت می‌شود (build ی production)، و «هرگز» پاسخ API/HTML در cache نمی‌ماند. */
test("manifest معتبر و قابل‌نصب است", async ({ request }) => {
  const r = await request.get("/manifest.webmanifest");
  expect(r.ok()).toBeTruthy();
  const m = await r.json();
  expect(m).toMatchObject({ lang: "fa", dir: "rtl", display: "standalone", scope: "/" });
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const i of m.icons) expect((await request.get(i.src)).ok()).toBeTruthy();
});

async function swReady(page: import("@playwright/test").Page) {
  await page.goto("/login");
  return page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    await navigator.serviceWorker.ready;
    return true;
  });
}

test("SW فقط استاتیک را cache می‌کند؛ API و صفحات هرگز", async ({ page }) => {
  test.skip(!(await swReady(page)), "SW فقط در build ی production ثبت می‌شود");
  await page.reload(); // کنترل SW
  await page.evaluate(async () => { await fetch("/api/v1/specialties"); await fetch("/api/v1/doctors?limit=1"); });
  await page.goto("/");
  await page.goto("/login");

  const urls = await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(urls.length).toBeGreaterThan(0); // استاتیک cache می‌شود
  for (const u of urls) {
    expect(/^\/(_next\/static\/|icons\/|manifest\.webmanifest|offline\.html)/.test(u), `مسیر غیرمجاز در cache: ${u}`).toBe(true);
  }
});

test("قطعی شبکه ⇒ صفحه‌ی آفلاین ثابت (بدون هیچ داده)", async ({ page, context }) => {
  test.skip(!(await swReady(page)), "SW ثبت نشده");
  await page.reload();
  await context.setOffline(true);
  await page.goto("/login").catch(() => undefined);
  await expect(page.getByText("اتصال برقرار نیست")).toBeVisible();
  await context.setOffline(false);
});
