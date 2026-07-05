import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calendar, Loader2 } from "lucide-react";

interface ExportCSVDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (startDate?: string, endDate?: string) => Promise<void>;
  isExporting: boolean;
}

export default function ExportCSVDialog({ open, onOpenChange, onExport, isExporting }: ExportCSVDialogProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handlePreset = (days: number | 'month' | 'all') => {
    const end = new Date();
    let start = new Date();
    
    if (days === 'all') {
      setStartDate("");
      setEndDate("");
      return;
    } else if (days === 'month') {
      // First day of current month
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    } else {
      start.setDate(end.getDate() - days);
    }
    
    const formatDate = (date: Date) => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onExport(startDate || undefined, endDate || undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-none p-0 overflow-hidden shadow-2xl">
        <div className="bg-slate-800 p-6 text-white">
          <DialogTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-400" /> Export Authorizations
          </DialogTitle>
          <DialogDescription className="text-xs font-bold text-slate-200/80 uppercase tracking-widest mt-1">
            Select a date range to download the CSV ledger
          </DialogDescription>
        </div>
        <form onSubmit={handleSubmit} className="p-6 bg-white space-y-5">
          {/* Quick Presets */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
              Quick Presets
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePreset(7)}
                className="h-9 text-xs font-bold border-slate-100 hover:bg-slate-50 text-slate-700 rounded-xl"
              >
                Last 7 Days
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePreset(30)}
                className="h-9 text-xs font-bold border-slate-100 hover:bg-slate-50 text-slate-700 rounded-xl"
              >
                Last 30 Days
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePreset('month')}
                className="h-9 text-xs font-bold border-slate-100 hover:bg-slate-50 text-slate-700 rounded-xl"
              >
                This Month
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePreset('all')}
                className="h-9 text-xs font-bold border-slate-100 hover:bg-slate-50 text-slate-700 rounded-xl"
              >
                All Time (No Filter)
              </Button>
            </div>
          </div>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-100"></div>
            <span className="flex-shrink mx-4 text-[10px] font-black uppercase text-slate-300">Or Custom Range</span>
            <div className="flex-grow border-t border-slate-100"></div>
          </div>

          {/* Date Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="export-start-date" className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Start Date
              </label>
              <Input
                id="export-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 focus:bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="export-end-date" className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                End Date
              </label>
              <Input
                id="export-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 focus:bg-white"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2 flex gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-11 text-xs font-bold text-slate-500 rounded-xl hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isExporting}
              className="flex-1 h-11 text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-600/10"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting...
                </>
              ) : (
                "Download CSV"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
