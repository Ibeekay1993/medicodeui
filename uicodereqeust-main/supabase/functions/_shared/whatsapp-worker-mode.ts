export const WORKER_PROCESSING_MODE_HEADER = "x-worker-processing-mode";
export const WORKER_PROCESSING_MODE_FIELD = "worker_processing_mode";
export const PENDING_WORKER_MODE_FIELD = "_worker_processing_mode";
export const MANUAL_TARIFF_REVIEW_NOTE =
  "Requested tariff items require manual confirmation; automatic matching was skipped.";

export const AI_CAPABLE_WORKER_MODE = "ai-capable" as const;
export const DETERMINISTIC_ONLY_WORKER_MODE = "deterministic-only" as const;

export type WorkerProcessingMode =
  | typeof AI_CAPABLE_WORKER_MODE
  | typeof DETERMINISTIC_ONLY_WORKER_MODE;

export function resolveWorkerProcessingMode(value: unknown): WorkerProcessingMode {
  return value === DETERMINISTIC_ONLY_WORKER_MODE
    ? DETERMINISTIC_ONLY_WORKER_MODE
    : AI_CAPABLE_WORKER_MODE;
}

export function canReusePendingData(
  processingMode: WorkerProcessingMode,
  pendingMode: unknown,
): boolean {
  return processingMode !== DETERMINISTIC_ONLY_WORKER_MODE ||
    pendingMode === DETERMINISTIC_ONLY_WORKER_MODE;
}

export function withWorkerModeOnPendingData<T extends Record<string, unknown>>(
  pendingData: T,
  processingMode: WorkerProcessingMode,
): T | (T & { _worker_processing_mode: typeof DETERMINISTIC_ONLY_WORKER_MODE }) {
  if (processingMode !== DETERMINISTIC_ONLY_WORKER_MODE) return pendingData;
  return {
    ...pendingData,
    [PENDING_WORKER_MODE_FIELD]: DETERMINISTIC_ONLY_WORKER_MODE,
  } as T & { _worker_processing_mode: typeof DETERMINISTIC_ONLY_WORKER_MODE };
}

export function shouldAutoMatchTariffItems(
  source: unknown,
  processingMode: unknown,
): boolean {
  return String(source || "").toLowerCase() !== "whatsapp" ||
    resolveWorkerProcessingMode(processingMode) !== DETERMINISTIC_ONLY_WORKER_MODE;
}

export function getClinicalReviewNote(
  processingMode: WorkerProcessingMode,
): string | null {
  return processingMode === DETERMINISTIC_ONLY_WORKER_MODE
    ? MANUAL_TARIFF_REVIEW_NOTE
    : null;
}
