export function isDuplicateWebhookInsertError(errorMessage: unknown): boolean {
  return String(errorMessage || "").toLowerCase().includes("duplicate");
}
