export const availableRoles = [
  { value: "admin", label: "Super Admin" },
  { value: "hospital", label: "Hospital Admin" },
  { value: "nurse", label: "Utilization Manager" },
  { value: "claims", label: "Claims Auditor" },
  { value: "finance", label: "Finance Officer" },
];

export const roleOptions = [{ value: "all", label: "All Roles" }, ...availableRoles];

export const prettyDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB") : "Never";

export const prettyDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("en-GB") : "Never";

export const accessStatus = (user: any) => {
  const baseStatus = String(user.access_status || user.status || "active").toLowerCase();
  if (["suspended", "revoked", "inactive"].includes(baseStatus)) {
    return "revoked";
  }
  if (!user.onboarding_completed) {
    return "onboarding";
  }
  return "active";
};

export const roleLabel = (value?: string | null) =>
  availableRoles.find((role) => role.value === value)?.label || (!value ? "Unassigned" : "Phased out");

export const statusClass = (status: string) => {
  if (status === "revoked") return "border-[#F09595] bg-[#FCEBEB] text-[#A32D2E]";
  if (status === "onboarding") return "border-[#EF9F27] bg-[#FAEEDA] text-[#854F0B]";
  return "border-[#5DCAA5] bg-[#E1F5EE] text-[#93c34b]";
};

export const roleClass = (role: string) => {
  switch (role) {
    case "admin":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "nurse":
      return "border-[#5DCAA5] bg-[#E1F5EE] text-[#93c34b]";
    case "hospital":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "claims":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "finance":
      return "border-purple-200 bg-purple-50 text-purple-700";
    default:
      return "border-slate-200 bg-white text-slate-600";
  }
};

export const filterHospitals = (list: any[], query: string) => {
  if (!query.trim()) return list;
  const q = query.toLowerCase();
  return list.filter((h) =>
    String(h.name || "").toLowerCase().includes(q) ||
    String(h.code || "").toLowerCase().includes(q)
  );
};
