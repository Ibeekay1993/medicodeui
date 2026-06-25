// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, FileText, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useNavigate } from "react-router-dom";
import { ReviewModal } from "@/components/dashboard/ReviewModal";
import { SupportConversationsSidebar } from "@/components/support/SupportConversationsSidebar";
import { SupportChatArea } from "@/components/support/SupportChatArea";
import { SupportDetailsSidebar } from "@/components/support/SupportDetailsSidebar";
import { NewTicketModal } from "@/components/support/NewTicketModal";
import {
  conversationRoute,
  getRouteTags,
  isRequestSupportTicket,
} from "@/lib/support-helpers";
import { readJson, supportLocalKey, writeJson } from "@/lib/message-keys";
import { formatRelativeTime } from "@/lib/relative-time";

export default function SupportMessagesPage() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Selected ticket
  const [selected, setSelected] = useState<any>(null);

  // UI & Panel Collapsing States
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => !(role === "claims" || role === "admin"));

  const persistedFilters = readJson<{ search: string; filter: string; categoryFilter: string }>(supportLocalKey.filters, { search: "", filter: "all", categoryFilter: "all" });
  // Filter & search states
  const [search, setSearch] = useState(persistedFilters.search);
  const [filter, setFilter] = useState<string>(persistedFilters.filter);
  const [categoryFilter, setCategoryFilter] = useState<string>(persistedFilters.categoryFilter);
  const [conversations, setConversations] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [authRequests, setAuthRequests] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [mobileSubView, setMobileSubView] = useState<string>("LIST");
  const [bulkSelection, setBulkSelection] = useState<string[]>([]);
  const [reviewRequestOpen, setReviewRequestOpen] = useState(false);

  const isHospital = role === "hospital";
  
  
  const defaultRightOpen = (role === "claims" || role === "admin") && !isHospital;
  const isInternal = ["admin", "nurse", "claims"].includes(role || "");

  // 1. Fetch conversations from Supabase
  const loadConversations = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      let q = supabase
        .from("support_conversations" as any)
        .select(`
          *,
          linked_request_id,
          request_reference,
          request_metadata,
          ticket_type,
          request_ticket_status,
          hospitals (
            name
          )
        `);
        
      if (isHospital) {
        const { data: hospital } = await supabase
          .from("hospitals")
          .select("id")
          .eq("user_id", user?.id)
          .maybeSingle();
        if (hospital) {
          q = q.eq("hospital_id", hospital.id);
        } else {
          q = q.eq("created_by", user?.id);
        }
      }

      const { data, error } = await q
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(250);

      if (error) {
        toast({ variant: "destructive", title: "Conversations load failed", description: error.message });
        return;
      }
      setConversations(data || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [isHospital, user?.id, toast]);

  const reloadConversationsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleLoadConversations = useCallback(() => {
    if (reloadConversationsTimerRef.current) {
      clearTimeout(reloadConversationsTimerRef.current);
    }
    reloadConversationsTimerRef.current = setTimeout(() => {
      loadConversations(false);
    }, 250);
  }, [loadConversations]);

  // 2. Fetch Agents/Internal users
  const loadAgents = useCallback(async () => {
    if (!isInternal) return;
    const { data } = await supabase
      .from("user_roles")
      .select("user_id, full_name, role")
      .in("role", ["nurse", "claims", "admin"])
      .order("role");
    setAgents(data || []);
  }, [isInternal]);

  // 3. Fetch Authorization Requests & Claims
  const loadAuthAndClaims = useCallback(async () => {
    try {
      let hospitalId: string | null = null;
      if (isHospital) {
        const { data: hospital } = await supabase
          .from("hospitals")
          .select("id")
          .eq("user_id", user?.id)
          .maybeSingle();
        if (hospital) {
          hospitalId = String((hospital as any)?.id ?? "");
        }
      }

      // Expand the linked-data window so older tickets still resolve their auth/claim context.
      // Fetch requests
      let qAuth = supabase
        .from("authorization_requests")
        .select("id, request_id, patient_name, policy_number, diagnosis, treatment, clinical_notes, decision_reason, status, authorization_code, estimated_cost, created_at, updated_at, hospital_id, hospital_name, requesting_hospital_id, requesting_hospital_name, referring_hospital_id, referring_hospital_name, referred_hospital_id, referred_hospital_name, claiming_hospital_id, claiming_hospital_name, submitted_by, decided_by, decided_at");
      
      if (isHospital && hospitalId) {
        qAuth = qAuth.eq("hospital_id", hospitalId);
      }
      const { data: auths, error: authErr } = await qAuth.order("created_at", { ascending: false }).limit(600);
      if (!authErr) setAuthRequests(auths || []);

      // Fetch claims
      let qClaims = supabase
        .from("hospital_claims" as any)
        .select("id, hospital_name, claim_number, auth_code, patient_name, policy_number, diagnosis, total_amount, status, created_at, request_id");
      
      if (isHospital && hospitalId) {
        qClaims = qClaims.eq("hospital_id", hospitalId);
      }
      const { data: clms, error: clmsErr } = await qClaims.order("created_at", { ascending: false }).limit(600);
      if (!clmsErr) setClaims(clms || []);
    } catch (e) {
      console.error("Error loading clinical data:", e);
    }
  }, [isHospital, user?.id]);

  const handleReviewUpdated = () => {
    loadAuthAndClaims();
    loadConversations();
    if (selected?.id) loadMessages(selected.id);
  };

  // 4. Load messages for the selected thread
  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("support_messages" as any)
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) {
      toast({ variant: "destructive", title: "Thread failed to load", description: error.message });
      return;
    }
    setMessages(data || []);

    const unread = (data || []).filter((msg: any) =>
      msg.sender_id !== user?.id && (!Array.isArray(msg.read_by) || !msg.read_by.includes(user?.id))
    );
    if (user?.id && unread.length) {
      await Promise.all(unread.slice(0, 50).map((msg: any) =>
        supabase
          .from("support_messages" as any)
          .update({ read_by: [...(Array.isArray(msg.read_by) ? msg.read_by : []), user.id] })
          .eq("id", msg.id)
      ));
    }
  }, [toast, user?.id]);

  // Persist filter state so refresh keeps the user's view.
  useEffect(() => {
    writeJson(supportLocalKey.filters, { search, filter, categoryFilter });
  }, [search, filter, categoryFilter]);

