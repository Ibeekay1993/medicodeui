// Centralized email template for all Ronsberger HMO patient-facing emails.
// All emails MUST use this template to ensure consistent branding.

export interface EmailTemplateConfig {
  headerGradient?: string;
  headerColor?: string;
  accentColor?: string;
  logoUrl?: string;
  companyName?: string;
  companyAccentName?: string;
  companyAccentColor?: string;
  supportEmail?: string;
  supportPhone?: string;
  footerText?: string;
}

const DEFAULT_CONFIG: EmailTemplateConfig = {
  headerGradient: "linear-gradient(135deg,#0F6E56 0%,#0a5242 100%)",
  headerColor: "#0F6E56",
  accentColor: "#93c34b",
  logoUrl: "https://medicodeui.web.app/ronsberger-logo.png",
  companyName: "Ronsberger ",
  companyAccentName: "HMO",
  companyAccentColor: "#93c34b",
  supportEmail: "ronsbergercallcentre@gmail.com",
  supportPhone: "08083366550",
  footerText: "Ronsberger HMO - Clinical Authorization Platform",
};

/**
 * Config for rejection / decline emails (uses warm amber/red header tone).
 */
export const REJECTION_CONFIG: EmailTemplateConfig = {
  ...DEFAULT_CONFIG,
  headerGradient: "linear-gradient(135deg,#b91c1c 0%,#991b1b 100%)",
  headerColor: "#b91c1c",
  accentColor: "#fca5a5",
  companyAccentColor: "#fca5a5",
};

/**
 * Config for referral notification emails (uses blue header tone).
 */
export const REFERRAL_CONFIG: EmailTemplateConfig = {
  ...DEFAULT_CONFIG,
  headerGradient: "linear-gradient(135deg,#1d4ed8 0%,#1e40af 100%)",
  headerColor: "#1d4ed8",
  accentColor: "#93c4f4",
  companyAccentColor: "#93c4f4",
};


/**
 * Strip NHIA codes and pricing from a treatment item string.
 * Handles formats:
 *   "NHIA-CODE - Medication Name 125mg (Qty: 1 x ₦440 = ₦440)"
 *   "CODE - Medication Name"
 *   "Medication Name"
 * Returns only the medication/treatment name without codes or pricing.
 */
export function stripCodesAndPricing(item: string): string {
  let cleaned = item.trim();
  
  // Remove trailing parenthetical pricing info like "(Qty: 1 x ₦440 = ₦440)"
  cleaned = cleaned.replace(/\s*\([^)]*[₦$£€][^)]*\)\s*$/g, "").trim();
  cleaned = cleaned.replace(/\s*\(Qty:[^)]*\)\s*$/gi, "").trim();
  
  // Remove NHIA-style codes at the beginning: "NHIA-02-03-04 - " or "CODE - "
  const codePrefixMatch = cleaned.match(/^([A-Za-z0-9/-]+)\s*-\s+(.+)/);
  if (codePrefixMatch) {
    // If the first part looks like a code (contains digits and hyphens), keep only the name
    if (/[0-9]/.test(codePrefixMatch[1]) || /^NHIA/i.test(codePrefixMatch[1])) {
      cleaned = codePrefixMatch[2].trim();
    }
  }
  
  // Remove any remaining standalone pricing patterns
  // eslint-disable-next-line security/detect-unsafe-regex
  cleaned = cleaned.replace(/[₦$£€]\s*[\d,]+\.?\d*\s*(\s*x\s*[₦$£€]\s*[\d,]+\.?\d*)?/g, "").trim();
  
  return cleaned;
}

/**
 * Extract just the service name from an approved_items array item.
 */
export function extractServiceName(rawItem: Record<string, unknown>): string {
  const possibleName = rawItem?.name ?? rawItem?.item_name ?? "Service";
  const asString = String(possibleName);
  
  // If the name is combined like: "NHIA-CODE - Service Name" keep only the name part
  const cleaned = stripCodesAndPricing(asString);
  
  return cleaned || asString.trim();
}

/**
 * Build the header/hero section of the email.
 */
function buildHeader(title: string, subtitle: string, config: EmailTemplateConfig): string {
  return `
    <tr>
      <td style="background:${config.headerGradient};padding:28px 32px;text-align:center;">
        <div style="margin-bottom:14px;">
          <img src="${config.logoUrl}" alt="${config.companyName}${config.companyAccentName} Logo" width="52" height="52" style="display:inline-block;border-radius:10px;background:rgba(255,255,255,0.15);padding:6px;object-fit:contain;" />
        </div>
        <div style="margin-bottom:12px;">
          <span style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">${config.companyName}</span><span style="color:${config.companyAccentColor};font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">${config.companyAccentName}</span>
        </div>
        <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">${title}</h1>
        <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:12px;font-weight:500;letter-spacing:1px;text-transform:uppercase;">${subtitle}</p>
      </td>
    </tr>`;
}

/**
 * Build the footer of the email.
 */
function buildFooter(config: EmailTemplateConfig): string {
  return `
    <tr>
      <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
        <p style="color:#94a3b8;font-size:11px;margin:0 0 4px;letter-spacing:0.5px;">${config.footerText}</p>
        <p style="color:#cbd5e1;font-size:10px;margin:0;">This is an automated message. Please do not reply.</p>
      </td>
    </tr>`;
}

/**
 * Build the complete email HTML wrapper with consistent branding.
 * All patient-facing emails should use this function.
 */
export function buildEmailHtml(
  title: string,
  subtitle: string,
  bodyHtml: string,
  config: EmailTemplateConfig = DEFAULT_CONFIG
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f0f4f3;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f3;padding:32px 16px;">
        <tr><td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            ${buildHeader(title, subtitle, config)}
            <tr>
              <td style="padding:32px;">
                ${bodyHtml}
              </td>
            </tr>
            ${buildFooter(config)}
          </table>
        </td></tr>
      </table>
    </body>
    </html>`;
}

/**
 * Build items list HTML (patient-safe, no codes or pricing).
 */
export function buildItemsList(items: string[], maxItems: number = 12): string {
  if (!items.length) {
    return `<p style="color:#64748B;font-size:12px;font-style:italic;margin:0;">No services listed</p>`;
  }
  
  return items
    .slice(0, maxItems)
    .map((item) => stripCodesAndPricing(item))
    .filter(Boolean)
    .map((name) => `<li style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${name}</li>`)
    .join("");
}

/**
 * Build a details table row.
 */
export function detailsRow(label: string, value: string): string {
  return `<tr><td style="padding:4px 0;font-size:12px;color:#64748B;width:40%;">${label}</td><td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${value}</td></tr>`;
}