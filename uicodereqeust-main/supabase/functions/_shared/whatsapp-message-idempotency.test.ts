import { describe, expect, it } from "vitest";
import { isDuplicateWebhookInsertError } from "./whatsapp-message-idempotency.ts";

describe("WhatsApp webhook message idempotency", () => {
  it("recognizes duplicate event inserts so the webhook does not wake a replay", () => {
    expect(
      isDuplicateWebhookInsertError(
        "duplicate key value violates unique constraint whatsapp_messages_message_id_key",
      ),
    ).toBe(true);
    expect(isDuplicateWebhookInsertError("database connection timeout")).toBe(false);
  });
});
