import { cn } from "@/lib/utils";

export function PageLoader({ className }: { className?: string }) {
  return (
    <div className={cn("w-full flex items-center justify-center min-h-[80vh] md:min-h-[60vh]", className)}>
      <div className="flex flex-col items-center gap-6 max-w-sm w-full mx-4">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md p-2.5">
          <img src="/ronsberger-logo.png" alt="Ronsberger HMO Logo" className="h-full w-full object-contain" />
          <div className="absolute -inset-1 border-2 border-t-[#3f3f95] border-r-[#01aef2] border-b-transparent border-l-transparent rounded-[18px] animate-spin" />
        </div>
        <div className="text-center">
          <p className="badge-label text-[#01aef2]">Ronsberger HMO</p>
          <p className="mt-2 text-sm font-medium text-slate-500">Loading workspace...</p>
        </div>
      </div>
    </div>
  );
}
