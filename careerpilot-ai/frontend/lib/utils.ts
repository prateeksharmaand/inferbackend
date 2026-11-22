import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNowStrict } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const IST = "Asia/Kolkata";

/** Format a UTC ISO timestamp in Asia/Kolkata. */
export function fmtDate(iso?: string | null, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const opts: Intl.DateTimeFormatOptions = { timeZone: IST, day: "2-digit", month: "short", year: "numeric" };
  if (withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit", hour12: true });
  return new Intl.DateTimeFormat("en-IN", opts).format(d);
}

export function ago(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${formatDistanceToNowStrict(d)} ago`;
}

export function isoDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

/** Salary convention: values are INR lakhs per annum (LPA). */
export function fmtLpa(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return "Not disclosed";
  if (min != null && max != null && min !== max) return `₹${min}–${max} LPA`;
  return `₹${min ?? max} LPA`;
}

export function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
