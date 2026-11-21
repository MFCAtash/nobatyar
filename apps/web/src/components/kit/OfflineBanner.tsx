"use client";
import { useOnline } from "@/lib/use-online";

export function OfflineBannerView({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      اتصال اینترنت قطع است. داده‌های همین نشست نمایش داده می‌شود و پیام‌های چت پس از اتصال ارسال می‌شوند. برای حفاظت از اطلاعات شما چیزی روی دستگاه ذخیره نمی‌شود.
    </div>
  );
}

export function OfflineBanner() {
  return <OfflineBannerView online={useOnline()} />;
}
