import { timingSafeEqual } from "node:crypto";
import { ChangeMessageVisibilityCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { resolveWorkerHandler } from "./runtime-shims/worker-handler.ts";

const STAGING_ACK = "STAGING_ONLY_NOT_PRODUCTION";
const PRODUCTION_CUTOVER_ACK = "PRODUCTION_WHATSAPP_WORKER_CUTOVER_20261008";
const BLOCKED_PRODUCTION_PROJECT_REF = "optistuvyeiojlgmkdks";
const REQUIRED_WORKER_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WHATSAPP_WORKER_SECRET",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
] as const;

type JsonRecord = Record<string, unknown>;
type LambdaEvent = JsonRecord & {
  action?: string;
  payload?: JsonRecord;
  Records?: SqsEventRecord[];
  version?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
};

type LambdaContext = {
  callbackWaitsForEmptyEventLoop?: boolean;
  getRemainingTimeInMillis?: () => number;
};

type SqsEventRecord = {
  messageId: string;
  receiptHandle: string;
  body: string;
};

const sqsClient = new SQSClient({ region: process.env.AWS_REGION || "eu-west-1" });

function json(statusCode: number, body: JsonRecord) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function getProcessingGateReason(): string | null {
  const env = process.env;
  if (env.WHATSAPP_LAMBDA_PROCESSING_ENABLED !== "true") {
    return "processing_not_enabled";
  }

  const missing = REQUIRED_WORKER_ENV.filter((name) => !env[name]);
  if (missing.length > 0) return "worker_configuration_incomplete";

  let projectRef = "";
  try {
    projectRef = new URL(env.SUPABASE_URL!).hostname.split(".")[0].toLowerCase();
  } catch {
    return "supabase_url_invalid";
  }

  try {
    const evolutionUrl = new URL(env.EVOLUTION_API_URL!);
    if (evolutionUrl.protocol !== "https:" || !evolutionUrl.hostname) {
      return "evolution_api_url_invalid";
    }
  } catch {
    return "evolution_api_url_invalid";
  }

  if (env.WHATSAPP_LAMBDA_PILOT_MODE === "staging") {
    if (env.WHATSAPP_LAMBDA_STAGING_ACK !== STAGING_ACK) {
      return "staging_acknowledgement_missing";
    }
    if (!projectRef || projectRef === BLOCKED_PRODUCTION_PROJECT_REF) {
      return "production_supabase_project_blocked";
    }
    if (env.WHATSAPP_LAMBDA_STAGING_PROJECT_REF?.toLowerCase() !== projectRef) {
      return "staging_project_ref_mismatch";
    }
    return null;
  }

  if (env.WHATSAPP_LAMBDA_PILOT_MODE === "production-cutover") {
    if (env.WHATSAPP_LAMBDA_PRODUCTION_CUTOVER_ACK !== PRODUCTION_CUTOVER_ACK) {
      return "production_cutover_acknowledgement_missing";
    }
    if (projectRef !== BLOCKED_PRODUCTION_PROJECT_REF) {
      return "production_project_ref_mismatch";
    }
    if (env.WHATSAPP_LAMBDA_PRODUCTION_PROJECT_REF?.toLowerCase() !== projectRef) {
      return "production_project_ref_not_confirmed";
    }
    return null;
  }

  return "pilot_mode_not_configured";
}

function isFunctionUrlEvent(event: LambdaEvent): boolean {
  return event.version === "2.0" && Boolean(event.requestContext?.http);
}

function readHeader(headers: LambdaEvent["headers"], name: string): string {
  if (!headers) return "";
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? String(headers[key] || "") : "";
}

function parseObject(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function normalizeWorkPayload(value: unknown): JsonRecord | null {
  const payload = parseObject(value);
  if (!payload) return null;

  const messageId = typeof payload.message_id === "string" ? payload.message_id.trim() : "";
  if (messageId && messageId.length <= 256 && /^[A-Za-z0-9._:-]+$/.test(messageId)) {
    return { message_id: messageId };
  }

  const authorizationRequestId = typeof payload.authorization_request_id === "string"
    ? payload.authorization_request_id.trim()
    : "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authorizationRequestId)) {
    return { authorization_request_id: authorizationRequestId };
  }

  if (payload.poll === true) return { poll: true };
  return null;
}

function functionUrlPayload(event: LambdaEvent): { action: string; payload?: JsonRecord } | { error: string; statusCode: number } {
  if (event.requestContext?.http?.method?.toUpperCase() !== "POST") {
    return { error: "method_not_allowed", statusCode: 405 };
  }

  const expectedSecret = process.env.WHATSAPP_WORKER_SECRET || "";
  const suppliedSecret = readHeader(event.headers, "x-worker-secret");
  if (!expectedSecret || !constantTimeEqual(suppliedSecret, expectedSecret)) {
    return { error: "forbidden", statusCode: 403 };
  }

  let rawBody = event.body || "";
  if (event.isBase64Encoded) rawBody = Buffer.from(rawBody, "base64").toString("utf8");
  let body: JsonRecord | null;
  try {
    body = parseObject(rawBody ? JSON.parse(rawBody) : null);
  } catch {
    return { error: "invalid_json", statusCode: 400 };
  }
  if (!body) return { error: "invalid_json_object", statusCode: 400 };

  if (body.action === "health") return { action: "health" };

  const nestedPayload = parseObject(body.payload);
  const payload = nestedPayload || body;
  const normalizedPayload = normalizeWorkPayload(payload);
  if (!normalizedPayload) {
    return { error: "targeted_worker_action_required", statusCode: 400 };
  }

  return { action: "enqueue", payload: normalizedPayload };
}

