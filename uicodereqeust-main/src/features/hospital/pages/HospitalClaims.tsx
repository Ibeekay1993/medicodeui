import { useState, useEffect } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useAuth } from "@/contexts/AuthContext";
import { useHospitalProfile } from "../hooks/useHospitalDashboard";
import { useHospitalClaims } from "../hooks/useHospitalClaims";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { getErrorMessage } from "@/lib/errors";
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
import ContestDecisionDialog, { ContestFormData } from "@/components/hospital-claims/ContestDecisionDialog";

export default function HospitalClaims() {
  const { user, hospitalId } = useAuth();
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [contestTarget, setContestTarget] = useState<ClaimDraft | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const { data: hospital, isLoading: hospitalLoading } = useHospitalProfile(hospitalId, user?.id, user?.email);

  const { data: claimsData, isLoading: claimsLoading, refetch } = useHospitalClaims({
    hospital: hospital || null,
    debouncedSearch,
    page,
    pageSize,
  });

  const claims = claimsData?.claims || [];
  const total = claimsData?.total || 0;
  const loading = hospitalLoading || claimsLoading;
  
  const totalPages = Math.ceil(total / pageSize);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const claimStats = claimsData?.statsData ? calculateHospitalClaimStats(claimsData.statsData) : { pending: 0, approved: 0, paid: 0, totalValue: 0 };

  useTabVisibilityRefresh(refetch, Boolean(hospital));

  const selectedClaim = claims.find(c => c.id === selectedClaimId) || null;
  const filteredClaims = claims;
  const paginatedClaims = claims;

  const handleViewDetails = (id: string) => {
    setSelectedClaimId(id);
    setDetailsOpen(true);
  };

  const exportCSV = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const { data: hosp } = hospitalId
        ? await supabase.from("hospitals").select("id, name, code").eq("id", hospitalId).maybeSingle()
        : await supabase.from("hospitals").select("id, name, code").eq("user_id", user.id).maybeSingle();
      
      if (!hosp) {
        toast({ title: "No claims to export" });
        return;
      }

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

      const { data: allClaimsData, error } = await (supabase
        .from("hospital_claims" as any)
        .select("created_at, claim_number, patient_name, policy_number, auth_code, total_amount, approved_amount, declined_amount, contest_note, status, notes, line_items, paid_at, contest_submitted_at")
        .or(orQuery.join(","))
        .order("created_at", { ascending: false }) as any);

      if (error) throw error;
      if (!allClaimsData || !allClaimsData.length) {
        toast({ title: "No claims to export" });
        return;
      }

      const headers = ["Date", "Claim ID", "Patient Name", "Policy Number", "Auth Code", "Total Amount", "Approved Amount", "Declined Amount", "Contest Note", "Contest Status", "Paid Date", "Status", "Notes", "Items Breakdown"];
      const rows = allClaimsData.map((r: any) => [
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
          ? "Contest submitted"
          : "Not contested",
        r.paid_at ? new Date(r.paid_at).toLocaleDateString("en-GB") : "",
        r.status || "",
        r.notes || "",
        Array.isArray(r.line_items) ? r.line_items.map((item: any) => `${item.name} (${item.quantity} x ₦${item.unit_price})`).join("; ") : ""
      ]);

      const csvContent = [headers.join(","), ...rows.map((e: any) => e.map((f: any) => `"${String(f).replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Hospital_Claims_${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Export Successful" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export Failed", description: err.message || "Failed to export data." });
    } finally {
      setIsExporting(false);
    }
  };  const handleContestClaim = async (data: ContestFormData) => {
    if (!contestTarget) return;
    if (!hasContestableDeductions(contestTarget)) {
      toast({
        variant: "destructive",
        title: "Contest Not Allowed",
        description: "Only partially approved, adjusted, rejected, or declined claims can be contested.",
      });
      return;
    }

    const amountUnderContest = contestedAmount(contestTarget);
    const documents = await Promise.all((data.contestFiles || []).map((file: File) => new Promise<any>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, size: file.size, type: file.type, data_url: reader.result, captured_at: new Date().toISOString() });
      reader.onerror = () => resolve({ name: file.name, size: file.size, type: file.type, captured_at: new Date().toISOString() });
      reader.readAsDataURL(file);
    })));
    const updatedNotes = `${contestTarget.notes || ""}\n\n[HOSPITAL CONTEST APPEAL SUBMITTED on ${new Date().toLocaleDateString("en-GB")}]\nJustification: ${data.contestReason}`;

    const { error } = await supabase
      .from("hospital_claims" as any)
      .update({ 
        status: "contested",
        notes: updatedNotes,
        contest_note: data.contestReason,
        contest_documents: documents,
        under_contest_amount: amountUnderContest,
        contest_submitted_at: new Date().toISOString(),
        audit_summary: {
          ...(contestTarget.audit_summary || {}),
          contest: {
            status: "awaiting_reaudit",
            hospital_note: data.contestReason,
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
      setClaims(prev => prev.map(c => c.id === contestTarget.id ? { ...c, status: "contested", notes: updatedNotes, contest_note: data.contestReason, contest_documents: documents, under_contest_amount: amountUnderContest } : c));
      setContestTarget(null);
    }
  };

  const handleOpenContestChange = (open: boolean) => {
    if (!open) {
      setContestTarget(null);
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
        onSubmit={handleContestClaim}
        contestedAmount={contestTarget ? contestedAmount(contestTarget) : 0}
      />
    </div>
  );
}
