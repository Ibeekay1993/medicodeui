import {
  deterministicFallbackAnalysis,
  type AnalysisResult,
} from "./brain.ts";
import {
  DETERMINISTIC_ONLY_WORKER_MODE,
  type WorkerProcessingMode,
} from "../_shared/whatsapp-worker-mode.ts";

export async function analyzeInboundBlock(
  processingMode: WorkerProcessingMode,
  text: string,
  conversation: unknown,
  analyzeWithProviders: () => Promise<AnalysisResult>,
): Promise<AnalysisResult> {
  if (processingMode === DETERMINISTIC_ONLY_WORKER_MODE) {
    if (hasUncertainAuthorizationDetails(text)) {
      return {
        intent: "INCOMPLETE_AUTHORIZATION",
        urgencyLevel: 3,
        missingInfo: ["Confirmed diagnosis and requested services"],
        isCancellationIntent: false,
        geminiFallback: true,
        requiresClinicalClarification: true,
      };
    }
    return deterministicFallbackAnalysis(text, conversation);
  }
  return analyzeWithProviders();
}

export function shouldHoldAuthorizationForClarification(
  processingMode: WorkerProcessingMode,
  analysis: AnalysisResult,
): boolean {
  return processingMode === DETERMINISTIC_ONLY_WORKER_MODE &&
    analysis.requiresClinicalClarification === true;
}

export function hasUncertainAuthorizationDetails(text: string): boolean {
  const value = String(text || "").trim();
  if (!value) return false;
  const uncertainty =
    /\b(?:maybe|perhaps|possibly|probable|probably|likely|not sure|unsure|uncertain|could be|might be|suspect(?:ed)?|rule[ -]out|either|versus|vs\.?)\b|\bor\b|\?/i;
  const clinicalField =
    /(?:^|\n)\s*(?:diagnosis|drugs?|treatment|procedures?|investigations?|services?|consultation)\s*(?::|;|-)/i;
  const authorizationContext =
    /\b(?:authorization|pre[- ]?authorization|preauth|request|submit)\b/i;
  const clinicalAlternatives =
    /(?:^|\n)\s*(?:diagnosis|drugs?|treatment|procedures?|investigations?|services?|consultation)\s*(?::|;|-)[^\n]*(?:\b(?:or|versus|vs\.?)\b|[A-Za-z]\s*\/\s*[A-Za-z])/i;
  if (clinicalAlternatives.test(value)) return true;
  return uncertainty.test(value) &&
    (clinicalField.test(value) || authorizationContext.test(value));
}
