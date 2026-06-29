import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * Displayed when an authenticated user attempts to access a route
 * they do not have permission to view.
 */
export function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
        <h1 className="text-2xl font-black uppercase italic text-slate-900">Access Denied</h1>
        <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-400">
          Unauthorized Registry Access
        </p>
        <Button
          onClick={() => navigate("/")}
          className="mt-6 h-12 w-full rounded-xl bg-slate-900 text-xs font-black uppercase tracking-widest shadow-xl shadow-slate-900/20"
        >
          Return Home
        </Button>
      </div>
    </div>
  );
}
