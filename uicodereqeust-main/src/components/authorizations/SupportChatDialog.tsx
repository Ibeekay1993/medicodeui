import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MessageSquare, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface SupportChatDialogProps {
  requestChatOpen: boolean;
  setRequestChatOpen: (open: boolean) => void;
  requestChatRequest: any | null;
  requestChatDraft: string;
  setRequestChatDraft: (draft: string) => void;
  requestChatSending: boolean;
  handleCreateRequestSupportChat: () => void;
}

export default function SupportChatDialog({
  requestChatOpen,
  setRequestChatOpen,
  requestChatRequest,
  requestChatDraft,
  setRequestChatDraft,
  requestChatSending,
  handleCreateRequestSupportChat
}: SupportChatDialogProps) {
  return (
    <Dialog open={requestChatOpen} onOpenChange={setRequestChatOpen}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
          <div className="pr-8">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-600" /> Request Support Chat
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Send a direct query linked to this authorization request
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-3.5">
          {requestChatRequest && (
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                <span className="text-[11px] font-medium text-slate-500 block">Request Ref</span>
                <span className="font-mono font-bold text-slate-900 mt-0.5 truncate block">
                  {requestChatRequest.request_id || requestChatRequest.authorization_code || requestChatRequest.id}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                <span className="text-[11px] font-medium text-slate-500 block">Status</span>
                <span className="font-semibold text-slate-900 capitalize mt-0.5 block">
                  {String(requestChatRequest.status || "").replace(/_/g, " ")}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 col-span-2">
                <span className="text-[11px] font-medium text-slate-500 block">Patient</span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {requestChatRequest.patient_name} <span className="font-mono text-slate-500 font-normal">({requestChatRequest.policy_number})</span>
                </span>
              </div>
              {requestChatRequest.diagnosis && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 col-span-2">
                  <span className="text-[11px] font-medium text-slate-500 block">Diagnosis</span>
                  <span className="font-medium text-slate-800 leading-snug block mt-0.5">
                    {requestChatRequest.diagnosis}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="support-chat-message-draft" className="text-xs font-semibold text-slate-700 block">
              Message to HMO Support
            </label>
            <Textarea
              id="support-chat-message-draft"
              value={requestChatDraft}
              onChange={(e) => setRequestChatDraft(e.target.value)}
              placeholder="Describe your inquiry, tariff question, or note regarding this request..."
              className="min-h-[100px] w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:border-slate-400"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRequestChatOpen(false)}
              className="h-9 px-4 rounded-lg text-xs font-medium border-slate-200 text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateRequestSupportChat}
              disabled={requestChatSending || !requestChatDraft.trim()}
              className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              {requestChatSending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send Support Message"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