// Initial Load Trigger
  useEffect(() => {
    if (user?.id && role) {
      loadConversations(true);
      loadAgents();
      loadAuthAndClaims();
    }
  }, [user?.id, role, loadConversations, loadAgents, loadAuthAndClaims]);

  useTabVisibilityRefresh(() => loadConversations(false), Boolean(user?.id && role));

  // Handle auto-select parameters (e.g. from other pages)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conversationId = params.get("conversation");
    if (conversationId && conversations.length > 0) {
      const found = conversations.find((c) => c.id === conversationId);
      if (found) {
        setSelected(found);
        setMobileSubView("CHAT");
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [conversations]);

  // Realtime updates
  useEffect(() => {
    if (!user?.id) return;
    
    const channel = supabase
      .channel("support-inbox-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, (payload) => {
        const row = payload.new as any;
        if (!row?.id) return;
        loadConversations(false);
        setConversations((prev) => {
          const next = prev.some((item) => item.id === row.id)
            ? prev.map((item) => item.id === row.id ? { ...item, ...row } : item)
            : [row, ...prev];
          return next.sort((a, b) => new Date(b.last_message_at || b.created_at || 0).getTime() - new Date(a.last_message_at || a.created_at || 0).getTime());
        });
        if (selected?.id === row.id) setSelected((prev: any) => prev ? { ...prev, ...row } : prev);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        const row = payload.new as any;
        scheduleLoadConversations();
        if (row.conversation_id === selected?.id) {
          loadMessages(row.conversation_id);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          scheduleLoadConversations();
          if (selected?.id) loadMessages(selected.id);
        }
      });
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selected?.id, user?.id, loadConversations, loadMessages, scheduleLoadConversations]);

