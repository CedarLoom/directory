// zod's declarations name the WHATWG URL class as a type; the logic layer's lib leaves it out, so this declares the part they use.
interface URL {
  readonly href: string;
}
