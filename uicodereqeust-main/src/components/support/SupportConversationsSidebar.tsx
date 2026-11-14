import { BrandSpinner } from "@/components/BrandSpinner";
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
import { Plus, Search, X } from "lucide-react";

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
        "w-full lg:w-[320px] border-r border-slate-200/80 bg-white flex flex-col h-full shrink-0 transition-all duration-300",
        mobileSubView === "LIST" ? "flex" : "hidden lg:flex",
        leftCollapsed ? "lg:w-0 lg:overflow-hidden lg:border-r-0" : "lg:w-[320px]"
      )}
    >
      {/* Inbox Header & Search */}
      <div className="p-3 border-b border-slate-100 flex flex-col gap-2 bg-white shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-slate-800 mb-1 mt-1">Conversations</h2>
          <div className="flex items-center gap-1">
            <Button size="sm" className="h-10 rounded-lg bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-primary/90" onClick={onNewTicketClick}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New
            </Button>
            <Button variant="ghost" size="icon" className="hidden lg:flex h-7 w-7 rounded text-slate-400" onClick={() => setLeftCollapsed(true)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search auth or subject..." className="h-10 rounded-lg border-slate-200 bg-white pl-9 text-sm font-medium" />
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
            <BrandSpinner className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-slate-400">
            No conversations in queue
          </div>
        ) : (
          filteredConversations.map((item) => {
            const name = item.hospitals?.name || "HMO Admin Board";
            const isSelected = selected?.id === item.id;

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
                <div className="flex flex-col gap-1.5 py-0.5">
                  {/* Top Row: Full Subject + Date */}
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="font-semibold text-slate-900 text-xs truncate flex-1 leading-snug"
                      title={item.subject || "Request Support"}
                    >
                      {item.subject || "Request Support"}
                    </span>
                    <span className="text-slate-400 font-normal shrink-0 text-[10px] whitespace-nowrap pt-0.5">
                      {item.last_message_at
                        ? new Date(item.last_message_at).toLocaleDateString([], { day: "numeric", month: "short" })
                        : new Date(item.created_at).toLocaleDateString([], { day: "numeric", month: "short" })}
                    </span>
                  </div>

                  {/* Bottom Row: Status Badge + Hospital Name + Priority */}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 overflow-hidden">
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0",
                        item.status === "closed" || item.status === "resolved"
                          ? "bg-slate-100 text-slate-600"
                          : item.status === "pending" || item.status?.includes("pending")
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      )}
                    >
                      {(item.status || "open").replace(/_/g, " ")}
                    </span>
                    <span className="text-slate-300 shrink-0">•</span>
                    <span className="font-medium text-slate-600 truncate flex-1" title={name}>
                      {name}
                    </span>
                    {item.priority && (
                      <>
                        <span className="text-slate-300 shrink-0">•</span>
                        <span
                          className={cn(
                            "font-bold capitalize shrink-0 text-[10px]",
                            item.priority === "urgent" || item.priority === "high"
                              ? "text-rose-600 font-black"
                              : "text-slate-500"
                          )}
                        >
                          {item.priority}
                        </span>
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
