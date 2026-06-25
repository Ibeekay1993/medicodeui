import { useState, useEffect, useCallback } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useDataPagination } from "@/hooks/use-data-pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import {
  ClaimDraft,
  calculateHospitalClaimStats,
  statusClass,
  statusLabel,
  contestedAmount,
  hasContestableDeductions
} from "@/lib/claims-helpers";

import HospitalClaimsHeader from "@/components/hospital-claims/HospitalClaimsHeader";
import HospitalClaimsStats from "@/components/hospital-claims/HospitalClaimsStats";
import HospitalClaimsTable from "@/components/hospital-claims/HospitalClaimsTable";
import HospitalClaimDetails from "@/components/hospital-claims/HospitalClaimDetails";
import ContestDecisionDialog from "@/components/hospital-claims/ContestDecisionDialog";

export default function HospitalClaims() {
  const { user, hospitalId } = useAuth();
  const { toast } = useToast();
  const [claims, setClaims] = useState<ClaimDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [contestTarget, setContestTarget] = useState<ClaimDraft | null>(null);
  const [contestReason, setContestReason] = useState("");
  const [contestFiles, setContestFiles] = useState<File[]>([]);
  const [isSubmittingContest, setIsSubmittingContest] = useState(false);

  const fetchClaims = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: hosp, error: hospitalError } = hospitalId
        ? await supabase.from("hospitals").select("id, name, code").eq("id", hospitalId).maybeSingle()
        : await supabase.from("hospitals").select("id, name, code").eq("user_id", user.id).maybeSingle();
      if (hospitalError) throw hospitalError;
      if (hosp) {
        const safeName = String(hosp.name || "").replace(/[%(),]/g, " ");
        const safeCode = String(hosp.code || "").replace(/[%(),]/g, " ");

        const orQuery = [
          `hospital_id.eq.${hosp.id}`,
          `hospital_name.ilike.%${safeName}%`
        ];

        if (safeCode.trim()) {
          orQuery.push(`hospital_name.ilike.%${safeCode}%`);
        }
        
        const isUHS = safeName.toLowerCase().includes("university health") || safeCode.toUpperCase().includes("UHS");
        if (isUHS) {
          orQuery.push(`hospital_name.ilike.%UHS%`);
          orQuery.push(`hospital_name.ilike.%U.H.S%`);
          orQuery.push(`hospital_name.ilike.%University Health%`);
        }

        let allData: any[] = [];
        let page = 0;
        let hasMore = true;
        
        while (hasMore) {
          const { data, error } = await supabase
            .from("hospital_claims" as any)
            .select("*")
            .or(orQuery.join(","))
            .order("created_at", { ascending: false })
            .range(page * 1000, (page + 1) * 1000 - 1);
            
          if (error) throw error;
          if (data && data.length > 0) {
            allData = [...allData, ...data];
            page++;
            hasMore = data.length === 1000;
          } else {
            hasMore = false;
          }
        }
        setClaims(allData);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: getErrorMessage(error, "Unable to load claims") });
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [user, hospitalId, toast]);

  useEffect(() => {
    fetchClaims();
  }, [user, fetchClaims]);

  useTabVisibilityRefresh(fetchClaims);

  const selectedClaim = claims.find(c => c.id === selectedClaimId) || null;
  const filteredClaims = claims.filter(claim => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    return [claim.claim_number, claim.patient_name, claim.policy_number, claim.auth_code, claim.status]
      .some(value => String(value || "").toLowerCase().includes(term));
  });

  const {
    page,
    setPage,
    pageSize,
    totalPages,
    pageItems: paginatedClaims,
    start,
    end,
    total
  } = useDataPagination(filteredClaims);

  const claimStats = calculateHospitalClaimStats(claims);

  const handleViewDetails = (id: string) => {
    setSelectedClaimId(id);
    setDetailsOpen(true);
  };

  const exportCSV = () => {
    if (!claims.length) return toast({ title: "No claims to export" });
    setIsExporting(true);
    try {
      const headers = ["Date", "Claim ID", "Patient Name", "Policy Number", "Auth Code", "Total Amount", "Approved Amount", "Declined Amount", "Contest Note", "Contest Status", "Paid Date", "Status", "Notes", "Items Breakdown"];
      const rows = claims.map(r => [
        new Date(r.created_at).toLocaleDateString("en-GB"),
        r.claim_number || "",
        r.patient_name || "",
        r.policy_number || "",
        r.auth_code || "",
        r.total_amount || 0,
        r.approved_amount || 0,
        r.declined_amount || 0,
        r.contest_note || "",
        ["contested", "under_contest"].includes(String(r.status).toLowerCase())
          ? "Under contest"
          : (r as any).contest_submitted_at
          ? "Contest submitted"
          : "Not contested",
        r.paid_at ? new Date(r.paid_at).toLocaleDateString("en-GB") : "",
        r.status || "",
        r.notes || "",
        Array.isArray(r.line_items) ? r.line_items.map((item: any) => `${item.name} (${item.quantity} x ₦${item.unit_price})`).join("; ") : ""
      ]);

      const csvContent = [headers.join(","), ...rows.map(e => e.map(f => `"${String(f).replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Hospital_Claims_${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Export Successful" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleContestClaim = async () => {
    if (!contestTarget) return;
    if (!hasContestableDeductions(contestTarget)) {
      return toast({
        variant: "destructive",
        title: "Contest Not Allowed",
        description: "Only partially approved, adjusted, rejected, or declined claims can be contested.",
      });
    }
    const reason = contestReason.trim();
    if (!reason) {
      return toast({ variant: "destructive", title: "Contest Rejected", description: "You must provide a valid clinical justification." });
    }

    setIsSubmittingContest(true);
    const amountUnderContest = contestedAmount(contestTarget);
    const documents = await Promise.all(contestFiles.map(file => new Promise<any>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, size: file.size, type: file.type, data_url: reader.result, captured_at: new Date().toISOString() });
      reader.onerror = () => resolve({ name: file.name, size: file.size, type: file.type, captured_at: new Date().toISOString() });
      reader.readAsDataURL(file);
    })));
    const updatedNotes = `${contestTarget.notes || ""}\n\n[HOSPITAL CONTEST APPEAL SUBMITTED on ${new Date().toLocaleDateString("en-GB")}]\nJustification: ${reason}`;

    const { error } = await supabase
      .from("hospital_claims" as any)
      .update({ 
        status: "contested",
        notes: updatedNotes,
        contest_note: reason,
        contest_documents: documents,
        under_contest_amount: amountUnderContest,
        contest_submitted_at: new Date().toISOString(),
        audit_summary: {
          ...(contestTarget.audit_summary || {}),
          contest: {
            status: "awaiting_reaudit",
            hospital_note: reason,
            amount_under_contest: amountUnderContest,
            documents
          }
        }
      })
      .eq("id", contestTarget.id);

    if (error) {
      toast({ variant: "destructive", title: "Contest Submission Failed", description: error.message });
    } else {
      toast({ title: "Contest Appeal Submitted", description: "The auditing panel has been notified for manual reconciliation." });
      setClaims(prev => prev.map(c => c.id === contestTarget.id ? { ...c, status: "contested", notes: updatedNotes, contest_note: reason, contest_documents: documents, under_contest_amount: amountUnderContest } : c));
      setContestTarget(null);
      setContestReason("");
      setContestFiles([]);
    }
    setIsSubmittingContest(false);
  };

  const handleOpenContestChange = (open: boolean) => {
    if (!open && !isSubmittingContest) {
      setContestTarget(null);
      setContestReason("");
      setContestFiles([]);
    }
  };

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      <HospitalClaimsHeader
        search={search}
        setSearch={setSearch}
        exportCSV={exportCSV}
        isExporting={isExporting}
        loading={loading}
      />

      <HospitalClaimsStats
        pendingCount={claimStats.pending}
        approvedCount={claimStats.approved}
        paidCount={claimStats.paid}
        totalValue={claimStats.totalValue}
      />

      <HospitalClaimsTable
        loading={loading}
        filteredClaims={filteredClaims}
        paginatedClaims={paginatedClaims}
        onViewDetails={handleViewDetails}
        statusClass={statusClass}
        statusLabel={statusLabel}
        page={page}
        totalPages={totalPages}
        start={start}
        end={end}
        total={total}
        pageSize={pageSize}
        setPage={setPage}
      />

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider text-slate-900">
              Claim Details
            </DialogTitle>
          </DialogHeader>
          {selectedClaim && (
            <HospitalClaimDetails
              selectedClaim={selectedClaim}
              statusClass={statusClass}
              statusLabel={statusLabel}
              onContestClick={(claim) => {
                setDetailsOpen(false);
                setContestTarget(claim);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ContestDecisionDialog
        contestTarget={contestTarget}
        isOpen={!!contestTarget}
        onOpenChange={handleOpenContestChange}
        contestReason={contestReason}
        setContestReason={setContestReason}
        contestFiles={contestFiles}
        setContestFiles={setContestFiles}
        isSubmittingContest={isSubmittingContest}
        onSubmit={handleContestClaim}
        contestedAmount={contestTarget ? contestedAmount(contestTarget) : 0}
      />
    </div>
  );
}
