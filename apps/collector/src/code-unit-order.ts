/** Compares two strings by UTF-16 code units, so an order does not depend on the machine's locale. */
export function byCodeUnits(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}
