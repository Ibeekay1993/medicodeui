/**
 * auditExport — call this every time a user downloads data (Excel, PDF, CSV).
 *
 * Sends a fire-and-forget audit record to the DB via the
 * audit_data_export() SECURITY DEFINER RPC. No PII is sent —
 * only the export type, resource name, row count, and active filters.
 *
 * HIPAA §164.312(b) — audit controls
 * NDPR Art. 2.4   — data subject rights tracking
 */

import { supabase } from "@/integrations/supabase/client";

interface ExportAuditParams {
  exportType: "excel" | "pdf" | "csv";
  resource: string;
  rowCount: number;
  filters?: Record<string, unknown>;
}

export async function auditExport({
  exportType,
  resource,
  rowCount,
  filters = {},
}: ExportAuditParams): Promise<void> {
  try {
    await (supabase.rpc as any)("audit_data_export", {
      p_export_type: exportType,
      p_resource: resource,
      p_row_count: rowCount,
      p_filters: filters,
    });
  } catch (err) {
    // Audit failure must NEVER block the user's download.
    // Log silently for debugging only.
    console.warn("[auditExport] failed to record export audit:", err);
  }
}
