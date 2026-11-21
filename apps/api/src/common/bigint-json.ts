// BigInt در JSON پیش‌فرض خطا می‌دهد؛ مبالغ (ریال) به‌صورت رشته‌ی دهدهی سریالایز می‌شوند.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}
if (!(BigInt.prototype as { toJSON?: unknown }).toJSON) {
  BigInt.prototype.toJSON = function (this: bigint) {
    return this.toString();
  };
}
export {};
