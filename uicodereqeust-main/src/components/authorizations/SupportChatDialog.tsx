import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-2xl border-none p-0">
        <div className="bg-slate-900 p-5 text-white">
          <h2 className="text-sm font-black uppercase tracking-tight italic">Request Support Chat</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
            Raise a request-linked message
          </p>
        </div>

        <div className="p-5 space-y-4">
          {requestChatRequest && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Request</p>
                <p className="text-xs font-black text-slate-900 mt-1">
                  {requestChatRequest.request_id || requestChatRequest.authorization_code || requestChatRequest.id}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Status</p>
                <p className="text-xs font-black text-slate-900 mt-1 uppercase">{requestChatRequest.status}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Authorization Code</p>
                <p className="text-xs font-mono font-black text-slate-900 mt-1">
                  {requestChatRequest.status === "approved" ? requestChatRequest.authorization_code || "PENDING" : "NONE"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Decision Note</p>
                <p className="text-xs font-bold leading-snug text-slate-600 mt-1">
                  {requestChatRequest.decision_reason || requestChatRequest.clinical_notes || "No note recorded"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 col-span-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Patient / Policy</p>
                <p className="text-xs font-black text-slate-900 mt-1">{requestChatRequest.patient_name}</p>
                <p className="text-xs font-bold text-slate-500 mt-0.5">Policy: {requestChatRequest.policy_number}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 col-span-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Diagnosis</p>
                <p className="text-xs font-bold leading-snug text-slate-800 mt-1">
                  {requestChatRequest.diagnosis || "Not specified"}
                </p>
              </div>
              {requestChatRequest.treatment && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 col-span-2">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Treatment</p>
                  <p className="text-xs font-bold leading-snug text-slate-800 mt-1">{requestChatRequest.treatment}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Message</label>
            <textarea
              value={requestChatDraft}
              onChange={(e) => setRequestChatDraft(e.target.value)}
              placeholder="Describe your concern..."
              className="mt-2 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold outline-none focus:border-slate-400"
            />
          </div>

          <Button
            onClick={handleCreateRequestSupportChat}
            disabled={requestChatSending || !requestChatDraft.trim()}
            className="w-full h-11 rounded-xl bg-slate-900 text-xs font-black uppercase tracking-widest hover:bg-slate-800"
          >
            {requestChatSending ? "Creating..." : "Create Request Support Chat"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
