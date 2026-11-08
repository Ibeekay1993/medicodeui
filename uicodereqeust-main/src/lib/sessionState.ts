export function readSessionJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn("Unable to read session draft:", key, error);
    return null;
  }
}

export function writeSessionJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Unable to persist session draft:", key, error);
  }
}

export function removeSessionItem(key: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(key);
  } catch (error) {
    console.warn("Unable to clear session draft:", key, error);
  }
}

/**
 * Clears all cached patient searches, audit decisions, and draft objects from
 * client storage upon logout or session timeout to maintain patient privacy
 * under the Nigeria Data Protection Act (NDPA).
 */
export function clearPatientAndSessionData() {
  if (typeof window === "undefined") return;

  try {
    const sessionKeysToRemove = [
      "req_search",
      "req_status_filter",
      "req_date_filter",
      "req_page",
      "ronsberger_whatsapp_raw",
      "ronsberger_whatsapp_parsed",
      "ronsberger-reset-submitting",
    ];

    for (const key of sessionKeysToRemove) {
      window.sessionStorage.removeItem(key);
    }

    const sessionKeys = Object.keys(window.sessionStorage);
    for (const k of sessionKeys) {
      if (
        k.startsWith("claim_audit_") ||
        k.startsWith("ronsberger-role-") ||
        k.startsWith("ronsberger-hosp-") ||
        k.startsWith("ronsberger-name-") ||
        k.startsWith("ronsberger-lead-")
      ) {
        window.sessionStorage.removeItem(k);
      }
    }

    const localKeysToRemove = [
      "medcode_auth_import_draft_v1",
      "historical_auth_import_draft",
    ];

    for (const key of localKeysToRemove) {
      window.localStorage.removeItem(key);
    }

    const localKeys = Object.keys(window.localStorage);
    for (const k of localKeys) {
      if (k.startsWith("draft_") || k.startsWith("claim_draft_")) {
        window.localStorage.removeItem(k);
      }
    }
  } catch (error) {
    console.warn("Unable to clear patient session data:", error);
  }
}
