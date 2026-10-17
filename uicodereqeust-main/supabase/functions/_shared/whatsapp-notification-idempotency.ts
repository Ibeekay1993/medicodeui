export function getDecisionNotificationIdempotency(
  authorizationId: string,
  decisionAt: string | null | undefined,
  recipientType: string,
): { messageId: string; operationKey: string } {
  return {
    messageId: `decision-notification:${authorizationId}:${decisionAt}:${recipientType}`,
    operationKey: `authorization_decision_${recipientType}`,
  };
}
