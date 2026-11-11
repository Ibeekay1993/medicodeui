export async function getSupabaseFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === "object") {
    const context = (error as { context?: unknown }).context;
    if (context && typeof context === "object" && "json" in context && typeof context.json === "function") {
      try {
        const response = context as Response;
        const body = await (typeof response.clone === "function" ? response.clone() : response).json();
        if (body && typeof body.message === "string" && body.message.trim()) return body.message;
      } catch {
        // Fall through to the safe generic message.
      }
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() && !message.toLowerCase().includes("non-2xx")) {
      return message;
    }
  }
  return fallback;
}

export async function getSupabaseFunctionResponseMessage(
  data: unknown,
  error: unknown,
  fallback: string,
): Promise<string> {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return getSupabaseFunctionErrorMessage(error, fallback);
}
