import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

interface RequestDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (value: string) => void;
  onDeleteRequest: () => void;
  processing: boolean;
}

export const RequestDeleteDialog = React.memo(function RequestDeleteDialog({
  open,
  onOpenChange,
  deleteConfirmText,
  setDeleteConfirmText,
  onDeleteRequest,
  processing,
}: RequestDeleteDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(openState) => {
        onOpenChange(openState);
        if (!openState) setDeleteConfirmText("");
      }}
    >
      <AlertDialogContent className="rounded-2xl border-slate-200">
        <AlertDialogHeader>
          <AlertDialogTitle>Request Deletion</AlertDialogTitle>
          <AlertDialogDescription>
            This sends the authorization to the Utilization Manager Lead for review. It will only be permanently deleted after approval. Type{" "}
            <span className="font-black text-slate-900">DELETE</span> to continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          placeholder="Type DELETE"
          className="h-10 rounded-xl"
          autoFocus
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processing} className="rounded-xl">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={processing || deleteConfirmText.trim() !== "DELETE"}
            onClick={onDeleteRequest}
            className="rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold"
          >
            {processing ? "Submitting..." : "Submit Request"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
