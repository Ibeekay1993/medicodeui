import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl border border-slate-100 fade-in-up">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 shadow-lg shadow-slate-900/20">
          <ShieldCheck className="h-7 w-7 text-emerald-500" />
        </div>
        <h1 className="text-4xl font-black text-slate-900">404</h1>
        <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-400">Page Not Found</p>
        <p className="mt-3 text-sm font-medium text-slate-500 leading-relaxed">
          The page you are looking for does not exist or has been moved.
        </p>

        <div className="mt-6 rounded-xl bg-slate-50 p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Quick Links</p>
          </div>
          <div className="space-y-1.5">
            <button onClick={() => navigate("/login")} className="w-full text-left rounded-lg p-2 text-xs font-medium text-slate-600 hover:bg-white hover:text-emerald-700 transition-colors">
              Sign in to your account
            </button>
            <button onClick={() => navigate("/")} className="w-full text-left rounded-lg p-2 text-xs font-medium text-slate-600 hover:bg-white hover:text-emerald-700 transition-colors">
              Go to homepage
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={() => navigate("/")} className="h-12 w-full rounded-xl bg-slate-900 text-xs font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 hover:bg-slate-800">
            <Home className="mr-2 h-4 w-4" />
            Return Home
          </Button>
          <Button onClick={() => navigate(-1)} variant="outline" className="h-12 w-full rounded-xl text-xs font-black uppercase tracking-widest">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}