export const PRODUCTION_BREVO_SENDER = Object.freeze({
  name: "Ronsberger HMO",
  email: "noreply@ronsbergerhmo.io",
});

export function getBrevoSender(): { name: string; email: string } {
  return { ...PRODUCTION_BREVO_SENDER };
}
