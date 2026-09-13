import { clsx, type ClassValue } from "clsx";

/** Conditional class names. Tailwind 4 has no conflicting-utility merge need at our scale. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
