import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export function TreatmentCart({
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

  const handleReDetect = () => {
    void parseTreatmentText({ force: true, replaceAuto: true });
  };

  return (
    <div className="space-y-3.5 rounded-2xl border border-blue-100/60 bg-gradient-to-br from-blue-50/40 via-white to-blue-50/20 p-5 shadow-[0_4px_20px_rgb(59,130,246,0.05)] transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black uppercase tracking-widest text-blue-800">
            Approved Treatment Cart
          </div>
          <p className="mt-0.5 text-xs font-semibold text-blue-900/60">
            {cartCollapsed
              ? "Tap arrow to view cart and auto-detect controls"
              : "Auto-detect and align clinical codes, quantities, and pricing."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
              className="h-8 rounded-xl border-blue-200 bg-white px-3 text-xs font-black uppercase tracking-wider text-blue-700 hover:bg-blue-50 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {parseLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isHospitalDirected ? "Re-Detect Disabled" : "Re-Detect Items"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setCartCollapsed((current) => !current)}
            className="h-8 w-8 rounded-xl text-blue-700 hover:bg-blue-100/50"
          >
            {cartCollapsed ? <ChevronDown className="h-4.5 w-4.5" /> : <ChevronUp className="h-4.5 w-4.5" />}
          </Button>
        </div>
      </div>

      {!cartCollapsed && (
        <div className="space-y-3.5 animate-in fade-in duration-200">
          {parseStatus && (
            <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-xs font-bold text-blue-800 shadow-sm">
              {parseLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              )}
              {parseStatus}
            </div>
          )}

          {approvedItems.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-xs">
              <div className="max-h-64 overflow-auto divide-y divide-slate-100">
                {approvedItems.map((item) => (
                  <div
                    key={item.code}
                    className={cn(
                      "p-3 transition-colors",
                      item.declined
                        ? "bg-rose-50/20 hover:bg-rose-50/30"
                        : "bg-white hover:bg-emerald-50/10"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-xs font-bold leading-snug uppercase",
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
                                : "text-emerald-700 bg-emerald-50/50 border-emerald-100"
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
                            className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-emerald-700 transition-colors"
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
                              disabled={request?.deletion_status === "awaiting_admin_approval"}
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
                            disabled={item.declined || request?.deletion_status === "awaiting_admin_approval"}
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
                            disabled={item.declined || request?.deletion_status === "awaiting_admin_approval"}
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
                            disabled={item.declined || request?.deletion_status === "awaiting_admin_approval"}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            "text-xs font-black",
                            item.declined ? "text-rose-500 line-through" : "text-emerald-700"
                          )}>
                            {item.declined ? "Declined" : formatNaira(itemTotal(item))}
                          </p>
                          {request?.deletion_status !== "awaiting_admin_approval" && (
                            <div className="flex items-center justify-end gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => toggleDeclineApprovedItem?.(item.code)}
                                className={cn(
                                  "text-xs font-black uppercase transition-colors",
                                  item.declined
                                    ? "text-emerald-600 hover:text-emerald-700"
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
                            <span>Unit Price:</span>
                            <span className="font-bold text-slate-800">
                              {formatNaira(itemUnitPrice(item))}
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
              <div className="flex items-center justify-between border-t border-emerald-100 bg-emerald-50/50 px-4 py-3">
                <span className="text-xs font-black uppercase tracking-widest text-emerald-800">
                  Total Approved Amount
                </span>
                <span className="text-base font-black text-emerald-700">
                  {formatNaira(approvedTotal)}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-blue-200 bg-white/70 p-5 text-center text-xs font-semibold text-blue-900/60 shadow-inner">
              No approved items in cart yet. Use auto-detect above or search below to manually append.
            </div>
          )}

          {/* Add Item Manually Search Field */}
          <div className="relative space-y-1.5">
            <Label className="text-xs uppercase font-black text-blue-800 tracking-wider pl-1">
              Add Item Manually
            </Label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
              <Input
                placeholder="Search code, brand name, generic name, or abbreviation..."
                value={tariffSearch}
                onChange={(event) => setTariffSearch(event.target.value)}
                className="bg-white rounded-xl border-blue-200 pl-9.5 pr-8 focus:ring-blue-500/20 font-medium"
                disabled={request?.deletion_status === "awaiting_admin_approval"}
              />
              {tariffSearchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />
              )}
            </div>

            {tariffOptions.length > 0 && (
              <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-100 bg-white shadow-xl divide-y divide-slate-100 animate-in fade-in duration-100">
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
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-blue-50/50 active:bg-blue-50 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-800">{option.name}</span>
                      <span className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-xs font-black uppercase bg-blue-50/50 border-blue-100 text-blue-700"
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
                    <span className="shrink-0 text-xs font-black text-emerald-700 bg-emerald-50/80 px-2 py-1 rounded-lg">
                      {formatNaira(option.price)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
