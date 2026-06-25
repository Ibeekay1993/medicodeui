import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Download, Loader2, MoreVertical, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useDataPagination } from "@/hooks/use-data-pagination";
import { DataPagination } from "@/components/dashboard/DataPagination";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";

const stringify = (value: unknown) => {
  if (!value || (typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0)) return "None";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
};

const actionLabel = (value?: string | null) => String(value || "UNKNOWN").replace(/_/g, " ");
const actionKind = (value?: string | null) => {
  const text = String(value || "").toUpperCase();
  if (text.includes("ERROR") || text.includes("FAILED") || text.includes("REJECT") || text.includes("REVOK")) return "Failed";
  if (text.includes("WARNING")) return "Warning";
  return "Success";
};

const statusClass = (status: string) => {
  if (status === "Failed") return "border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]";
  if (status === "Warning") return "border-[#EF9F27] bg-[#FAEEDA] text-[#854F0B]";
  return "border-[#5DCAA5] bg-[#E1F5EE] text-[#93c34b]";
};

const extractEmail = (log: any) => {
  const candidates = [
    log.actor_email,
    log.email,
    log.details?.email,
    log.details?.actor_email,
    log.new_values?.email,
    log.previous_values?.email,
    log.details?.input_payload?.email,
  ];
  return candidates.find(Boolean) || "No email recorded";
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("audit_logs" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      toast({ variant: "destructive", title: "Audit Load Error", description: getErrorMessage(error, "Unable to load audit logs") });
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLogs();
    const channel = supabase
      .channel("audit-stream")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, (payload) => {
        setLogs((prev) => [payload.new, ...prev].slice(0, 1000));
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [fetchLogs]);

  useTabVisibilityRefresh(fetchLogs);

  const entities = useMemo(() => Array.from(new Set(logs.map((log) => log.entity_type || "system").filter(Boolean))).sort(), [logs]);
  const filtered = useMemo(() => logs.filter((log) => {
    const status = actionKind(log.action_type || log.action);
    const entity = log.entity_type || "system";
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    const matchesEntity = entityFilter === "all" || entity === entityFilter;
    const haystack = [
      log.actor_name,
      extractEmail(log),
      log.actor_role,
      log.action_type,
      log.action,
      log.entity_type,
      log.entity_id,
      log.ip_address,
      stringify(log.previous_values),
      stringify(log.new_values),
      stringify(log.details),
    ].join(" ").toLowerCase();
    return matchesStatus && matchesEntity && haystack.includes(search.toLowerCase());
  }), [entityFilter, logs, search, statusFilter]);

  const { page, setPage, pageSize, totalPages, pageItems: paginatedLogs, start, end, total } = useDataPagination(filtered, 10, 25);

  const exportCsv = () => {
    const rows = [
      ["Timestamp", "User Name", "User Email", "User Role", "Action Type", "Entity Affected", "Entity ID", "Old Value", "New Value", "IP Address", "Status"],
      ...filtered.map((log) => [
        new Date(log.created_at).toLocaleString("en-GB"),
        log.actor_name || "System",
        extractEmail(log),
        log.actor_role || "system",
        actionLabel(log.action_type || log.action),
        log.entity_type || "system",
        log.entity_id || "",
        stringify(log.previous_values),
        stringify(log.new_values || log.details),
        log.ip_address || "",
        actionKind(log.action_type || log.action),
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RonsbergerHMO_Audit_Trail_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      <div className="pb-3 border-b border-slate-200">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={fetchLogs} className="h-8 rounded-lg gap-2 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
            <Button variant="outline" onClick={exportCsv} className="h-8 rounded-lg gap-2 text-xs"><Download className="h-3.5 w-3.5" /> Export CSV</Button>
          </div>
        </div>
      </div>

      <div className="med-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search actor, email, action, entity..." value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 rounded-lg border-slate-200 pl-9 text-sm" />
          </div>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg border-slate-200 text-sm lg:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {entities.map((entity) => <SelectItem key={entity} value={entity}>{entity.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg border-slate-200 text-sm lg:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Success">Success</SelectItem>
              <SelectItem value="Warning">Warning</SelectItem>
              <SelectItem value="Failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="med-card overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden lg:block w-full">
          <table className="w-full text-left table-fixed border-collapse">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[25%]" />
              <col className="w-[30%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor Details</th>
                <th className="px-4 py-3">Action & Target</th>
                <th className="px-4 py-3">Status & IP</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs text-slate-600">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[#93c34b]" /> Loading audit trail...</td></tr>
              ) : paginatedLogs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500"><Activity className="mx-auto mb-3 h-7 w-7 text-slate-300" /> No matching audit records.</td></tr>
              ) : paginatedLogs.map((log) => {
                const status = actionKind(log.action_type || log.action);
                const isExpanded = expandedId === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr onClick={() => setExpandedId(isExpanded ? null : log.id)} className="group cursor-pointer transition hover:bg-slate-50/50 h-14">
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 font-mono text-xs">
                        {new Date(log.created_at).toLocaleString("en-GB")}
                      </td>
                      <td className="px-4 py-2.5 break-words whitespace-normal leading-tight">
                        <div className="font-semibold text-slate-900">{log.actor_name || "System"}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5 truncate" title={extractEmail(log)}>{extractEmail(log)}</div>
                        <div className="text-xs text-slate-400 capitalize mt-0.5">{log.actor_role || "system"}</div>
                      </td>
                      <td className="px-4 py-2.5 break-words whitespace-normal leading-tight">
                        <div className="font-semibold text-slate-900">{actionLabel(log.action_type || log.action)}</div>
                        <div className="text-xs text-slate-500 mt-0.5 capitalize">Target: {String(log.entity_type || "system").replace(/_/g, " ")}</div>
                        {log.entity_id && <div className="text-xs text-slate-400 font-mono mt-0.5 truncate" title={log.entity_id}>{log.entity_id}</div>}
                      </td>
                      <td className="px-4 py-2.5 leading-normal">
                        <div><span className={cn("med-status-pill text-xs py-0.5 px-2", statusClass(status))}>{status.toUpperCase()}</span></div>
                        <div className="text-xs text-slate-400 font-mono mt-1">{log.ip_address || "No IP"}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="outline" size="sm" className="h-7 text-xs font-semibold border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg">
                          {isExpanded ? "Collapse" : "View JSON"}
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono border-t border-slate-100 pt-3">
                            <div className="bg-white p-3 rounded-lg border border-slate-200">
                              <div className="text-xs font-bold text-slate-400 uppercase mb-2">Previous Values</div>
                              <pre className="whitespace-pre-wrap max-h-48 overflow-y-auto text-xs text-slate-600">{JSON.stringify(log.previous_values, null, 2)}</pre>
                            </div>
                            <div className="bg-white p-3 rounded-lg border border-slate-200">
                              <div className="text-xs font-bold text-slate-400 uppercase mb-2">New Values / Details</div>
                              <pre className="whitespace-pre-wrap max-h-48 overflow-y-auto text-xs text-slate-600">{JSON.stringify(log.new_values || log.details, null, 2)}</pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card Layout View */}
        <div className="block lg:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[#93c34b]" /> Loading audit trail...</div>
          ) : paginatedLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 uppercase tracking-widest text-xs font-bold">No matching audit records</div>
          ) : paginatedLogs.map((log) => {
            const status = actionKind(log.action_type || log.action);
            const isExpanded = expandedId === log.id;
            return (
              <div key={log.id} className="divide-y divide-slate-100">
                <div onClick={() => setExpandedId(isExpanded ? null : log.id)} className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50/50 cursor-pointer transition-colors">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 uppercase leading-none">{actionLabel(log.action_type || log.action)}</span>
                      <span className={cn("med-status-pill text-xs py-0.5 px-1.5", statusClass(status))}>{status.toUpperCase()}</span>
                    </div>
                    <div className="text-xs text-slate-500 font-medium">
                      By: <span className="font-bold text-slate-800">{log.actor_name || "System"}</span> ({log.actor_role || "system"}) • {new Date(log.created_at).toLocaleString("en-GB")}
                    </div>
                    <div className="text-xs text-slate-400 font-mono truncate leading-none">
                      Target: <span className="capitalize">{String(log.entity_type || "system").replace(/_/g, " ")}</span> ({log.entity_id || log.id})
                    </div>
                  </div>
                  <div className="shrink-0 text-slate-400">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 rounded-lg">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="p-3 bg-slate-50/50 space-y-3 border-t border-slate-100">
                    {log.previous_values && stringify(log.previous_values) !== "None" && (
                      <div className="bg-white p-2.5 rounded border border-slate-200 text-xs font-mono">
                        <span className="font-bold text-slate-400 uppercase text-xs tracking-wider block mb-1">Previous Values</span>
                        <pre className="whitespace-pre-wrap max-h-36 overflow-y-auto text-xs text-slate-600">{JSON.stringify(log.previous_values, null, 2)}</pre>
                      </div>
                    )}
                    {(log.new_values || log.details) && stringify(log.new_values || log.details) !== "None" && (
                      <div className="bg-white p-2.5 rounded border border-slate-200 text-xs font-mono">
                        <span className="font-bold text-slate-400 uppercase text-xs tracking-wider block mb-1">New Values / Details</span>
                        <pre className="whitespace-pre-wrap max-h-36 overflow-y-auto text-xs text-slate-600">{JSON.stringify(log.new_values || log.details, null, 2)}</pre>
                      </div>
                    )}
                    <div className="font-mono text-slate-400 text-xs px-1">IP Address: {log.ip_address || "Not recorded"}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DataPagination page={page} totalPages={totalPages} start={start} end={end} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>
    </div>
  );
}
