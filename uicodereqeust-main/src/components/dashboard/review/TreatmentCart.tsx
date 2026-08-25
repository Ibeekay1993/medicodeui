import React, { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import {
  TariffOption,
  formatNaira,
  itemUnitPrice,
  itemTotal,
} from "@/lib/clinicalUtils";
import { FloatingPanel } from "@/components/ui/floating-panel";

interface TreatmentCartProps {
  request: any;
  editTreatment: string;
  setEditTreatment: (value: string) => void;
  isHospitalDirected: boolean;
  parseLoading: boolean;
  parseStatus: string;
  parseTreatmentText: (options?: { force?: boolean; replaceAuto?: boolean; quiet?: boolean }) => Promise<void>;
  approvedItems: TariffOption[];
  approvedTotal: number;
  editingQuantities: Record<string, string>;
  updateApprovedItemQuantity: (code: string | null, value: string) => void;
  commitQuantity: (code: string | null) => void;
  removeApprovedItem: (code: string | null) => void;
  toggleDeclineApprovedItem?: (code: string | null) => void;
  updateDeclineReason?: (code: string | null, reason: string) => void;
  tariffSearch: string;
  setTariffSearch: (value: string) => void;
  tariffOptions: TariffOption[];
  setTariffOptions: (options: TariffOption[]) => void;
  tariffSearchLoading: boolean;
  addApprovedItem: (item: TariffOption) => void;
  cartCollapsed: boolean;
  setCartCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

export const TreatmentCart = React.memo(function TreatmentCart({
  request,
  editTreatment,
  setEditTreatment: _setEditTreatment,
  isHospitalDirected,
  parseLoading,
  parseStatus,
  parseTreatmentText,
  approvedItems,
  approvedTotal,
  editingQuantities,
  updateApprovedItemQuantity,
  commitQuantity,
  removeApprovedItem,
  toggleDeclineApprovedItem,
  updateDeclineReason,
  tariffSearch,
  setTariffSearch,
  tariffOptions,
  setTariffOptions,
  tariffSearchLoading,
  addApprovedItem,
  cartCollapsed,
  setCartCollapsed,
}: TreatmentCartProps) {
  const [showItemDetails, setShowItemDetails] = useState<Record<string, boolean>>({});
  const [declineDialogItem, setDeclineDialogItem] = useState<TariffOption | null>(null);
  const [declineReasonText, setDeclineReasonText] = useState("");
  const manualSearchRef = useRef<HTMLInputElement>(null);

  const handleConfirmDecline = () => {
    if (declineDialogItem) {
      updateDeclineReason?.(declineDialogItem.code, declineReasonText);
      toggleDeclineApprovedItem?.(declineDialogItem.code);
      setDeclineDialogItem(null);
      setDeclineReasonText("");
    }
  };

  const handleReDetect = () => {
    void parseTreatmentText({ force: true, replaceAuto: true });
  };

  return (
    <div className="space-y-3.5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[inset_0_1px_4px_rgba(0,0,0,0.02)] transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black uppercase tracking-widest text-slate-800">
            Approved Treatment Cart
          </div>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {cartCollapsed
              ? "Tap arrow to view cart and auto-detect controls"
              : "Auto-detect and align clinical codes, quantities, and pricing."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto w-full sm:w-auto">
          {!cartCollapsed && (
            <Button
              type="button"
              variant="outline"
              onClick={handleReDetect}
              disabled={
                parseLoading ||
                !editTreatment.trim() ||
                isHospitalDirected ||
                request?.deletion_status === "awaiting_admin_approval"
              }
              className="h-8 rounded-xl border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {parseLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isHospitalDirected ? "Re-Detect Disabled" : <span className="hidden sm:inline">Re-Detect Items</span>}
              {!isHospitalDirected && <span className="sm:hidden">Re-Detect</span>}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setCartCollapsed((current) => !current)}
            className="h-8 w-8 rounded-xl text-slate-600 hover:bg-slate-100"
          >
            {cartCollapsed ? <ChevronDown className="h-4.5 w-4.5" /> : <ChevronUp className="h-4.5 w-4.5" />}
          </Button>
        </div>
      </div>

      {!cartCollapsed && (
        <div className="space-y-3.5 animate-in fade-in duration-200">
          {parseStatus && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600 shadow-sm break-words whitespace-normal flex-wrap">
              {parseLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500 shrink-0" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              )}
              <span className="min-w-0">{parseStatus}</span>
            </div>
          )}
          {approvedItems.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="max-h-64 overflow-auto divide-y divide-slate-100">
                {approvedItems.map((item) => (
                  <div
                    key={item.code}
                    className={cn(
                      "p-3 transition-colors",
                      item.declined
                        ? "bg-rose-50/20 hover:bg-rose-50/30"
                        : "bg-white hover:bg-slate-50/50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-xs font-bold leading-snug uppercase break-words break-all sm:break-normal",
                          item.declined ? "line-through text-slate-400" : "text-slate-800"
                        )}>
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs font-black uppercase tracking-widest",
                              item.declined
                                ? "text-rose-700 bg-rose-50 border-rose-100"
                                : "text-slate-700 bg-slate-100 border-slate-200"
                            )}
                          >
                            {item.declined ? "Declined" : item.category || "tariff"}
                          </Badge>
                          <button
                            type="button"
                            onClick={() =>
                              setShowItemDetails((prev) => ({
                                ...prev,
                                [item.code || ""]: !prev[item.code || ""],
                              }))
                            }
                            className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            {showItemDetails[item.code || ""] ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                            {showItemDetails[item.code || ""] ? "Hide Details" : "Details"}
                          </button>
                        </div>
                        {item.declined && (
                          <div className="mt-2 space-y-1 max-w-md animate-in slide-in-from-top-1 duration-150">
                            <Label className="text-xs font-black uppercase tracking-wider text-rose-600 pl-0.5">
                              Decline Reason
                            </Label>
                            <Input
                              type="text"
                              placeholder="Reason for decline (required)..."
                              value={item.decline_reason || ""}
                              onChange={(e) =>
                                updateDeclineReason?.(item.code, e.target.value)
                              }
                              className="h-7 text-xs font-bold rounded-lg border-rose-200 focus:border-rose-400 focus:ring-rose-400/20 bg-rose-50/10 placeholder:text-rose-300 placeholder:font-normal text-rose-800 focus:ring-1"
                              disabled={request?.deletion_status === "awaiting_admin_approval" || isHospitalDirected}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className={cn(
                          "flex items-center gap-1 rounded-xl p-0.5 border transition-all",
                          item.declined
                            ? "bg-slate-50 border-slate-100 opacity-40"
                            : "bg-slate-100/60 border-slate-200"
                        )}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg hover:bg-white hover:shadow-xs transition-all"
                            onClick={() =>
                              updateApprovedItemQuantity(
                                item.code,
                                String(Math.max(1, (Number(item.quantity) || 1) - 1))
                              )
                            }
                            disabled={item.declined || request?.deletion_status === "awaiting_admin_approval" || isHospitalDirected}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={editingQuantities[item.code || ""] ?? String(item.quantity)}
                            onChange={(event) =>
                              updateApprovedItemQuantity(item.code, event.target.value)
                            }
                            onBlur={() => commitQuantity(item.code)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitQuantity(item.code);
                              }
                            }}
                            onFocus={(event) => {
                              event.target.select();
                            }}
                            className="h-7 w-10 border-0 bg-transparent text-center font-black text-xs p-0 outline-none focus:ring-0 cursor-text text-slate-900"
                            disabled={item.declined || request?.deletion_status === "awaiting_admin_approval" || isHospitalDirected}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg hover:bg-white hover:shadow-xs transition-all"
                            onClick={() =>
                              updateApprovedItemQuantity(
                                item.code,
                                String((Number(item.quantity) || 1) + 1)
                              )
                            }
                            disabled={item.declined || request?.deletion_status === "awaiting_admin_approval" || isHospitalDirected}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            "text-xs font-black",
                            item.declined ? "text-rose-500 line-through" : "text-slate-800"
                          )}>
                            {item.declined ? "Declined" : formatNaira(itemTotal(item))}
                          </p>
                          {request?.deletion_status !== "awaiting_admin_approval" && !isHospitalDirected && (
                              <div className="flex items-center justify-end gap-2 mt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (item.declined) {
                                      toggleDeclineApprovedItem?.(item.code);
                                    } else {
                                      setDeclineDialogItem(item);
                                      setDeclineReasonText(item.decline_reason || "");
                                    }
                                  }}
                                  className={cn(
                                    "text-xs font-black uppercase transition-colors",
                                    item.declined
                                      ? "text-slate-600 hover:text-slate-700"
                                      : "text-rose-500 hover:text-rose-700"
                                  )}
                                >
                                {item.declined ? "Approve" : "Decline"}
                              </button>
                              <span className="text-slate-300 text-xs select-none">•</span>
                              <button
                                type="button"
                                onClick={() => removeApprovedItem(item.code)}
                                className="text-xs font-black uppercase text-slate-400 hover:text-rose-600 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {showItemDetails[item.code || ""] && (
                      <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                          System Metadata
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 font-semibold">
                          <div className="flex justify-between border-b border-slate-200 pb-1">
                            <span>Code:</span>
                            <span className="font-mono font-bold text-slate-800">{item.code}</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-200 pb-1">
                            Quantity:{" "}
                          <span className="font-bold text-slate-800">
                            {item.quantity}
                          </span>
                          </div>
                          <div className="flex justify-between border-b border-slate-200 pb-1">
                            <span>Matched via:</span>
                            <span className="font-bold text-slate-800 uppercase">
                              {item.matched_via || "manual"}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-slate-200 pb-1">
                            <span>Confidence:</span>
                            <span className="font-bold text-emerald-600 uppercase">
                              {item.confidence || "high"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
                <span className="text-xs font-black uppercase tracking-widest text-slate-700">
                  Total Approved Amount
                </span>
                <span className="text-base font-black text-slate-800">
                  {formatNaira(approvedTotal)}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-center text-xs font-semibold text-slate-500 shadow-inner">
              No approved items in cart yet. Use auto-detect above or search below to manually append.
            </div>
          )}

          {/* Add Item Manually Search Field */}
          <div className="relative space-y-1.5">
            <Label className="text-xs uppercase font-black text-slate-700 tracking-wider pl-1">
              Add Item Manually
            </Label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                ref={manualSearchRef}
                placeholder="Search code, brand name, generic name, or abbreviation..."
                value={tariffSearch}
                onChange={(event) => setTariffSearch(event.target.value)}
                className="bg-white rounded-xl border-slate-200 pl-9.5 pr-8 focus:ring-slate-500/20 font-medium"
                disabled={request?.deletion_status === "awaiting_admin_approval" || isHospitalDirected}
              />
              {tariffSearchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
              )}
            </div>

            {tariffOptions.length > 0 && (
              <FloatingPanel
                anchorRef={manualSearchRef}
                open={tariffOptions.length > 0}
                maxHeight={320}
                onEscapeKeyDown={() => setTariffOptions([])}
                className="divide-y divide-slate-100"
              >
                {tariffOptions.map((option) => (
                  <button
                    key={`${option.code}-${option.name}`}
                    type="button"
                    onClick={() => {
                      addApprovedItem({
                        ...option,
                        matched_via: option.matched_via || "manual",
                      });
                      setTariffSearch("");
                      setTariffOptions([]);
                    }}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50/50 active:bg-slate-50 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-800">{option.name}</span>
                      <span className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-xs font-black uppercase bg-slate-50/50 border-slate-200 text-slate-700"
                        >
                          {option.category || "tariff"}
                        </Badge>
                        <span className="text-xs font-mono font-bold text-slate-400">
                          {option.code || "NHIA"}
                        </span>
                        {option.matched_via && (
                          <Badge
                            variant="outline"
                            className="bg-amber-50/60 border-amber-100 text-amber-700 text-xs uppercase tracking-wider font-black"
                          >
                            {option.matched_via}
                          </Badge>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-black text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                      {formatNaira(option.price)}
                    </span>
                  </button>
                ))}
              </FloatingPanel>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!declineDialogItem} onOpenChange={(open) => !open && setDeclineDialogItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-500 font-medium">
              Please provide a reason for declining: <strong className="text-slate-900">{declineDialogItem?.name}</strong>
            </p>
            <div className="space-y-2">
              <Label>Reason (Required)</Label>
              <Input
                placeholder="e.g. Service not covered by policy..."
                value={declineReasonText}
                onChange={(e) => setDeclineReasonText(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineDialogItem(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDecline}
              disabled={!declineReasonText.trim()}
            >
              Confirm Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
