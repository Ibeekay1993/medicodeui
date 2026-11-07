export interface ArrivalOtpInput {
  phone_number?: unknown;
  otp_code?: unknown;
  hospital_name?: unknown;
  patient_name?: unknown;
  diagnosis?: unknown;
  items?: unknown;
}

export interface ArrivalOtpPayload {
  number: string;
  text: string;
}

function cleanField(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength);
}

export function normalizeEvolutionPhoneNumber(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  let normalized = digits;
  if (digits.startsWith("234")) normalized = digits;
  else if (digits.length === 10) normalized = `234${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) normalized = `234${digits.slice(1)}`;

  return /^\d{10,15}$/.test(normalized) ? normalized : null;
}

export function buildArrivalOtpPayload(input: ArrivalOtpInput): ArrivalOtpPayload | null {
  const number = normalizeEvolutionPhoneNumber(input.phone_number);
  const otpCode = cleanField(input.otp_code, 32);
  if (!number || !otpCode) return null;

  const patientName = cleanField(input.patient_name, 120) || "Patient";
  const hospitalName = cleanField(input.hospital_name, 180) || "the hospital";
  const diagnosis = cleanField(input.diagnosis, 400);
  const diagnosisText = diagnosis ? `\n*Diagnosis:* ${diagnosis}` : "";

  const items = Array.isArray(input.items) ? input.items.slice(0, 50) : [];
  const itemLines = items.map((value: unknown) => {
    if (!value || typeof value !== "object") return "";
    const item = value as Record<string, unknown>;
    const quantity = cleanField(item.quantity, 12) || "1";
    const name = cleanField(item.name, 120) || "Service";
    return item.declined ? `~${quantity}x ${name}~ (Rejected)` : `✅ ${quantity}x ${name}`;
  }).filter(Boolean);
  const itemsText = itemLines.length ? `\n\n*Requested Services:*\n${itemLines.join("\n")}` : "";

  const text = `Hello ${patientName}!\n\nA new authorization request has been approved for you at ${hospitalName}.${diagnosisText}${itemsText}\n\nYour Arrival PIN is: *${otpCode}*\n\nThank you,\n*Ronsberger HMO*`;
  if (text.length > 4000) return null;
  return { number, text };
}
