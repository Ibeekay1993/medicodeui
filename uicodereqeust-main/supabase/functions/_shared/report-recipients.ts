export const MAX_DAILY_REPORT_RECIPIENTS = 10;

/** Accept arrays for current settings and delimiters for legacy settings. */
export function splitReportRecipientValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  const entries = values
    .filter((item): item is string => typeof item === "string")
    .flatMap((item) => item.split(/[,;\n]+/))
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return entries.filter((email) => {
    const key = email.toLocaleLowerCase("en-US");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseReportRecipients(value: unknown): {
  recipients: string[];
  invalid: string[];
  tooMany: boolean;
} {
  const entries = splitReportRecipientValues(value);
  const recipients: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const email of entries) {
    if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
      invalid.push(email);
      continue;
    }

    const key = email.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }

  return {
    recipients,
    invalid,
    tooMany: recipients.length > MAX_DAILY_REPORT_RECIPIENTS,
  };
}

/** Validate the editable settings form where each field must hold one address. */
export function parseReportRecipientFields(value: unknown): {
  recipients: string[];
  invalid: string[];
  tooMany: boolean;
  multiple: string[];
} {
  const fields = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  const multiple = fields
    .map((field) => field.trim())
    .filter((field) => /[,;\r\n]/.test(field));

  if (multiple.length > 0) {
    return { recipients: [], invalid: [], tooMany: false, multiple };
  }

  return { ...parseReportRecipients(fields), multiple: [] };
}
