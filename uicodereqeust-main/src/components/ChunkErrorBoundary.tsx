import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  copied: boolean;
}

export class ChunkErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error, errorInfo: null, copied: false };
  }

  componentDidCatch(error: any, errorInfo: any) {
    this.setState({ error, errorInfo });
    console.error("Workspace error caught by ErrorBoundary:", error, errorInfo);

    const message = `${error?.message ?? ""} ${errorInfo?.componentStack ?? ""}`;
    const isChunkError =
      message.includes("Loading CSS chunk") ||
      message.includes("Failed to fetch dynamically imported module") ||
      message.includes("Importing a module script failed") ||
      message.includes("ChunkLoadError");

    if (isChunkError) {
      // Check if we have already attempted an auto-reload in the last 15 seconds to prevent loops
      const lastAutoReload = sessionStorage.getItem("last_auto_reload_time");
      const now = Date.now();
      if (!lastAutoReload || now - parseInt(lastAutoReload, 10) > 15000) {
        sessionStorage.setItem("last_auto_reload_time", now.toString());
        // Append a reload timestamp parameter to force browser/CDN cache bypass
        const url = new URL(window.location.href);
        url.searchParams.set("reload_t", now.toString());
        window.location.replace(url.toString());
      }
    }
  }

  private retry = () => {
    const now = Date.now();
    const url = new URL(window.location.href);
    url.searchParams.set("reload_t", now.toString());
    window.location.replace(url.toString());
  };

  private resetDataAndLogOut = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn("Storage clearing failed:", e);
    }
    window.location.replace("/login");
  };

  private goToHome = () => {
    window.location.replace("/");
  };

  copyErrorDetails = () => {
    if (!this.state.error) return;
    const detailsText = `System Message: ${this.state.error.name || "Error"} - ${this.state.error.message || "Unknown error"}`;
    navigator.clipboard.writeText(detailsText)
      .then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      })
      .catch((err) => {
        console.error("Clipboard copy failed:", err);
      });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#0B0F19] text-white flex items-center justify-center p-4 md:p-6 font-sans">
          <div className="max-w-xl w-full rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl p-6 md:p-8 shadow-2xl relative overflow-hidden flex flex-col text-center">
            {/* Header logo / branding */}
            <div className="flex justify-center mb-6">
              <div className="flex items-center gap-2 p-2 bg-slate-800/40 border border-slate-700/50 rounded-2xl shadow-inner select-none">
                <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center p-1 shadow-md overflow-hidden">
                  <img src="/ronsberger-logo.webp" alt="Ronsberger HMO Logo" className="h-full w-full object-contain" />
                </div>
                <div className="text-left pr-2">
                  <p className="text-xs font-black tracking-tight text-white whitespace-nowrap">
                    Ronsberger <span className="text-[#4d7a22]">HMO</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Error Graphic / Icon */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.15)] animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>

            {/* Main Title & Description */}
            <h1 className="text-lg font-bold text-white tracking-tight">Temporary Workspace Issue</h1>
            <p className="mt-3 text-xs md:text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
              We encountered a problem loading this part of the page. This is usually due to a newly deployed update or a temporary network disruption.
            </p>

            {/* Action Buttons */}
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={this.retry}
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-colors duration-200 shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin-slow"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                Refresh Workspace
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={this.goToHome}
                  className="flex-1 h-10 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700/60 font-bold text-xs uppercase tracking-wider transition-colors duration-200 flex items-center justify-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Home
                </button>
                <button
                  type="button"
                  onClick={this.resetDataAndLogOut}
                  className="flex-1 h-10 rounded-xl bg-slate-800 hover:bg-slate-750 text-rose-400 border border-slate-700/60 font-bold text-xs uppercase tracking-wider transition-colors duration-200 flex items-center justify-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Reset & Logout
                </button>
              </div>
            </div>


          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
