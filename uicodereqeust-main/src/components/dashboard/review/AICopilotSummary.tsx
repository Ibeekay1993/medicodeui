import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

interface AICopilotSummaryProps {
  aiLoading: boolean;
  aiSummary: any;
  runAIAnalysis: () => Promise<void>;
  request: any;
}

export function AICopilotSummary({
  aiLoading,
  aiSummary,
  runAIAnalysis,
  request: _request,
}: AICopilotSummaryProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Helper to extract text from different possible response formats
  const getSummaryText = () => {
    if (!aiSummary) return "";
    if (typeof aiSummary === "string") return aiSummary;
    if (aiSummary.summary) return aiSummary.summary;
    if (aiSummary.text) return aiSummary.text;
    if (aiSummary.result) return aiSummary.result;
    return JSON.stringify(aiSummary);
  };

  const summaryText = getSummaryText();

  // Simple heuristics to extract fraud risk or warnings if they exist in the text
  const isHighRisk = summaryText.toLowerCase().includes("high risk") || summaryText.toLowerCase().includes("fraud");
  const isMediumRisk = summaryText.toLowerCase().includes("medium risk") || summaryText.toLowerCase().includes("warning");

  return (
    <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/30 to-violet-50/70 shadow-xs overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full text-left px-4 py-3 border-b border-violet-100 flex items-center justify-between hover:bg-violet-100/10 active:bg-violet-100/25 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-violet-600 animate-pulse" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-violet-800">AI Copilot Analysis</p>
            <p className="text-xs font-medium text-violet-900/60 mt-0.5">Clinical pattern & fraud detection</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {aiSummary && (
            <Badge
              variant="outline"
              className={`text-xs font-black uppercase shadow-sm ${
                isHighRisk
                  ? "bg-rose-50 border-rose-200 text-rose-700"
                  : isMediumRisk
                  ? "bg-amber-50 border-amber-250 text-amber-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
              }`}
            >
              {isHighRisk ? "Action Required" : isMediumRisk ? "Attention Required" : "Clear / Normal"}
            </Badge>
          )}
          {collapsed ? (
            <ChevronDown className="w-4.5 h-4.5 text-violet-600" />
          ) : (
            <ChevronUp className="w-4.5 h-4.5 text-violet-600" />
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="p-4 space-y-3 animate-in fade-in duration-200">
          {aiLoading ? (
            <div className="flex flex-col items-center justify-center py-6 text-slate-500 text-xs gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
              <div className="text-center space-y-1">
                <p className="font-extrabold text-violet-800 uppercase tracking-widest text-xs">Evaluating Clinical Context...</p>
                <p className="font-medium text-slate-400">Scanning local claim history and coverage templates</p>
              </div>
            </div>
          ) : aiSummary ? (
            <div className="space-y-3">
              {/* Risk Badge Alert Banner */}
              {isHighRisk && (
                <div className="p-3 rounded-xl text-xs border border-rose-200 bg-rose-50/50 flex items-start gap-2.5 text-rose-950 shadow-xs">
                  <AlertTriangle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
                  <span><strong>Clinical Risk Alert:</strong> Potential duplicate submission or policy violation flagged by verification pipeline.</span>
                </div>
              )}

              {/* Summary text content */}
              <div className="rounded-xl border border-violet-100 bg-white/95 p-3.5 shadow-xs">
                <p className="text-xs font-black uppercase text-violet-800/60 tracking-wider mb-2 pl-0.5">Clinical Evaluation</p>
                <p className="text-xs text-slate-700 font-medium leading-relaxed whitespace-pre-line">
                  {summaryText}
                </p>
              </div>

              {/* Re-analyze Button */}
              <div className="flex justify-end pt-1">
                <Button
                  onClick={runAIAnalysis}
                  variant="outline"
                  className="h-8 rounded-xl border-violet-200 text-violet-700 bg-white text-xs font-black uppercase tracking-wider hover:bg-violet-50 transition-all shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-violet-600" />
                  Re-Analyze Request
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-3 bg-white/50 rounded-xl border border-dashed border-violet-200 shadow-inner">
              <div className="max-w-xs mx-auto space-y-1.5">
                <p className="text-xs font-semibold text-slate-500">
                  Analyze this request for clinical code match rates, duplicate warnings, and fraud indicators.
                </p>
              </div>
              <Button
                onClick={runAIAnalysis}
                className="h-9 rounded-xl bg-violet-600 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-700 shadow-md shadow-violet-200 active:scale-95 transition-all"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Initialize AI Copilot
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
