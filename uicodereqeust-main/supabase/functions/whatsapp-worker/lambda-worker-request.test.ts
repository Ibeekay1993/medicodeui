import { describe, expect, it } from "vitest";
import { createDeterministicWorkerRequest } from "../../../aws/whatsapp-worker-lambda/runtime-shims/worker-request.ts";
import {
  DETERMINISTIC_ONLY_WORKER_MODE,
  WORKER_PROCESSING_MODE_HEADER,
} from "../_shared/whatsapp-worker-mode.ts";

describe("AWS worker invocation request", () => {
  it("selects deterministic-only mode for the shared worker", async () => {
    const payload = { message_id: "message-test-id" };
    const request = createDeterministicWorkerRequest(payload, "test-only-secret");

    expect(request.headers.get(WORKER_PROCESSING_MODE_HEADER)).toBe(
      DETERMINISTIC_ONLY_WORKER_MODE,
    );
    expect(request.headers.get("x-worker-secret")).toBe("test-only-secret");
    expect(await request.json()).toEqual(payload);
  });
});
