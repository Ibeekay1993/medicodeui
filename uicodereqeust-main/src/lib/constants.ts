/**
 * Application-wide constants.
 *
 * Keep ALL magic strings here — never hardcode them in components.
 * This is the single source of truth so a string change is a 1-line diff.
 */

// ── Email sentinels ──────────────────────────────────────────────────────────
/** Placeholder used when a patient has no email and will receive PIN via WhatsApp. */
export const NO_EMAIL_SENTINEL = "no-email@ronsbergerhmo.io";

/** Returns true if the given email is the no-email sentinel or a legacy variant. */
export function isNoEmailSentinel(email: string | null | undefined): boolean {
  if (!email) return false;
  return (
    email === NO_EMAIL_SENTINEL ||
    email.startsWith("no-email@") ||
    email.endsWith("@medicode.com")
  );
}

// ── Session timeouts (ms) ────────────────────────────────────────────────────
export const SESSION_TIMEOUT_HOSPITAL_MS  = 2  * 60 * 60 * 1000; // 2 hours
export const SESSION_TIMEOUT_STAFF_MS     = 5  * 60 * 60 * 1000; // 5 hours
export const SESSION_TIMEOUT_MAX_MS       = 10 * 60 * 60 * 1000; // 10 hours hard cap

// ── Pagination ───────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 50;

// ── API / domain ─────────────────────────────────────────────────────────────
// Never hardcode the base URL — always read from env.
// These helpers make it explicit and testable.
export const SUPABASE_URL       = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY  = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
