import { z } from "zod";

export const FamilyMemberSchema = z.object({
  fullName:   z.string().min(2).max(60),
  relation:   z.string().min(1).max(30),
  birthYear:  z.number().int().min(1300).max(1420).optional(),
  nationalId: z.string().regex(/^\d{10}$/, "کد ملی باید ۱۰ رقم باشد").optional(),
});
export type FamilyMemberInput = z.infer<typeof FamilyMemberSchema>;
