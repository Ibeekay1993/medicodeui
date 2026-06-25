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

