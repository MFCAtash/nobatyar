"use client";
import { useRef, type ChangeEvent, type KeyboardEvent } from "react";

export interface ComposerProps {
  value: string;
  uploading: boolean;
  onChange: (v: string) => void;
  onSend: () => void;
  onFile: (file: File) => void;
}

/** نوار ارسال پیام: Enter = ارسال، Shift+Enter = خط جدید. */
export function Composer({ value, uploading, onChange, onSend, onFile }: ComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend(); }
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = ""; // انتخاب دوباره‌ی همان فایل هم رویداد بدهد
  };
  return (
    <div className="composer">
      <input ref={fileRef} type="file" className="hidden" tabIndex={-1} accept="image/*,.pdf,.doc,.docx,.txt" onChange={onPick} />
      <button type="button" className="btn btn-ghost composer-attach" disabled={uploading} onClick={() => fileRef.current?.click()} aria-label="پیوست فایل">
        {uploading ? "⏳" : "📎"}
      </button>
      <textarea
        className="composer-input" rows={1} value={value} aria-label="متن پیام"
        placeholder="پیام بنویسید… (Enter برای ارسال)"
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKey}
        onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; }}
      />
      <button type="button" className="btn btn-primary composer-send" disabled={!value.trim()} onClick={onSend} aria-label="ارسال پیام">ارسال</button>
    </div>
  );
}
