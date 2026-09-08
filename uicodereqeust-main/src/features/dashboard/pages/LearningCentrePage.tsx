import { useEffect, useState } from "react";
import { Brain, Check, Clock3, Loader2, RefreshCw, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Candidate = {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: string;
  evidence_count: number;
  confidence: number;
  first_observed_at: string;
  last_observed_at: string;
  review_note?: string | null;
};

const statusStyles: Record<string, string> = {
  candidate: "bg-amber-50 text-amber-700 border-amber-200",
  under_review: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  superseded: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function LearningCentrePage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadCandidates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("knowledge_candidates" as any)
      .select("id,title,summary,category,status,evidence_count,confidence,first_observed_at,last_observed_at,review_note")
      .order("last_observed_at", { ascending: false });
    if (error) {
      toast({ variant: "destructive", title: "Learning Centre unavailable", description: error.message });
    } else {
      setCandidates((data || []) as Candidate[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (role === "admin") void loadCandidates();
  }, [role]);

  const review = async (candidate: Candidate, status: string) => {
    setSavingId(candidate.id);
    const { error } = await supabase.rpc("review_knowledge_candidate" as any, {
      _candidate_id: candidate.id,
      _status: status,
      _review_note: notes[candidate.id] || null,
    });
    if (error) {
      toast({ variant: "destructive", title: "Review was not saved", description: error.message });
    } else {
      toast({ title: "Knowledge candidate updated", description: `Status changed to ${status.replace("_", " ")}.` });
      await loadCandidates();
    }
    setSavingId(null);
  };

  if (role !== "admin") {
    return <div className="flex h-[400px] items-center justify-center text-slate-500">Administrator access is required.</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-600">
            <Brain className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">Learning Centre</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Organisational memory</h1>
          <p className="mt-1 text-sm text-slate-500">Review observed patterns before they can influence any automation.</p>
        </div>
        <Button variant="outline" onClick={loadCandidates} disabled={loading} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Candidates", candidates.filter((item) => item.status === "candidate").length, "Patterns awaiting review"],
          ["Under review", candidates.filter((item) => item.status === "under_review").length, "Human review in progress"],
          ["Approved knowledge", candidates.filter((item) => item.status === "approved").length, "Reference only; no auto-action"],
        ].map(([label, value, detail]) => (
          <div key={String(label)} className="med-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p><strong>Observe-only protection:</strong> approving a candidate records human validation but does not change parser, chatbot, clinical, or authorization behavior.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading candidates...</div>
      ) : candidates.length === 0 ? (
        <div className="med-card flex flex-col items-center justify-center p-12 text-center">
          <Brain className="h-10 w-10 text-slate-300" />
          <h2 className="mt-3 font-semibold text-slate-700">No learning candidates yet</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">The observation layer is ready. Future events can create candidates here without changing production workflows.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {candidates.map((candidate) => (
            <article key={candidate.id} className="med-card p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{candidate.title}</h2>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${statusStyles[candidate.status] || statusStyles.candidate}`}>{candidate.status.replace("_", " ")}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{candidate.category}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{candidate.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>{candidate.evidence_count} evidence events</span>
                    <span>{Number(candidate.confidence).toFixed(0)}% confidence</span>
                    <span><Clock3 className="mr-1 inline h-3.5 w-3.5" />Last observed {new Date(candidate.last_observed_at).toLocaleDateString("en-GB")}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {candidate.status === "candidate" && <Button size="sm" variant="outline" onClick={() => review(candidate, "under_review")} disabled={savingId === candidate.id}><Clock3 className="mr-1 h-4 w-4" /> Review</Button>}
                  {candidate.status === "under_review" && <><Button size="sm" onClick={() => review(candidate, "approved")} disabled={savingId === candidate.id}><Check className="mr-1 h-4 w-4" /> Approve</Button><Button size="sm" variant="outline" onClick={() => review(candidate, "rejected")} disabled={savingId === candidate.id}><X className="mr-1 h-4 w-4" /> Reject</Button></>}
                </div>
              </div>
              {(candidate.status === "under_review" || candidate.status === "approved" || candidate.status === "rejected") && (
                <Textarea className="mt-4 min-h-20" placeholder="Add a review note (optional)" value={notes[candidate.id] || candidate.review_note || ""} onChange={(event) => setNotes((current) => ({ ...current, [candidate.id]: event.target.value }))} />
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
