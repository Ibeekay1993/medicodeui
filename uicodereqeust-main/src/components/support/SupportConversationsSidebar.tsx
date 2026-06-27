import { } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Search, X } from "lucide-react";

interface SupportConversationsSidebarProps {
  filteredConversations: any[];
  selected: any | null;
  setSelected: (conv: any) => void;
  loading: boolean;
  role: string | null;
  isInternal: boolean;
  search: string;
  setSearch: (s: string) => void;
  categoryFilter: string;
  setCategoryFilter: (c: string) => void;
  filter: string;
  setFilter: (f: string) => void;
  leftCollapsed: boolean;
  setLeftCollapsed: (c: boolean) => void;
  onNewTicketClick: () => void;
  setMobileSubView: (v: string) => void;
  mobileSubView: string;
}

export function SupportConversationsSidebar({
  filteredConversations,
  selected,
  setSelected,
  loading,
  role: _role,
  isInternal,
  search,
  setSearch,
  categoryFilter,
  setCategoryFilter,
  filter,
  setFilter,
  leftCollapsed,
  setLeftCollapsed,
  onNewTicketClick,
  setMobileSubView,
  mobileSubView,
}: SupportConversationsSidebarProps) {


  return (
    <div
      className={cn(
        "w-full lg:w-[280px] border-r border-slate-200/80 bg-white flex flex-col h-full shrink-0 transition-all duration-300",
        mobileSubView === "LIST" ? "flex" : "hidden lg:flex",
        leftCollapsed ? "lg:w-0 lg:overflow-hidden lg:border-r-0" : "lg:w-[280px]"
      )}
    >
      {/* Inbox Header & Search */}
      <div className="p-3 border-b border-slate-150 flex flex-col gap-2 bg-white shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-slate-800 mb-1 mt-1">Conversations</h2>
          <div className="flex items-center gap-1">
            <Button size="sm" className="h-7 rounded text-xs font-bold bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 px-3 shadow-md shadow-indigo-500/20 text-white ring-1 ring-white/20 inset transition-all active:scale-95" onClick={onNewTicketClick}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New
            </Button>
            <Button variant="ghost" size="icon" className="hidden lg:flex h-7 w-7 rounded text-slate-400" onClick={() => setLeftCollapsed(true)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search auth or subject..." className="h-10 rounded-md bg-slate-50 pl-8 text-xs font-medium border-slate-200" />
        </div>
      </div>

      {/* Category Filter Dropdown */}
      <div className="px-4 py-2.5 border-b border-slate-100 bg-white">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-full rounded-xl bg-slate-50 border-none text-xs font-semibold text-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-sm font-medium">
              All Categories
            </SelectItem>
            <SelectItem value="request" className="text-sm font-medium">
              Auth Request
            </SelectItem>
            <SelectItem value="claim" className="text-sm font-medium">
              Hospital Claim
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pill Filter Tabs */}
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-1.5 overflow-x-auto shrink-0 select-none">
        {[
          { id: "all", label: "All" },
          { id: "open", label: "Open" },
          { id: "pending", label: "Pending" },
          { id: "closed", label: "Closed" },
          ...(isInternal ? [{ id: "mine", label: "My Work" }] : []),
        ].map((tab) => {
          const isActive = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all border border-transparent",
                isActive
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white text-slate-500 hover:text-slate-700 border-slate-200"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Dynamic Inbox Scroll Viewport */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-slate-400">
            No conversations in queue
          </div>
        ) : (
          filteredConversations.map((item) => {
            const name = item.hospitals?.name || "HMO Admin Board";
            const isSelected = selected?.id === item.id;
            const previewMessage =
              !isInternal && String(item.last_message || "").includes("Internal note")
                ? "Awaiting internal review..."
                : item.last_message;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelected(item);
                  setMobileSubView("CHAT");
                }}
                className={cn(
                  "block w-full p-3 text-left transition-all border-l-4 border-b border-slate-100",
                  isSelected ? "bg-indigo-50 border-indigo-400" : "border-transparent hover:bg-slate-50"
                )}
              >
                <div className="flex flex-col gap-1">
                  {/* Top Row: Subject ● Status ● Date */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-slate-900 truncate max-w-[140px]">{item.subject || "Request Support"}</span>
                    <span className="text-slate-300 shrink-0">•</span>
                    <span className={cn("font-bold uppercase tracking-wider text-[10px] shrink-0", item.status === "closed" || item.status === "resolved" ? "text-slate-500" : "text-indigo-600")}>
                      {(item.status || "open").replace(/_/g, " ")}
                    </span>
                    <span className="text-slate-300 shrink-0">•</span>
                    <span className="text-slate-500 font-medium whitespace-nowrap shrink-0 text-[10px]">
                      {item.last_message_at ? new Date(item.last_message_at).toLocaleDateString([], { day: "numeric", month: "short" }) : new Date(item.created_at).toLocaleDateString([], { day: "numeric", month: "short" })}
                    </span>
                  </div>

                  {/* Bottom Row: Hospital ● Priority */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-medium truncate">{name}</span>
                    {item.priority && (
                      <>
                        <span className="text-slate-300 shrink-0">•</span>
                        <span className={cn("font-bold capitalize shrink-0", item.priority === "urgent" || item.priority === "high" ? "text-rose-600" : "")}>{item.priority}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
