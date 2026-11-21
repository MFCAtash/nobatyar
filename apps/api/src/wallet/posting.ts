export interface PostingLineLike {
  direction: "DEBIT" | "CREDIT";
  amountRial: bigint;
}

export interface PostingInputLike {
  lines: PostingLineLike[];
}

/** بررسی خالص تعادل دفتر کل: ΣDEBIT = ΣCREDIT و هر مبلغ مثبت. */
export function validatePosting(input: PostingInputLike): { ok: true } | { ok: false; error: "unbalanced_posting" | "invalid_amount" } {
  let debit = 0n;
  let credit = 0n;
  for (const line of input.lines) {
    if (line.amountRial <= 0n) return { ok: false, error: "invalid_amount" };
    if (line.direction === "DEBIT") debit += line.amountRial;
    else credit += line.amountRial;
  }
  if (debit === 0n || debit !== credit) return { ok: false, error: "unbalanced_posting" };
  return { ok: true };
}
