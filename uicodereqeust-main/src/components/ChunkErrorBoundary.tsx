import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  copied: boolean;
  isAutoReloading: boolean;
}

export class ChunkErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null, 
      copied: false,
      isAutoReloading: false 
    };
  }

  static getDerivedStateFromError(error: any): State {
    return { 
      hasError: true, 
      error, 
      errorInfo: null, 
      copied: false,
      isAutoReloading: false 
    };
  }

  componentDidCatch(error: any, errorInfo: any) {
    this.setState({ error, errorInfo });
    console.error("Workspace error caught by ErrorBoundary:", error, errorInfo);

    // Specifically check for chunk loading errors (both Vite and Webpack styles)
    const message = error?.message || error?.toString() || '';
    const isChunkError =
      message.includes("Loading CSS chunk") ||
      message.includes("Failed to fetch dynamically imported module") ||
      message.includes("Importing a module script failed") ||
      message.includes("ChunkLoadError") ||
      message === "[object Event]" ||
      message === "Error" ||
      message === "TypeError" ||
      (typeof error === 'object' && error?.type === 'error');

    if (isChunkError) {
      const lastAutoReload = sessionStorage.getItem("last_auto_reload_time");
      const now = Date.now();
      if (!lastAutoReload || now - parseInt(lastAutoReload, 10) > 15000) {
        sessionStorage.setItem("last_auto_reload_time", now.toString());
        this.setState({ isAutoReloading: true });
        
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
      if (this.state.isAutoReloading) {
        // Prevent flashing the scary error screen. Just show the brand loading spinner during background auto-refresh
        return (
          <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4">
            <div className="flex flex-col items-center gap-6 max-w-sm w-full mx-4">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md p-2.5">
                <img src="/ronsberger-logo.webp" alt="Ronsberger HMO Logo" className="h-full w-full object-contain" />
                <div className="absolute -inset-1 border-2 border-t-[#3f3f95] border-r-[#01aef2] border-b-transparent border-l-transparent rounded-[18px] animate-spin" />
              </div>
              <div className="text-center">
                <p className="badge-label text-[#01aef2] uppercase tracking-wider text-[11px] font-black">Ronsberger HMO</p>
                <p className="mt-2 text-xs font-bold text-slate-500 uppercase tracking-widest">Updating Workspace...</p>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen w-full bg-slate-50 text-slate-700 flex items-center justify-center p-4 md:p-6 font-sans">
          <div className="max-w-md w-full rounded-2xl border border-slate-100 bg-white p-6 md:p-8 shadow-xl relative overflow-hidden flex flex-col text-center">
            {/* Header logo / branding */}
            <div className="flex justify-center mb-6">
              <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded-xl shadow-sm select-none">
                <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center p-1 shadow-sm overflow-hidden border border-slate-50">
                  <img src="/ronsberger-logo.webp" alt="Ronsberger HMO Logo" className="h-full w-full object-contain" />
                </div>
                <div className="text-left pr-1">
                  <p className="text-xs font-black tracking-tight text-slate-900 whitespace-nowrap">
                    Ronsberger <span className="text-[#4d7a22]">HMO</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Error Graphic / Icon */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 border border-amber-100 text-amber-600 shadow-sm animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>

            {/* Main Title & Description */}
            <h1 className="text-base font-black text-slate-950 uppercase tracking-wide">Temporary Workspace Issue</h1>
            <p className="mt-3 text-xs md:text-sm font-semibold text-slate-500 leading-relaxed max-w-sm mx-auto">
              We encountered a problem loading this part of the page. This is usually due to a newly deployed update or a temporary network disruption.
            </p>
            {this.state.error && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-100 rounded-lg text-left overflow-auto max-h-32">
                <p className="text-[10px] font-mono text-rose-600 break-words font-semibold">
                  Type: {this.state.error?.constructor?.name || "Unknown"} | 
                  Msg: {this.state.error?.message || "none"} | 
                  String: {String(this.state.error)} | 
                  JSON: {JSON.stringify(this.state.error)}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={this.retry}
                className="w-full h-11 rounded-xl bg-[#3f3f95] hover:bg-[#32327a] text-white font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-lg shadow-[#3f3f95]/15 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin-slow"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                Refresh Workspace
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={this.goToHome}
                  className="flex-1 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 font-bold text-xs uppercase tracking-wider transition-colors duration-200 flex items-center justify-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Home
                </button>
                <button
                  type="button"
                  onClick={this.resetDataAndLogOut}
                  className="flex-1 h-10 rounded-xl bg-rose-50 hover:bg-rose-100/85 text-rose-600 border border-rose-100 font-bold text-xs uppercase tracking-wider transition-colors duration-200 flex items-center justify-center gap-1.5"
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
