/** کلیدهای یکتا و پایدار برای cache (یک منبع واحد؛ invalidate هم از همین‌جا). */
export const qk = {
  specialties: () => ["specialties"] as const,
  doctors: (f: { q: string; specialty: string }) => ["doctors", f.q, f.specialty] as const,
  doctor: (id: string) => ["doctor", id] as const,
  slots: (doctorId: string, day: string) => ["slots", doctorId, day] as const,
  appointments: (query: string) => ["appointments", query] as const,
  conversations: () => ["conversations"] as const,
  records: (category: string) => ["records", category] as const,
  record: (id: string) => ["record", id] as const,
};
export const qkRoot = { appointments: ["appointments"] as const, records: ["records"] as const, record: ["record"] as const, slots: ["slots"] as const };
