import { BrandSpinner } from "@/components/BrandSpinner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calendar } from "lucide-react";

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
      <DialogContent className="max-w-md rounded-xl border border-slate-200 bg-white p-0 overflow-hidden shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
          <div className="pr-8">
            <DialogTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600" /> Export Authorizations
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Select a date range to download the authorizations ledger CSV
            </DialogDescription>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 bg-white space-y-4">
          {/* Quick Presets */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600 block">
              Quick Filter Presets
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePreset(7)}
                className="h-8 text-xs font-medium border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg"
              >
                Last 7 Days
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePreset(30)}
                className="h-8 text-xs font-medium border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg"
              >
                Last 30 Days
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePreset('month')}
                className="h-8 text-xs font-medium border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg"
              >
                This Month
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePreset('all')}
                className="h-8 text-xs font-medium border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg"
              >
                All Time
              </Button>
            </div>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-100"></div>
            <span className="flex-shrink mx-3 text-[10px] font-medium text-slate-400">or custom range</span>
            <div className="flex-grow border-t border-slate-100"></div>
          </div>

          {/* Date Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="export-start-date" className="text-[11px] font-medium text-slate-600 block">
                Start Date
              </label>
              <Input
                id="export-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="export-end-date" className="text-[11px] font-medium text-slate-600 block">
                End Date
              </label>
              <Input
                id="export-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 px-4 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50 border-slate-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isExporting}
              className="h-9 px-4 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm"
            >
              {isExporting ? (
                <>
                  <BrandSpinner className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Exporting…
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
