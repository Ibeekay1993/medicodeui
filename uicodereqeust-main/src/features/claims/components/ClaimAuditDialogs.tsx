import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DECLINE_REASONS, buildHospitalExplanation } from "@/lib/claims-helpers";

interface ClaimAuditDialogsProps {
  approvalDialog: { key: string; item?: any } | null;
  setApprovalDialog: (dialog: { key: string; item?: any } | null) => void;
  approvalNote: string;
  setApprovalNote: (note: string) => void;
  confirmItemApproval: () => void;

  adjustDialog: { key: string; item?: any } | null;
  setAdjustDialog: (dialog: { key: string; item?: any } | null) => void;
  adjustQuantity: string;
  setAdjustQuantity: (qty: string) => void;
  adjustReason: string;
  setAdjustReason: (reason: string) => void;
  confirmQuantityAdjustment: () => void;

  declineDialog: { key: string; item?: any } | null;
  setDeclineDialog: (dialog: { key: string; item?: any } | null) => void;
  declineCategory: string;
  setDeclineCategory: (cat: string) => void;
  declineNote: string;
  setDeclineNote: (note: string) => void;
  confirmItemDecline: () => void;
}

export default function ClaimAuditDialogs({
  approvalDialog,
  setApprovalDialog,
  approvalNote,
  setApprovalNote,
  confirmItemApproval,

  adjustDialog,
  setAdjustDialog,
  adjustQuantity,
  setAdjustQuantity,
  adjustReason,
  setAdjustReason,
  confirmQuantityAdjustment,

  declineDialog,
  setDeclineDialog,
  declineCategory,
  setDeclineCategory,
  declineNote,
  setDeclineNote,
  confirmItemDecline
}: ClaimAuditDialogsProps) {
  
  const itemQty = (item: any) => Math.max(1, Number(item.quantity ?? 1));

  return (
    <>
      {/* Approve Dialog */}
      <Dialog open={!!approvalDialog} onOpenChange={(open) => {
        if (!open) {
          setApprovalDialog(null);
          setApprovalNote("");
        }
      }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-2xl border-slate-200 p-0">
          <DialogHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
            <DialogTitle className="text-sm font-semibold text-slate-900">Approve Claim Item</DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
              Restore this item into the payable claim list. Add an optional note for audit history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <p className="text-xs font-semibold text-emerald-600">Item</p>
              <p className="mt-1 text-xs font-semibold text-slate-900">{approvalDialog?.item?.name || approvalDialog?.item?.item_name || "Claim item"}</p>
            </div>
            <Textarea
              value={approvalNote}
              onChange={(event) => setApprovalNote(event.target.value)}
              placeholder="Optional approval or pricing note..."
              className="min-h-[110px] resize-none rounded-xl border-slate-200 text-xs font-medium leading-relaxed"
            />
          </div>
          <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/80 p-4">
            <Button type="button" variant="outline" onClick={() => setApprovalDialog(null)} className="h-9 rounded-xl text-xs font-semibold">Cancel</Button>
            <Button type="button" onClick={confirmItemApproval} className="h-9 rounded-xl bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700">Approve Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Dialog */}
      <Dialog open={!!adjustDialog} onOpenChange={(open) => {
        if (!open) {
          setAdjustDialog(null);
          setAdjustQuantity("");
          setAdjustReason("");
        }
      }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-2xl border-slate-200 p-0">
          <DialogHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
            <DialogTitle className="text-sm font-semibold text-slate-900">Adjust Approved Quantity</DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
              Enter the payable quantity and the audit reason. This replaces the browser popup with a tracked audit decision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <p className="text-xs font-semibold text-blue-600">Item</p>
              <p className="mt-1 text-xs font-semibold text-slate-900">{adjustDialog?.item?.name || adjustDialog?.item?.item_name || "Claim item"}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Original quantity: {adjustDialog ? itemQty(adjustDialog.item) : 0}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Approved Quantity</Label>
              <Input
                type="number"
                min={0}
                max={adjustDialog ? itemQty(adjustDialog.item) : undefined}
                value={adjustQuantity}
                onChange={(event) => setAdjustQuantity(event.target.value)}
                className="h-11 rounded-xl border-slate-200 text-sm font-semibold"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Adjustment Reason</Label>
              <Textarea
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
                placeholder="Explain why this quantity is being adjusted..."
                className="min-h-[120px] resize-none rounded-xl border-slate-200 text-xs font-medium leading-relaxed"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/80 p-4">
            <Button type="button" variant="outline" onClick={() => setAdjustDialog(null)} className="h-9 rounded-xl text-xs font-semibold">Cancel</Button>
            <Button type="button" onClick={confirmQuantityAdjustment} className="h-9 rounded-xl bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700">Save Adjustment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline Dialog */}
      <Dialog open={!!declineDialog} onOpenChange={(open) => {
        if (!open) {
          setDeclineDialog(null);
          setDeclineCategory("");
          setDeclineNote("");
        }
      }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-2xl border-slate-200 p-0">
          <DialogHeader className="border-b border-slate-100 bg-slate-50/80 p-5">
            <DialogTitle className="text-sm font-semibold text-slate-900">Decline Claim Item</DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
              A reason category and auditor note are required. The system will convert this into a professional explanation for the hospital.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <p className="text-xs font-semibold text-rose-600">Item Under Review</p>
              <p className="mt-1 text-xs font-semibold text-slate-900">{declineDialog?.item?.name || declineDialog?.item?.item_name || "Claim item"}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Decline Reason Category</Label>
              <Select value={declineCategory} onValueChange={setDeclineCategory}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-xs font-semibold">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {DECLINE_REASONS.map(reason => (
                    <SelectItem key={reason} value={reason} className="text-xs font-semibold">{reason}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">Auditor Notes</Label>
              <Textarea
                value={declineNote}
                onChange={(event) => setDeclineNote(event.target.value)}
                placeholder="Explain why this item is not payable..."
                className="min-h-[120px] resize-none rounded-xl border-slate-200 text-xs font-medium leading-relaxed"
              />
            </div>
            {declineCategory && declineNote.trim() && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <p className="text-xs font-semibold text-emerald-600">Hospital-facing explanation</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">
                  {buildHospitalExplanation(declineCategory, declineNote, declineDialog?.item?.name || "this item")}
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/80 p-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeclineDialog(null)}
              className="h-9 rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmItemDecline}
              disabled={!declineCategory || !declineNote.trim()}
              className="h-9 rounded-xl bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700"
            >
              Decline Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