async function setRetryVisibility(record: SqsEventRecord, seconds: number) {
  const queueUrl = process.env.WHATSAPP_WORKER_QUEUE_URL;
  if (!queueUrl) throw new Error("worker_queue_url_missing");
  await sqsClient.send(new ChangeMessageVisibilityCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: record.receiptHandle,
    VisibilityTimeout: Math.max(1, Math.min(43_200, Math.ceil(seconds))),
  }));
}

async function invokeWorker(payload: JsonRecord, remainingMs: number) {
  const workerHandler = await resolveWorkerHandler();
  const response = await workerHandler(new Request("https://lambda.local/functions/v1/whatsapp-worker", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-secret": process.env.WHATSAPP_WORKER_SECRET!,
    },
    body: JSON.stringify(payload),
  }));
  const body = await response.text();
  await flushWaitUntilTasks(Math.min(8_000, remainingMs - 2_000));
  return { statusCode: response.status, body };
}

async function handleSqsRecords(records: SqsEventRecord[], context: LambdaContext) {
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of records) {
    try {
      const payload = normalizeWorkPayload(JSON.parse(record.body));
      if (!payload) throw new Error("invalid_worker_queue_message");

      if (getProcessingGateReason()) {
        await setRetryVisibility(record, 300);
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      const remainingMs = context.getRemainingTimeInMillis?.() ?? 120_000;
      if (remainingMs < 15_000) {
        await setRetryVisibility(record, 30);
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      const result = await invokeWorker(payload, remainingMs);
      if (result.statusCode >= 400) {
        await setRetryVisibility(record, 30);
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      let responseBody: JsonRecord | null = null;
      try {
        responseBody = parseObject(JSON.parse(result.body));
      } catch {
        // A completed worker response without retry metadata is acknowledged.
      }
      const retryAfterMs = Number(responseBody?.retryAfterMs || 0);
      if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
        await setRetryVisibility(record, retryAfterMs / 1_000);
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    } catch (error) {
      console.error("WhatsApp SQS item failed", {
        messageId: record.messageId,
        message: error instanceof Error ? error.message : "unknown",
      });
      try {
        await setRetryVisibility(record, 30);
      } catch (visibilityError) {
        console.error("WhatsApp SQS visibility update failed", {
          messageId: record.messageId,
          message: visibilityError instanceof Error ? visibilityError.message : "unknown",
        });
      }
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}

export async function handler(event: LambdaEvent = {}, context: LambdaContext = {}) {
  context.callbackWaitsForEmptyEventLoop = false;

  if (Array.isArray(event.Records)) {
    return handleSqsRecords(event.Records, context);
  }

  let action = event.action || "";
  let payload = parseObject(event.payload) || {};
  const fromFunctionUrl = isFunctionUrlEvent(event);

  if (fromFunctionUrl) {
    const parsed = functionUrlPayload(event);
    if ("error" in parsed) return json(parsed.statusCode, { ok: false, error: parsed.error });
    action = parsed.action;
    payload = parsed.payload || {};
  }

  if (action === "health") {
    const gateReason = getProcessingGateReason();
    const queueConfigured = Boolean(process.env.WHATSAPP_WORKER_QUEUE_URL);
    return json(200, {
      ok: true,
      service: "whatsapp-worker-lambda-pilot",
      state: gateReason ? "inert" : queueConfigured ? "ready" : "queue_not_configured",
      workerLoaded: false,
      processingEnabled: !gateReason,
      queueConfigured,
      region: process.env.AWS_REGION || "unknown",
    });
  }

  if (action !== "enqueue") {
    return json(400, { ok: false, error: "unsupported_action" });
  }

  const blockReason = getProcessingGateReason();
  if (blockReason) {
    return json(409, { ok: false, error: "worker_gate_closed", reason: blockReason });
  }

  const queueUrl = process.env.WHATSAPP_WORKER_QUEUE_URL;
  if (!queueUrl) {
    return json(503, { ok: false, error: "worker_queue_not_configured" });
  }

  try {
    const queued = await sqsClient.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
    }));
    return json(202, { ok: true, queued: true, queueMessageId: queued.MessageId || null });
  } catch (error) {
    console.error("WhatsApp SQS enqueue failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return json(503, { ok: false, error: "worker_enqueue_failed" });
  }
}

const pendingWaitUntilTasks = new Set<Promise<unknown>>();

Object.assign(globalThis, {
  Deno: {
    env: {
      get: (name: string) => process.env[name] ?? null,
    },
  },
  EdgeRuntime: {
    waitUntil(promise: Promise<unknown>) {
      pendingWaitUntilTasks.add(promise);
      void promise.then(
        () => pendingWaitUntilTasks.delete(promise),
        () => pendingWaitUntilTasks.delete(promise),
      );
    },
  },
});

async function flushWaitUntilTasks(timeoutMs: number) {
  if (pendingWaitUntilTasks.size === 0 || timeoutMs <= 0) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled([...pendingWaitUntilTasks]),
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
}