useEffect(() => {
    if (!selected?.id) return;
    const timeout = setTimeout(() => {
      supabase.rpc("mark_support_notifications_read" as any, { _conversation_id: selected.id }).catch((e) =>
        console.warn("mark notifications read failed", e),
      );
    }, 150);
    return () => clearTimeout(timeout);
  }, [selected?.id]);

  const selectedRequestMetadata = useMemo(() => {
    if (!selected?.request_metadata) return null;
    if (typeof selected.request_metadata === "string") {
      try {
        return JSON.parse(selected.request_metadata);
      } catch {
        return null;
      }
    }
    return selected.request_metadata;
  }, [selected?.request_metadata]);

  const linkedRequestId = useMemo(() => {
    return selected?.linked_request_id || selectedRequestMetadata?.request_uuid || getRouteTags(selected).find((t: string) => t.startsWith("request:"))?.split(":")?.[1];
  }, [selected, selectedRequestMetadata?.request_uuid]);

  const linkedClaimId = useMemo(() => {
    return getRouteTags(selected).find((t: string) => t.startsWith("claim:"))?.split(":")?.[1];
  }, [selected]);

  const matchedRequest = useMemo(() => {
    if (linkedRequestId) {
      const byId = authRequests.find((r) => r.id === linkedRequestId);
      if (byId) return byId;
    }

    if (selectedRequestMetadata?.request_uuid) {
      const byMetadataId = authRequests.find((r) => r.id === selectedRequestMetadata.request_uuid);
      if (byMetadataId) return byMetadataId;
    }

    const metadataReference = String(selectedRequestMetadata?.request_id || selectedRequestMetadata?.authorization_code || selected?.request_reference || "").toLowerCase();
    if (metadataReference) {
      const byReference = authRequests.find((r) =>
        String(r.id || "").toLowerCase() === metadataReference ||
        String(r.request_id || "").toLowerCase() === metadataReference ||
        String(r.authorization_code || "").toLowerCase() === metadataReference
      );
      if (byReference) return byReference;
    }

    if (selectedRequestMetadata) {
      return {
        ...selectedRequestMetadata,
        id: selectedRequestMetadata.request_uuid || linkedRequestId || selectedRequestMetadata.request_uuid,
        request_uuid: selectedRequestMetadata.request_uuid || linkedRequestId,
        request_id: selectedRequestMetadata.request_id || selected?.request_reference,
        authorization_code: selectedRequestMetadata.authorization_code,
        hospital_name: selectedRequestMetadata.hospital_name || selectedRequestMetadata.hospital,
        status: selectedRequestMetadata.status || "pending",
      };
    }

    return null;
  }, [linkedRequestId, selectedRequestMetadata, selected?.request_reference, authRequests]);

  const reviewRequest = matchedRequest;

  useEffect(() => {
    if (reviewRequestOpen && !reviewRequest) setReviewRequestOpen(false);
  }, [reviewRequest, reviewRequestOpen]);

  const matchedClaim = useMemo(() => {
    if (!linkedClaimId) return null;
    return claims.find((c) => c.id === linkedClaimId);
  }, [linkedClaimId, claims]);

  // Filter conversations list items
  const filteredConversations = useMemo(() => {
    return conversations.filter((item) => {
      const itemTags = getRouteTags(item);
      const reqId = itemTags.find((t: string) => t.startsWith("request:"))?.split(":")?.[1];
      const matchedReq = reqId ? authRequests.find((r) => r.id === reqId) : null;
      
      const claimId = itemTags.find((t: string) => t.startsWith("claim:"))?.split(":")?.[1];
      const matchedClm = claimId ? claims.find((c) => c.id === claimId) : null;

      const extraSearchText = matchedReq 
        ? `${matchedReq.authorization_code || ""} ${matchedReq.policy_number || ""} ${matchedReq.patient_name || ""}` 
        : matchedClm 
          ? `${matchedClm.policy_number || ""} ${matchedClm.patient_name || ""}` 
          : "";

      const matchesSearch = `${item.ticket_number || ""} ${item.subject || ""} ${item.department || ""} ${item.priority || ""} ${item.last_message || ""} ${itemTags.join(" ")} ${extraSearchText}`.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      const route = conversationRoute(item, user?.id, authRequests, claims);

      if (role === "nurse" && !route.isNurse) return false;
      if (role === "claims" && !route.isClaims) return false;

      if (categoryFilter === "request_support") {
        if (!isRequestSupportTicket(item)) return false;
      }
      if (categoryFilter === "request") {
        if (!route.isRequestCategory) return false;
      }
      if (categoryFilter === "claim") {
        if (!route.isClaimCategory) return false;
      }

      if (filter === "open") {
        return ["new", "open", "reopened"].includes(item.status);
      }
      if (filter === "pending") {
        return ["pending_customer_response", "waiting_internal_action", "pending"].includes(item.status);
      }
      if (filter === "closed") {
        return ["closed", "resolved"].includes(item.status);
      }
      if (filter === "mine") {
        return item.assigned_to === user?.id;
      }
      return true;
    });
  }, [conversations, search, filter, categoryFilter, role, user?.id, authRequests, claims]);

  const updateConversation = async (updates: Record<string, any>) => {
    if (!selected?.id) return;
    const nextUpdates = {
      ...updates,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("support_conversations" as any)
      .update(nextUpdates)
      .eq("id", selected.id)
      .select("id, status, request_ticket_status, last_message, last_message_at, updated_at")
      .maybeSingle();
    if (error) {
      toast({ variant: "destructive", title: "Update failed", description: error.message });
      return;
    }
    setSelected((prev: any) => prev ? { ...prev, ...nextUpdates, ...data } : data);
    setConversations((prev) => prev.map((item) => item.id === selected.id ? { ...item, ...nextUpdates, ...data } : item));
  };

  // Bulk status update for selection.
  const bulkUpdateStatus = async (status: 'open' | 'resolved' | 'closed' | 'pending_customer_response') => {
    if (!bulkSelection.length) return;
    try {
      const updates = bulkSelection.map((id) =>
        supabase.from('support_conversations' as any).update({ status, updated_at: new Date().toISOString() }).eq('id', id)
      );
      const results = await Promise.all(updates);
      const failed = results.filter((r) => r.error).length;
      toast({
        title: failed ? 'Updated with errors' : 'Conversations updated',
        description: failed ? ' conversation(s) failed to update.' : 'Status applied to  conversation(s).',
      });
      setBulkSelection([]);
      loadConversations(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Bulk update failed', description: e.message });
    }
  };

  const claimTicket = async () => {
    if (!selected?.id || !user) return;
    await updateConversation({
      assigned_to: user.id,
      assigned_by: user.id,
      assigned_at: new Date().toISOString(),
      status: selected.status === "new" ? "open" : selected.status,
    });
    toast({ title: "Ticket claimed", description: "You are now assigned to this support ticket." });
  };

  const handleLinkCase = async (id: string, type: "request" | "claim") => {
    if (!selected?.id) return;
    const newTags = getRouteTags(selected);
    const filteredTags = newTags.filter((t: string) => !t.startsWith("request:") && !t.startsWith("claim:") && !t.startsWith("code:"));
    
    if (type === "request") {
      filteredTags.push(`request:${id}`);
      const req = authRequests.find((r) => r.id === id);
      if (req?.authorization_code) {
        filteredTags.push(`code:${req.authorization_code}`);
      }
      try {
        const { data: linkedConversation, error: linkError } = await supabase.rpc("link_support_conversation_to_request" as any, {
          _conversation_id: selected.id,
          _request_id: id,
        });
        if (linkError) throw linkError;
        setSelected(linkedConversation);
        await loadConversations();
      } catch (error: any) {
        toast({ variant: "destructive", title: "Request thread already exists", description: error.message || "This request already has one support thread." });
        return;
      }
      const updates: Record<string, any> = {
        tags: filteredTags,
        linked_request_id: id,
        request_reference: req?.authorization_code || req?.request_id || id,
        request_metadata: {
          request_id: req?.request_id,
          request_uuid: id,
          patient_name: req?.patient_name,
          policy_number: req?.policy_number,
          diagnosis: req?.diagnosis,
          treatment: req?.treatment,
          clinical_notes: req?.clinical_notes,
          decision_reason: req?.decision_reason,
          status: req?.status,
          authorization_code: req?.authorization_code,
          hospital: req?.hospital_name,
          hospital_id: req?.hospital_id,
          requesting_hospital_id: req?.requesting_hospital_id,
          requesting_hospital_name: req?.requesting_hospital_name,
          referring_hospital_id: req?.referring_hospital_id,
          referring_hospital_name: req?.referring_hospital_name,
          referred_hospital_id: req?.referred_hospital_id,
          referred_hospital_name: req?.referred_hospital_name,
          claiming_hospital_id: req?.claiming_hospital_id,
          claiming_hospital_name: req?.claiming_hospital_name,
          date_created: req?.created_at,
          decided_at: req?.decided_at,
          decided_by: req?.decided_by,
        },
        ticket_type: "request_support",
        request_ticket_status: "open",
      };
      await updateConversation(updates);
    } else {
      filteredTags.push(`claim:${id}`);
      const clm = claims.find((c) => c.id === id);
      if (clm?.auth_code) {
        filteredTags.push(`code:${clm.auth_code}`);
      }
    }

    await updateConversation({ tags: filteredTags });
    toast({ title: "Case reference linked", description: "This chat has been successfully linked to the medical reference." });
  };

  const handleUnlinkCase = async () => {
    if (!selected?.id) return;
    const newTags = getRouteTags(selected);
    const filteredTags = newTags.filter((t: string) => !t.startsWith("request:") && !t.startsWith("claim:") && !t.startsWith("code:"));
    await updateConversation({
      tags: filteredTags,
      linked_request_id: null,
      request_reference: null,
      request_metadata: {},
      ticket_type: "general",
      request_ticket_status: "open",
    });
    toast({ title: "Case unlinked", description: "The clinical case connection was removed." });
  };

const updateClaimStatus = async (status: "approved" | "rejected" | "paid" | "under_review") => {
    if (!matchedClaim?.id || !user || !selected?.id) return;
    try {
      // 1. Update claim in db
      const { error: claimErr } = await supabase
        .from("hospital_claims")
        .update({ status })
        .eq("id", matchedClaim.id);
      if (claimErr) throw claimErr;

      // 2. Draft system announcement
      let systemAnnouncement = "";
      if (status === "approved") {
        systemAnnouncement = `FINANCIAL CLAIM AUDIT COMPLETED\n\nThe Claims Officer has VERIFIED the tariffs for claim number **${matchedClaim.claim_number}** (Patient: ${matchedClaim.patient_name}).\n\nClaim Audit: APPROVED / TARIFF VERIFIED\nEstimated Value: ₦${Number(matchedClaim.total_amount || 0).toLocaleString()}\n\nThis dispute has been successfully assessed and is now resolved and closed. Payment disburse command initiated.`;
      } else if (status === "paid") {
        systemAnnouncement = `FINANCIAL CLAIM DISBURSED\n\nThe Claims Officer has DISBURSED the payment for claim number **${matchedClaim.claim_number}** (Patient: ${matchedClaim.patient_name}).\n\nPayment Status: DISBURSED / PAID\nDisbursement Amount: ₦${Number(matchedClaim.total_amount || 0).toLocaleString()}\n\nReimbursement is completed. The dispute is now resolved and closed.`;
      } else if (status === "rejected") {
        systemAnnouncement = `FINANCIAL CLAIM AUDIT COMPLETED\n\nThe Claims Officer has REJECTED the claim number **${matchedClaim.claim_number}** (Patient: ${matchedClaim.patient_name}).\n\nClaim Status: REJECTED\n\nThis dispute is now closed. Please check details or resubmit documentation if necessary.`;
      } else {
        systemAnnouncement = `FINANCIAL CLAIM UNDER AUDIT\n\nThe claim number **${matchedClaim.claim_number}** is now placed under intensive audit review.\n\nStatus: UNDER REVIEW\n\nSupport representatives will continue updating you here.`;
      }

      // 3. Send public system message to active chat
      const { error: msgErr } = await supabase.rpc("send_support_message" as any, {
        _conversation_id: selected.id,
        _body: systemAnnouncement,
        _is_internal: false,
      });
      if (msgErr) throw msgErr;

      // 4. Resolve chat if status is final
      const isResolved = ["approved", "paid", "rejected"].includes(status);
      if (isResolved) {
        const { error: convErr } = await supabase
          .from("support_conversations" as any)
          .update({
            status: "resolved",
            last_message: `Financial claim audit completed: ${status.toUpperCase()}`,
            last_message_at: new Date().toISOString()
          })
          .eq("id", selected.id);
        if (convErr) throw convErr;
      }

      toast({ 
        title: "Financial Decision Released", 
        description: `Financial reimbursement claim set to ${status.toUpperCase()}. Decision published to hospital & chat closed.` 
      });

      // 5. Redirect back to claims queue
      const targetQueue = role === "admin" ? "/backoffice/admin/claims" : "/backoffice/claims/all";
      navigate(targetQueue);
      
    } catch (e: any) {
      toast({ variant: "destructive", title: "Claim update failed", description: e.message });
    }
  };

  return (
    <div className="flex overflow-hidden h-full w-full bg-white font-sans">
      <SupportConversationsSidebar
        conversations={conversations}
        filteredConversations={filteredConversations}
        selected={selected}
        setSelected={setSelected}
        loading={loading}
        role={role}
        isInternal={isInternal}
        search={search}
        setSearch={setSearch}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        filter={filter}
        setFilter={setFilter}
        leftCollapsed={leftCollapsed}
        setLeftCollapsed={setLeftCollapsed}
        onNewTicketClick={() => setNewTicketOpen(true)}
        setMobileSubView={setMobileSubView}
        mobileSubView={mobileSubView}
      />

      <SupportChatArea
        selected={selected}
        setSelected={setSelected}
        messages={messages}
        setMessages={setMessages}
        agents={agents}
        isInternal={isInternal}
        role={role}
        user={user}
        leftCollapsed={leftCollapsed}
        setLeftCollapsed={setLeftCollapsed}
        rightCollapsed={rightCollapsed}
        setRightCollapsed={setRightCollapsed}
        setMobileSubView={setMobileSubView}
        mobileSubView={mobileSubView}
        loadConversations={loadConversations}
        updateConversation={updateConversation}
        claimTicket={claimTicket}
        matchedRequest={matchedRequest}
        onNewTicketClick={() => setNewTicketOpen(true)}
      />

      <SupportDetailsSidebar
        selected={selected}
        role={role}
        isInternal={isInternal}
        matchedRequest={matchedRequest}
        matchedClaim={matchedClaim}
        authRequests={authRequests}
        claims={claims}
        rightCollapsed={rightCollapsed}
        setRightCollapsed={setRightCollapsed}
        setMobileSubView={setMobileSubView}
        mobileSubView={mobileSubView}
        handleLinkCase={handleLinkCase}
        handleUnlinkCase={handleUnlinkCase}
        updateClaimStatus={updateClaimStatus}
        setReviewRequestOpen={setReviewRequestOpen}
      />

      {/* Mobile bottom tab navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-around z-40">
        <button
          type="button"
          onClick={() => setMobileSubView("LIST")}
          className={cn(
            "flex flex-col items-center gap-1 py-1 px-4 rounded-lg transition-colors",
            mobileSubView === "LIST" ? "text-brand-700 bg-brand-50" : "text-slate-500"
          )}
        >
          <MessageSquare className="h-5 w-5" />
          <span className="text-xs font-semibold">Inbox</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileSubView("CHAT")}
          disabled={!selected}
          className={cn(
            "flex flex-col items-center gap-1 py-1 px-4 rounded-lg transition-colors",
            mobileSubView === "CHAT" && selected ? "text-brand-700 bg-brand-50" : "text-slate-400"
          )}
        >
          <Send className="h-5 w-5" />
          <span className="text-xs font-semibold">Chat</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileSubView("INFO")}
          disabled={!selected}
          className={cn(
            "flex flex-col items-center gap-1 py-1 px-4 rounded-lg transition-colors",
            mobileSubView === "INFO" && selected ? "text-brand-700 bg-brand-50" : "text-slate-400"
          )}
        >
          <FileText className="h-5 w-5" />
          <span className="text-xs font-semibold">Details</span>
        </button>
      </div>

      {/* Floating Action Button */}
      <button
        type="button"
        onClick={() => {
          setNewTicketOpen(true);
        }}
        className="fixed bottom-20 right-5 z-50 lg:bottom-8 lg:right-8 h-14 w-14 rounded-full bg-slate-900 text-white shadow-2xl shadow-slate-900/30 hover:bg-slate-800 hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
        title="New Conversation"
      >
        <Plus className="h-6 w-6" />
      </button>

      <NewTicketModal
        isOpen={newTicketOpen}
        onOpenChange={setNewTicketOpen}
        conversations={conversations}
        authRequests={authRequests}
        claims={claims}
        onSuccess={(conv) => {
          setSelected(conv);
          setMobileSubView("CHAT");
          loadConversations();
        }}
      />

      {isInternal && (
        <ReviewModal
          request={reviewRequest}
          open={Boolean(reviewRequestOpen && reviewRequest)}
          onClose={() => setReviewRequestOpen(false)}
          onUpdated={handleReviewUpdated}
        />
      )}
    </div>
  );
}

















