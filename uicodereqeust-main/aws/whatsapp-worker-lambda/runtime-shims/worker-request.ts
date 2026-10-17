import {
  DETERMINISTIC_ONLY_WORKER_MODE,
  WORKER_PROCESSING_MODE_HEADER,
} from "../../../supabase/functions/_shared/whatsapp-worker-mode.ts";

export function createDeterministicWorkerRequest(
  payload: Record<string, unknown>,
  workerSecret: string,
): Request {
  return new Request("https://lambda.local/functions/v1/whatsapp-worker", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-secret": workerSecret,
      [WORKER_PROCESSING_MODE_HEADER]: DETERMINISTIC_ONLY_WORKER_MODE,
    },
    body: JSON.stringify(payload),
  });
}
