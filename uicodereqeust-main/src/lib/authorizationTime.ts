type AuthorizationTimeRecord = {
  created_at?: string | null;
  treatment_submitted_at?: string | null;
  decided_at?: string | null;
  status?: string | null;
};

const NIGERIA_TIME_ZONE = "Africa/Lagos";

export function formatNigeriaDate(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: NIGERIA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatNigeriaTime(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Date(value).toLocaleTimeString("en-NG", {
    timeZone: NIGERIA_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatNigeriaDateTime(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return `${new Date(value).toLocaleString("en-GB", {
    timeZone: NIGERIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })} WAT`;
}

export function getAuthorizationDecisionLabel(status?: string | null) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus.includes("partially_approved")) return "Partially approved";
  if (["rejected", "declined", "denied"].some(value => normalizedStatus.includes(value))) return "Declined";
  if (normalizedStatus.includes("approved")) return "Approved";
  if (normalizedStatus.includes("accepted")) return "Accepted";
  if (normalizedStatus.includes("expired")) return "Expired";
  return null;
}

export function getAuthorizationListTimestamp(request: AuthorizationTimeRecord) {
  if (!request.decided_at) {
    return { label: "Submitted", timestamp: request.created_at };
  }

  return {
    label: getAuthorizationDecisionLabel(request.status) || "Updated",
    timestamp: request.decided_at,
  };
}

export function formatAuthorizationListEvent(label: string, timestamp?: string | null) {
  const compactLabel = label === "Partially approved" ? "Partial" : label === "Submitted" ? "Sent" : label;
  const compactTime = formatNigeriaTime(timestamp).replace(/\s+(?=[ap]m$)/i, "");
  return `${compactLabel} ${compactTime}`;
}

export function getAuthorizationSlaMinutes(
  request: AuthorizationTimeRecord,
  now = Date.now(),
) {
  const startAt = request.treatment_submitted_at || request.created_at;
  if (!startAt) return null;

  const start = Date.parse(startAt);
  const end = request.decided_at ? Date.parse(request.decided_at) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  return Math.max(0, Math.round((end - start) / 60_000));
}

export function formatAuthorizationSla(minutes: number) {
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return hours ? `${days}d ${hours}h` : `${days}d`;
  }
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function authorizationSlaColor(minutes: number) {
  if (minutes <= 15) return "text-emerald-600";
  if (minutes <= 30) return "text-amber-600 font-bold";
  return "text-rose-600 font-bold";
}
