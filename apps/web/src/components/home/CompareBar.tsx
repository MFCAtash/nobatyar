import Link from "next/link";
import { Num } from "@/components/kit";

export function CompareBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  if (ids.length < 2) return null;
  return (
    <div className="compare-bar" role="region" aria-label="مقایسه‌ی پزشکان">
      <span className="muted small"><Num value={ids.length} /> پزشک انتخاب‌شده</span>
      <div className="row gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>پاک کردن</button>
        <Link className="btn btn-primary btn-sm" href={`/compare?ids=${ids.join(",")}`}>مقایسه کن</Link>
      </div>
    </div>
  );
}
