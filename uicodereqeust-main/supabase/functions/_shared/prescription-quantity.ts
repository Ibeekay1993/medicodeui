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

/**
 * Strip parenthetical annotations that hospitals append to a prescription list,
 * such as "(30 TABS EACH)", "(30 TABS)", "(30 TABLETS)", "(60 TABS)", "(14 TABS EACH)", "(30 EACH)".
 * These are hospital package/supply notes and should NOT be treated as per-dose counts.
 */
function stripTabsEachAnnotation(term: string): string {
  return term
    .replace(/\(\s*\d+\s*(?:tabs?|caps?|capsules?|tablets?|pcs?|pieces?)?\s*(?:each|ea|for the rest)?\s*\)/gi, "")
    .trim();
}

export function extractDurationDays(term: string) {
  // Strip parenthetical annotations before any duration parsing
  const cleaned = stripTabsEachAnnotation(term);
  const compact = cleaned.replace(/\s+/g, "");
  // Support both / and \ in fractions like 1/12 or 1\12
  const fraction = compact.match(/(?:x|for|×|\*)?(\d+)[/\\](7|12|52)(?!\d)/i);
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

  const days = cleaned.match(/\b(\d+)\s*(?:days?|d)\b/i);
  if (days) return { days: Number(days[1]), label: `${Number(days[1])} day${Number(days[1]) === 1 ? "" : "s"}` };

  const weeks = cleaned.match(/\b(\d+)\s*(?:weeks?|wks?|w)\b/i);
  if (weeks) return { days: Number(weeks[1]) * 7, label: `${Number(weeks[1])} week${Number(weeks[1]) === 1 ? "" : "s"}` };

  const months = cleaned.match(/\b(\d+)\s*(?:months?|mths?|m)\b/i);
  if (months) return { days: Number(months[1]) * 30, label: `${Number(months[1])} month${Number(months[1]) === 1 ? "" : "s"}` };

  const supplyDays = [...cleaned.matchAll(/(?:^|\s)(?:x|×|\*)\s*(\d+)\b(?!\s*[/\\d])/gi)].at(-1);
  if (supplyDays) {
    const days = Number(supplyDays[1]);
    return { days, label: `${days} day${days === 1 ? "" : "s"}` };
  }

  if (compact.match(/dly|daily|once/i)) return { days: 30, label: "30 days" };

  return { days: 1, label: "single service" };
}

export function extractDoseMultiplier(term: string) {
  // Strip "(N TABS EACH)" annotations first so they are not mis-read as per-dose count
  const cleaned = stripTabsEachAnnotation(term);
  // eslint-disable-next-line security/detect-unsafe-regex
  const dose = cleaned.match(/\b(?:take\s*)?(\d+(?:\.\d+)?)\s*(?:tabs?|tablets?|caps?|capsules?)\b/i);
  const parsed = dose ? Number(dose[1]) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Detects unit-based prescriptions such as "1 pen", "2 pens", "1 cartridge",
 * "1 vial", "1 ampoule", "1 inhaler" where the prescriber specifies a discrete
 * physical unit count rather than a tab/frequency/duration regime.
 *
 * Returns the explicit unit quantity (e.g. 1 for "Lantus insulin 1 pen")
 * or null if no unit-based quantity is found.
 *
 * When this returns a non-null value, callers should use it directly
 * instead of running the frequency × duration formula.
 */
export function extractUnitQuantity(term: string): number | null {
  // Match patterns like "1 pen", "2 pens", "1 cartridge", "3 vials", "1 ampoule", "1 inhaler"
  // eslint-disable-next-line security/detect-unsafe-regex
  const unitMatch = term.match(
    /\b(\d+)\s*(?:pens?|cartridges?|vials?|ampoules?|inhalers?|prefilled\s*syringes?|auto[- ]?injectors?)\b/i
  );
  if (unitMatch) {
    const qty = Number(unitMatch[1]);
    return Number.isFinite(qty) && qty > 0 ? qty : null;
  }
  return null;
}

export function extractExplicitQuantity(term: string) {
  const matches = [...term.matchAll(/(?:^|\s)(?:x|×|\*)\s*(\d+)\b(?!\s*\/)/gi)];
  const match = matches.at(-1);
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : null;
}

export function calculateMedicationQuantity(term: string, frequencyMultiplier: number) {
  // If the prescription specifies a discrete physical unit (pen, vial, cartridge, etc.),
  // use that count directly — do NOT multiply by frequency × duration.
  // e.g. "Lantus insulin 1 pen" → 1 pen, not 30 vials.
  const unitQty = extractUnitQuantity(term);
  if (unitQty !== null) return unitQty;

  return Math.max(1, Math.ceil(frequencyMultiplier * extractDurationDays(term).days * extractDoseMultiplier(term)));
}
