/** Return an accurate, non-sensitive explanation for a failed WhatsApp send. */
export async function getWhatsAppSendErrorMessage(data: unknown, error: unknown): Promise<string> {
  const invokeError = error as { message?: string; context?: Response } | null;
  let payload = data as { message?: string; error?: boolean } | null;

  if (!payload && invokeError?.context && typeof invokeError.context.clone === "function") {
    try {
      payload = await invokeError.context.clone().json();
    } catch {
      payload = null;
    }
  }

  const reason = String(payload?.message || "").toLowerCase();
  if (reason === "whatsapp_outbound_paused") {
    return "WhatsApp sending is paused. No message was sent. Resume outbound messaging before retrying.";
  }
  if (reason === "phone_number_invalid" || reason === "phone_number_required") {
    return "The recipient number is missing or invalid. Check the saved number and try again.";
  }
  if (reason === "evolution_not_configured") {
    return "WhatsApp delivery is not configured on the server. No message was sent.";
  }
  if (reason.startsWith("evolution_send_failed") || reason.startsWith("evolution_unreachable")) {
    return "The WhatsApp provider did not accept the send. Check the sender connection before retrying.";
  }

  const status = invokeError?.context?.status;
  if (status === 503) {
    return "WhatsApp sending is temporarily unavailable. No delivery was confirmed.";
  }
  return "WhatsApp delivery could not be confirmed. Check the send status before retrying.";
}
