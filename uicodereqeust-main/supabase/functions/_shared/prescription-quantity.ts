export function extractFrequency(term: string) {
  const normalized = term.replace(/\t+/g, " ").replace(/\s+/g, " ");
  const upper = ` ${normalized.toUpperCase()} `;
  const patterns: Array<[RegExp, number, string]> = [
    [/(?:^|\s)(OD|DLY|DAILY|QD|Q\.D\.|QDAY|ONCE DAILY)(?:\s|X|$)/i, 1, "once daily"],
    [/(?:^|\s)(BD|BID|B\.I\.D\.|TWICE DAILY)(?:\s|X|$)/i, 2, "twice daily"],
    [/(?:^|\s)(TDS|TID|T\.I\.D\.|THREE TIMES DAILY)(?:\s|X|$)/i, 3, "three times daily"],
    [/(?:^|\s)(QID|Q\.I\.D\.|FOUR TIMES DAILY)(?:\s|X|$)/i, 4, "four times daily"],
    [/(?:^|\s)(HS|NOCTE|NIGHTLY|AT NIGHT)(?:\s|X|$)/i, 1, "nightly"],
    [/(?:^|\s)(PRN|WHEN REQUIRED|AS NEEDED)(?:\s|X|$)/i, 1, "as needed"],
    [/(?:^|\s)(STAT|IMMEDIATELY)(?:\s|X|$)/i, 1, "stat"],
  ];

  for (const [pattern, multiplier, label] of patterns) {
    if (pattern.test(upper)) return { multiplier, label };
  }
  return { multiplier: 1, label: "once daily" };
}

export function extractDurationDays(term: string) {
  const compact = term.replace(/\s+/g, "");
  const fraction = compact.match(/(?:x|for|×|\*)?(\d+)\/(7|12|52)(?!\d)/i);
  if (fraction) {
    const value = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator === 7) return { days: value, label: `${value} day${value === 1 ? "" : "s"}` };
    if (denominator === 12) return { days: value * 30, label: `${value} month${value === 1 ? "" : "s"}` };
    if (denominator === 52) return { days: value * 7, label: `${value} week${value === 1 ? "" : "s"}` };
  }

  if (/(?:\b|x|×|\*)12\b/i.test(compact)) {
    return { days: 30, label: "1 month" };
  }

  const days = term.match(/\b(\d+)\s*(?:days?|d)\b/i);
  if (days) return { days: Number(days[1]), label: `${Number(days[1])} day${Number(days[1]) === 1 ? "" : "s"}` };

  const weeks = term.match(/\b(\d+)\s*(?:weeks?|wks?|w)\b/i);
  if (weeks) return { days: Number(weeks[1]) * 7, label: `${Number(weeks[1])} week${Number(weeks[1]) === 1 ? "" : "s"}` };

  const months = term.match(/\b(\d+)\s*(?:months?|mths?|m)\b/i);
  if (months) return { days: Number(months[1]) * 30, label: `${Number(months[1])} month${Number(months[1]) === 1 ? "" : "s"}` };

  const supplyDays = [...term.matchAll(/(?:^|\s)(?:x|×|\*)\s*(\d+)\b(?!\s*\/)/gi)].at(-1);
  if (supplyDays) {
    const days = Number(supplyDays[1]);
    return { days, label: `${days} day${days === 1 ? "" : "s"}` };
  }

  if (compact.match(/dly|daily|once/i)) return { days: 30, label: "30 days" };

  return { days: 1, label: "single service" };
}

export function extractDoseMultiplier(term: string) {
  // eslint-disable-next-line security/detect-unsafe-regex
  const dose = term.match(/\b(?:take\s*)?(\d+(?:\.\d+)?)\s*(?:tabs?|tablets?|caps?|capsules?)\b/i);
  const parsed = dose ? Number(dose[1]) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function extractExplicitQuantity(term: string) {
  const matches = [...term.matchAll(/(?:^|\s)(?:x|×|\*)\s*(\d+)\b(?!\s*\/)/gi)];
  const match = matches.at(-1);
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : null;
}

export function calculateMedicationQuantity(term: string, frequencyMultiplier: number) {
  return Math.max(1, Math.ceil(frequencyMultiplier * extractDurationDays(term).days * extractDoseMultiplier(term)));
}
