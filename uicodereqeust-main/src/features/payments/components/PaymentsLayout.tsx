import { Outlet, NavLink, useLocation } from "react-router-dom";

export default function PaymentsLayout() {
  const location = useLocation();
  
  // Dynamically resolve base payments URL based on current dashboard prefix
  const getBaseUrl = () => {
    if (location.pathname.startsWith("/backoffice/admin")) return "/backoffice/admin/payments";
    if (location.pathname.startsWith("/backoffice/claims")) return "/backoffice/claims/payments";
    return "/backoffice/finance/payments";
  };
  
  const baseUrl = getBaseUrl();

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden animate-in fade-in duration-500">
      <div className="pb-1 border-b border-slate-200">
        <nav className="flex space-x-6" aria-label="Payments tabs">
          <NavLink
            to={`${baseUrl}/awaiting`}
            className={({ isActive }) =>
              `pb-3 px-1 border-b-2 text-xs font-black uppercase tracking-wider transition-all ${
                isActive
                  ? "border-[#3f3f95] text-[#3f3f95]"
                  : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300"
              }`
            }
          >
            Awaiting Payment
          </NavLink>
          <NavLink
            to={`${baseUrl}/batches`}
            className={({ isActive }) =>
              `pb-3 px-1 border-b-2 text-xs font-black uppercase tracking-wider transition-all ${
                isActive
                  ? "border-[#3f3f95] text-[#3f3f95]"
                  : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300"
              }`
            }
          >
            Batches
          </NavLink>
          <NavLink
            to={`${baseUrl}/paid`}
            className={({ isActive }) =>
              `pb-3 px-1 border-b-2 text-xs font-black uppercase tracking-wider transition-all ${
                isActive
                  ? "border-[#3f3f95] text-[#3f3f95]"
                  : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300"
              }`
            }
          >
            Paid
          </NavLink>
        </nav>
      </div>

      <div className="pt-2">
        <Outlet />
      </div>
    </div>
  );
}
