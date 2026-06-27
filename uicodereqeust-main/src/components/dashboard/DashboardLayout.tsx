import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Settings, 
  LogOut, 
  ShieldCheck, 
  Bell, 
  ChevronLeft, 
  ChevronRight,
  Menu,
  Banknote,
  Zap,
  Activity,
  MessageSquare,
  Building2,
  LayoutDashboard,
  Users,
  Trash2,
  FileSpreadsheet,
  Megaphone
} from "lucide-react";
import { LiveChat } from "@/components/ui/LiveChat";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DashboardLayoutProps {
  children?: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [actionableMessages, setActionableMessages] = useState(0);
  const { user, signOut, role, fullName } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!user || !role) return;

    const playNotificationSound = () => {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const playChime = (frequency: number, startTime: number, duration: number) => {
          const osc = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(frequency, startTime);
          gainNode.gain.setValueAtTime(0.15, startTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
          osc.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          osc.start(startTime);
          osc.stop(startTime + duration);
        };
        playChime(523.25, audioCtx.currentTime, 0.4);
        playChime(659.25, audioCtx.currentTime + 0.12, 0.5);
      } catch (e) {
        console.warn("AudioContext chime failed:", e);
      }
    };

    const channels: any[] = [];

    const refreshActionableMessages = async () => {
      const { data: conversations } = await supabase
        .from("support_conversations" as any)
        .select("id,status,assigned_to,hospital_user_id,created_by,last_message_at")
        .not("status", "in", "(closed,resolved)")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(250);

      const ids = (conversations || []).map((item: any) => item.id);
      if (!ids.length) {
        setActionableMessages(0);
        return;
      }

      const { data: latestMessages } = await supabase
        .from("support_messages" as any)
        .select("id,conversation_id,sender_id,sender_role,is_internal,read_by,created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(500);

      const latestByConversation = new Map<string, any>();
      (latestMessages || []).forEach((msg: any) => {
        if (!latestByConversation.has(msg.conversation_id)) latestByConversation.set(msg.conversation_id, msg);
      });

      const staffRoles = ["admin", "utilization_manager", "claims", "finance"];
      const needsAttentionStatuses = ["new", "open", "reopened", "waiting_internal_action", "pending"];
      const hospitalWaitingStatuses = ["pending_customer_response", "open", "reopened"];
      const count = (conversations || []).filter((conversation: any) => {
        const status = String(conversation.status || "").toLowerCase();
        const latest = latestByConversation.get(conversation.id);
        const latestFromMe = latest?.sender_id === user.id;
        const latestFromHospital = latest?.sender_role === "hospital";
        const latestFromStaff = staffRoles.includes(latest?.sender_role || "");
        const latestUnread = latest && (!Array.isArray(latest.read_by) || !latest.read_by.includes(user.id));

        const currentRole = role as string;
        if (currentRole === "hospital") {
          const belongsToHospital = conversation.hospital_user_id === user.id || conversation.created_by === user.id;
          return belongsToHospital && latestFromStaff && latestUnread && hospitalWaitingStatuses.includes(status);
        }

        if (!staffRoles.includes(currentRole)) return false;
        const assignedToMe = conversation.assigned_to === user.id;
        const unassigned = !conversation.assigned_to;
        const staffActionStatus = needsAttentionStatuses.includes(status);
        return staffActionStatus && !latestFromMe && (latestFromHospital || unassigned || assignedToMe);
      }).length;

      setActionableMessages(count);
    };

    refreshActionableMessages();

    if (role === "admin") {
      const nameChannel = supabase
        .channel("realtime-dashboard-name-requests")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "profile_name_update_requests" }, (payload) => {
          const req = payload.new;
          if (req.status === "pending") {
            playNotificationSound();
            toast({ title: "Profile Name Approval Request", description: `"${req.current_name}" is requesting display name update to "${req.requested_name}".` });
          }
        })
        .subscribe();
      channels.push(nameChannel);
    }

    if (role === "admin" || role === "utilization_manager") {
      const authInsertChannel = supabase
        .channel("realtime-dashboard-auth-requests-insert")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "authorization_requests" }, (payload) => {
          const req = payload.new;
          playNotificationSound();
          toast({ title: "New Authorization Request", description: `${req.hospital_name || "A hospital"} submitted a request for ${req.patient_name || "a patient"}.` });
        })
        .subscribe();
      channels.push(authInsertChannel);
    } else if (role === "hospital") {
      const authUpdateChannel = supabase
        .channel("realtime-dashboard-auth-requests-update")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "authorization_requests" }, (payload) => {
          const req = payload.new;
          if (payload.old && payload.old.status !== req.status) {
            playNotificationSound();
            toast({ title: "Authorization Request Updated", description: `Your request for ${req.patient_name} has been ${(req.status || "").toUpperCase()}.` });
          }
        })
        .subscribe();
      channels.push(authUpdateChannel);
    }

    const chatAlertChannel = supabase
      .channel("realtime-dashboard-support-chat-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        const msg = payload.new;
        if (msg.sender_id === user.id) return;
        const currentRole = role as string;
        const senderIsHospital = msg.sender_role === "hospital";
        const userIsStaff = ["admin", "utilization_manager", "claims", "finance"].includes(currentRole);
        const userIsHospital = currentRole === "hospital";
        if ((userIsStaff && senderIsHospital) || (userIsHospital && ["admin", "utilization_manager", "claims", "finance"].includes(msg.sender_role || ""))) {
          refreshActionableMessages();
          playNotificationSound();
          toast({ title: `Support Message from ${msg.sender_name || "Support"}`, description: msg.body.length > 55 ? `${msg.body.substring(0, 55)}...` : msg.body });
        }
      })
      .subscribe();
    channels.push(chatAlertChannel);

    const conversationAlertChannel = supabase
      .channel("realtime-dashboard-support-conversation-actions")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, () => {
        refreshActionableMessages();
      })
      .subscribe();
    channels.push(conversationAlertChannel);

    if (role === "utilization_manager") {
      const utilizationManagerRequestSupportChannel = supabase
        .channel("realtime-dashboard-utilization-manager-request-support-alerts")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_conversations" }, (payload) => {
          const conversation = payload.new as any;
          if (conversation.ticket_type === "request_support" && conversation.assigned_to === user.id) {
            refreshActionableMessages();
            playNotificationSound();
            toast({ title: "Request Support Ticket", description: `New request support ticket assigned: ${conversation.request_reference || conversation.subject}` });
          }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_conversations" }, (payload) => {
          const conversation = payload.new as any;
          const previous = payload.old as any;
          const assignedToMeNow = conversation.assigned_to === user.id;
          const wasNotAssignedToMe = !previous || previous.assigned_to !== user.id;
          if (conversation.ticket_type === "request_support" && assignedToMeNow && wasNotAssignedToMe) {
            refreshActionableMessages();
            playNotificationSound();
            toast({ title: "Request Support Ticket Assigned", description: `Request ${conversation.request_reference || conversation.subject} was assigned to you.` });
          }
        })
        .subscribe();
      channels.push(utilizationManagerRequestSupportChannel);
    }

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [user?.id, role, toast]);

  const getBasePath = () => {
    if (role === "hospital") return "/dashboard";
    if (role === "claims") return "/backoffice/claims";
    if (role === "finance") return "/backoffice/finance";
    if (role === "admin") return "/backoffice/admin";
    return "/backoffice/utilization-manager";
  };
  const basePath = getBasePath();

  const getNavigation = () => {
    const r = role as string;
    if (r === "claims") {
      return [
        { name: "Dashboard", href: basePath, icon: Activity },
        { name: "Claims Queue", href: `${basePath}/all`, icon: Banknote },
        { name: "Claims Analysis", href: `${basePath}/analysis`, icon: LayoutDashboard },
        { name: "Claims Reports", href: `${basePath}/reports`, icon: FileSpreadsheet },
        { name: "Messages", href: `${basePath}/messages`, icon: MessageSquare, badge: actionableMessages },
        { name: "Settings", href: `${basePath}/settings`, icon: Settings }
      ];
    }

    if (r === "finance") {
      return [
        { name: "Dashboard", href: basePath, icon: Activity },
        { name: "Payments", href: `${basePath}/payments/awaiting`, icon: Banknote },
        { name: "Reports", href: `${basePath}/reports`, icon: FileSpreadsheet },
        { name: "Settings", href: `${basePath}/settings`, icon: Settings }
      ];
    }

    return [
      { name: "Dashboard", href: basePath, icon: Activity },
      { name: "Hospitals", href: `${basePath}/hospitals`, icon: Building2, hidden: r !== "admin" },
      { name: "Users", href: `${basePath}/users`, icon: Users, hidden: r !== "admin" },
      { name: "Announcements", href: `${basePath}/announcements`, icon: Megaphone, hidden: r !== "admin" },
      { name: "Delete Requests", href: `${basePath}/delete-requests`, icon: Trash2, hidden: r !== "admin" },
      { name: "NHIS Update", href: `${basePath}/nhis-update`, icon: FileSpreadsheet, hidden: r !== "admin" },
      { name: "Historical Import", href: `${basePath}/historical-import`, icon: FileSpreadsheet, hidden: r !== "admin" },
      { name: "New Request", href: "/dashboard/new-request", icon: Zap, hidden: r !== "hospital" },
      { name: "Authorizations", href: r === "hospital" ? `${basePath}/authorizations` : `${basePath}/requests`, icon: ShieldCheck },
      { name: "Claims Analysis", href: `${basePath}/claims-analysis`, icon: LayoutDashboard, hidden: r !== "admin" },
      { name: "Claims Queue", href: `${basePath}/claims`, icon: Banknote, hidden: r === "utilization_manager" },
      { name: "Payments", href: `/backoffice/admin/payments/awaiting`, icon: Banknote, hidden: r !== "admin" },
      { name: "Claims Reports", href: `${basePath}/claims-reports`, icon: FileSpreadsheet, hidden: r !== "admin" },
      { name: "Messages", href: `${basePath}/messages`, icon: MessageSquare, badge: actionableMessages },
      { name: "WhatsApp Parser", href: `${basePath}/whatsapp`, icon: MessageSquare, hidden: r === "hospital" },
      { name: "Pre-Auth Report", href: `${basePath}/reports`, icon: LayoutDashboard, hidden: r === "hospital" || r === "claims" || r === "finance" },
      { name: "Audit Feed", href: `${basePath}/audit`, icon: Activity, hidden: r !== "admin" },
      { name: "Settings", href: `${basePath}/settings`, icon: Settings },
    ].filter(item => !item.hidden);
  };

  const navigation = getNavigation();

  const isActiveRoute = (href?: string | null) => {
    if (!href || typeof href !== "string") return false;
    if (href === basePath) return location.pathname === basePath || location.pathname === basePath + "/";
    if (href.endsWith("/messages") && location.pathname && location.pathname.endsWith("/messages")) return true;
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  // Page title and description mapping based on current route
  const pageConfig = useMemo(() => {
    const path = location.pathname;
    
    // Claims role routes
    if (path === "/backoffice/claims" || path === "/backoffice/claims/") {
      return { title: "Dashboard Overview", description: "Real-time clinical authorizations & claims sync" };
    }
    if (path.startsWith("/backoffice/claims/analysis")) {
      return { title: "Claims Analysis", description: "Hospital billing performance and clinical intake insights" };
    }
    if (path.startsWith("/backoffice/claims/all")) {
      return { title: "Claims Queue", description: "Review, process, and track submitted claims" };
    }
    if (path.startsWith("/backoffice/claims/reports")) {
      return { title: "Claims Reports", description: "Download claims queue, payment, and audit reports" };
    }
    if (path.startsWith("/backoffice/claims/messages")) {
      return { title: "Claims & Billing Desk", description: "Claim, billing, payment, tariff, and assigned messages" };
    }
    if (path.startsWith("/backoffice/claims/settings")) {
      return { title: "Settings", description: "Manage security policies & account details" };
    }
    if (path.startsWith("/backoffice/claims/payments/awaiting")) {
      return { title: "Awaiting Payment", description: "Approved claims ready for payment processing" };
    }
    if (path.startsWith("/backoffice/claims/payments/batches")) {
      return { title: "Payment Batches", description: "Manage and process hospital payment batches" };
    }

    // Finance role routes
    if (path === "/backoffice/finance" || path === "/backoffice/finance/") {
      return { title: "Dashboard Overview", description: "Real-time clinical authorizations & claims sync" };
    }
    if (path.startsWith("/backoffice/finance/payments/awaiting")) {
      return { title: "Awaiting Payment", description: "Approved claims ready for payment processing" };
    }
    if (path.startsWith("/backoffice/finance/payments/batches")) {
      return { title: "Payment Batches", description: "Manage and process hospital payment batches" };
    }
    if (path.startsWith("/backoffice/finance/payments/paid")) {
      return { title: "Paid Claims", description: "History of paid and settled claims" };
    }
    if (path.startsWith("/backoffice/finance/reports")) {
      return { title: "Claims Reports", description: "Download claims queue, payment, and audit reports" };
    }
    if (path.startsWith("/backoffice/finance/settings")) {
      return { title: "Settings", description: "Manage security policies & account details" };
    }

    // Admin routes
    if (path === "/backoffice/admin" || path === "/backoffice/admin/") {
      return { title: "Dashboard Overview", description: "Real-time clinical authorizations & claims sync" };
    }
    if (path.startsWith("/backoffice/admin/requests")) {
      return { title: "Authorizations", description: "Search, review, and audit authorization requests" };
    }
    if (path.startsWith("/backoffice/admin/claims-analysis")) {
      return { title: "Claims Analysis", description: "Clinical intake and billing intelligence" };
    }
    if (path.startsWith("/backoffice/admin/claims")) {
      return { title: "Claims Queue", description: "Review, process, and track submitted claims" };
    }
    if (path.startsWith("/backoffice/admin/claims-reports")) {
      return { title: "Claims Reports", description: "Download claims queue, payment, and audit reports" };
    }
    if (path.startsWith("/backoffice/admin/payments/awaiting")) {
      return { title: "Awaiting Payment", description: "Approved claims ready for payment processing" };
    }
    if (path.startsWith("/backoffice/admin/payments/batches")) {
      return { title: "Payment Batches", description: "Manage and process hospital payment batches" };
    }
    if (path.startsWith("/backoffice/admin/payments/paid")) {
      return { title: "Paid Claims", description: "History of paid and settled claims" };
    }
    if (path.startsWith("/backoffice/admin/messages")) {
      return { title: "Admin Support Desk", description: "All routed workstreams, assignments, and escalations" };
    }
    if (path.startsWith("/backoffice/admin/reports")) {
      return { title: "Pre-Auth Analytics", description: "Clinical authorization trends, hospital performance & daily KPIs" };
    }
    if (path.startsWith("/backoffice/admin/audit")) {
      return { title: "System Audit Trail", description: "Track system activity, user actions, and data changes" };
    }
    if (path.startsWith("/backoffice/admin/whatsapp")) {
      return { title: "WhatsApp Parser", description: "Clinical Intake Engine" };
    }
    if (path.startsWith("/backoffice/admin/hospitals")) {
      return { title: "Hospitals", description: "Manage provider facilities & network relationships" };
    }
    if (path.startsWith("/backoffice/admin/users")) {
      return { title: "User Management", description: "Manage user access, roles, and profile requests" };
    }
    if (path.startsWith("/backoffice/admin/delete-requests")) {
      return { title: "Delete Requests", description: "Review and authorize record deletion requests" };
    }
    if (path.startsWith("/backoffice/admin/nhis-update")) {
      return { title: "Monthly Beneficiary Replacement", description: "NHIS beneficiary update and replacement management" };
    }
    if (path.startsWith("/backoffice/admin/historical-import")) {
      return { title: "Historical Code Import", description: "Duplicate-safe import and reconciliation" };
    }
    if (path.startsWith("/backoffice/admin/settings")) {
      return { title: "Settings", description: "Manage security policies & account details" };
    }

    // Utilization Manager routes
    if (path === "/backoffice/utilization-manager" || path === "/backoffice/utilization-manager/") {
      return { title: "Dashboard Overview", description: "Real-time clinical authorizations & claims sync" };
    }
    if (path.startsWith("/backoffice/utilization-manager/requests")) {
      return { title: "Authorizations", description: "Search, review, and audit authorization requests" };
    }
    if (path.startsWith("/backoffice/utilization-manager/messages")) {
      return { title: "Clinical Ticket Queue", description: "Pre-auth, prior-auth, code, and assigned clinical messages" };
    }
    if (path.startsWith("/backoffice/utilization-manager/whatsapp")) {
      return { title: "WhatsApp Parser", description: "Clinical Intake Engine" };
    }
    if (path.startsWith("/backoffice/utilization-manager/reports")) {
      return { title: "Pre-Auth Analytics", description: "Clinical authorization trends, hospital performance & daily KPIs" };
    }
    if (path.startsWith("/backoffice/utilization-manager/settings")) {
      return { title: "Settings", description: "Manage security policies & account details" };
    }

    // Hospital routes
    if (path === "/dashboard" || path === "/dashboard/") {
      return { title: "Hospital Portal", description: "Clinical authorization and claims workspace" };
    }
    if (path.startsWith("/dashboard/new-request")) {
      return { title: "New Request", description: "Submit a new pre-authorization request" };
    }
    if (path.startsWith("/dashboard/authorizations")) {
      return { title: "Authorizations", description: "View and manage your authorization requests" };
    }
    if (path.startsWith("/dashboard/claims")) {
      return { title: "Claims", description: "View and manage your claims" };
    }
    if (path.startsWith("/dashboard/messages")) {
      return { title: "My Support Messages", description: "Your conversations with Ronsberger HMO staff" };
    }
    if (path.startsWith("/dashboard/settings")) {
      return { title: "Settings", description: "Manage account details and preferences" };
    }

    return { title: "Ronsberger HMO", description: "Clinical Workspace" };
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] font-sans">
      <aside className={cn("group/sidebar hidden md:flex flex-col bg-slate-900 transition-all duration-300 ease-in-out relative z-30 shadow-2xl", isSidebarExpanded ? "w-60" : "w-16")}>
        <div className="py-4 px-4 mb-4">
          <button onClick={() => navigate(basePath)} className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left w-full overflow-hidden">
            <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-md p-1.5 overflow-hidden">
              <img src="/ronsberger-logo.webp" alt="Ronsberger HMO Logo" className="h-full w-full object-contain" />
            </div>
            {isSidebarExpanded && (
              <div className="animate-in fade-in slide-in-from-left-2 overflow-hidden flex flex-col justify-center">
                <p className="text-sm font-bold tracking-tight text-white whitespace-nowrap leading-tight">
                  RONSBERGER <span className="text-[#4d7a22]">HMO</span>
                </p>
                <p className="badge-label text-slate-400 mt-0.5">
                  Clinical Workspace
                </p>
              </div>
            )}
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto" role="navigation" aria-label="Main navigation">
          {navigation.map((item) => {
            const isActive = isActiveRoute(item.href);
            return (
              <button key={item.name} onClick={() => navigate(item.href)} aria-label={item.name} aria-current={isActive ? "page" : undefined}
                className={cn("w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group relative text-left",
                  isActive ? "bg-white text-slate-900 shadow-xl border-l-[3px] border-[#3f3f95]" : "text-slate-400 hover:bg-white/10 hover:text-white"
                )}>
                <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-[#3f3f95]" : "text-[#B4B2A9] group-hover:text-white")} />
                {isSidebarExpanded && (
                  <span className={cn("whitespace-nowrap text-sm", isActive ? "font-semibold text-slate-950" : "font-medium text-[#B4B2A9] group-hover:text-white")}>{item.name}</span>
                )}
                {(item.badge ?? 0) > 0 && (
                  <span className={cn("ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold", isActive ? "bg-[#3f3f95] text-white" : "bg-[#01aef2] text-slate-950")}>
                    {(item.badge ?? 0) > 99 ? "99+" : item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 mt-auto border-t border-white/5">
          <button onClick={handleSignOut} aria-label="Sign out"
            className={cn("w-full flex items-center gap-3 px-4 py-3 text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all text-left", !isSidebarExpanded && "justify-center")}>
            <LogOut className="h-4 w-4 shrink-0" />
            {isSidebarExpanded && <span className="text-sm font-medium">Logout</span>}
          </button>
          {isSidebarExpanded && (
            <p className="mt-2 text-center text-xs font-medium text-white/20">
              Ronsberger HMO v1.0
            </p>
          )}
        </div>

        <button onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          className="absolute -right-3 top-20 z-40 hidden h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-white opacity-0 shadow-lg transition duration-200 hover:bg-slate-800 group-hover/sidebar:opacity-100 md:flex">
          {isSidebarExpanded ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden h-full pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0 relative">
        <header className="flex items-center justify-between h-[72px] sm:h-20 px-2 sm:px-4 bg-white border-b border-slate-100 sticky top-0 z-40 w-full shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate(basePath)} className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0 md:hidden">
              <img
                src="/ronsberger-logo.webp"
                alt="Ronsberger HMO"
                className="h-7 w-auto object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </button>
             {/* Divider & Current page name - dynamic from route config */}
             
             <div className="flex flex-col min-w-0">
               <span className="text-sm sm:text-base font-bold text-slate-900 truncate max-w-[140px] sm:max-w-[300px] md:max-w-[450px] tracking-tight">{pageConfig.title}</span>
               <span className="hidden sm:block text-[10px] sm:text-xs text-slate-500 font-medium truncate max-w-[250px] sm:max-w-[500px] md:max-w-[700px] mt-0.5">{pageConfig.description}</span>
             </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:flex flex-col text-right mr-3">
              <p className="text-xs font-semibold text-slate-900 truncate max-w-[140px]">{fullName || "Complete Profile"}</p>
              <p className="text-xs font-medium capitalize text-[#3f3f95]">{role}</p>
            </div>
            <Button variant="ghost" size="icon"
              className={cn("h-8 w-8 rounded-lg relative", actionableMessages > 0 ? "text-[#3f3f95]" : "text-slate-400")}
              aria-label={`Notifications${actionableMessages > 0 ? `, ${actionableMessages} unread` : ""}`}>
              <Bell className="h-4 w-4" />
              {actionableMessages > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#01aef2] text-xs font-bold text-white ring-2 ring-white">
                  {actionableMessages > 9 ? "9+" : actionableMessages}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden h-8 w-8 rounded-lg bg-slate-50 text-slate-600" aria-label="Open navigation menu">
              <Menu className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleSignOut} className="hidden md:flex h-8 w-8 rounded-lg text-slate-400 hover:text-rose-500" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className={cn("app-main flex-1 min-w-0 h-full", location.pathname.includes("/messages") ? "overflow-hidden" : "overflow-x-hidden overflow-y-auto")}>
          <div className={cn("max-w-full h-full", location.pathname.includes("/messages") ? "p-0" : "px-1.5 py-2 sm:p-4 md:p-5")}>
            {children || <Outlet />}
          </div>
        </main>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around pb-[env(safe-area-inset-bottom)] z-50">
          {navigation.slice(0, 4).map((item) => {
            const isActive = isActiveRoute(item.href);
            return (
              <button
                key={item.name}
                onClick={() => navigate(item.href)}
                className={cn(
                  "flex flex-col items-center justify-center w-full py-2 gap-1 transition-colors",
                  isActive ? "text-[#3f3f95]" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <div className="relative">
                  <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                  {(item.badge ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-[#01aef2] text-[8px] font-bold text-white ring-1 ring-white">
                      {(item.badge ?? 0) > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-none">{item.name === 'Dashboard' ? 'Home' : item.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="w-[240px] p-0 border-none bg-slate-900 text-white flex flex-col" style={{ height: "100dvh" }}>
          <div className="p-4 border-b border-white/5 flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-md p-1 overflow-hidden">
              <img src="/ronsberger-logo.webp" alt="Ronsberger HMO Logo" className="h-full w-full object-contain" />
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-sm font-bold tracking-tight text-white whitespace-nowrap leading-tight">
                RONSBERGER <span className="text-[#4d7a22]">HMO</span>
              </p>
              <p className="badge-label text-slate-400 mt-0.5">
                Clinical Workspace
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {navigation.map((item) => {
              const isActive = isActiveRoute(item.href);
              return (
                <SheetClose asChild key={item.name}>
                  <button onClick={() => navigate(item.href)}
                    className={cn("w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-medium transition-all text-left",
                      isActive ? "bg-white text-slate-900 shadow-xl" : "text-slate-400 hover:bg-white/5"
                    )}>
                    <item.icon className={cn("h-4 w-4", isActive ? "text-[#3f3f95]" : "text-slate-500")} />
                    {item.name}
                    {(item.badge ?? 0) > 0 && (
                      <span className="ml-auto min-w-5 rounded-full bg-[#01aef2] px-1.5 py-0.5 text-center text-xs font-semibold text-slate-950">
                        {(item.badge ?? 0) > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </button>
                </SheetClose>
              );
            })}
          </div>

          <div className="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] border-t border-white/5 mt-auto">
            <SheetClose asChild>
              <button onClick={handleSignOut} className="w-full flex items-center gap-4 px-4 py-4 text-rose-400 hover:bg-rose-400/5 rounded-xl text-sm font-medium transition-all">
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
      <LiveChat />
    </div>
  );
}
