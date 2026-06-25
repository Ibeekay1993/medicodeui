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
        "w-full lg:w-[340px] border-r border-slate-200/80 bg-white flex flex-col h-full shrink-0 transition-all duration-300",
        mobileSubView === "LIST" ? "flex" : "hidden lg:flex",
        leftCollapsed ? "lg:w-0 lg:overflow-hidden lg:border-r-0" : "lg:w-[340px]"
      )}
    >
      {/* Inbox Header */}
      <div className="p-4 border-b border-slate-150 flex items-center justify-end bg-white">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            className="h-8 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white hover:bg-brand-700 shadow-sm"
            onClick={onNewTicketClick}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> New
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex h-8 w-8 rounded-xl text-slate-400 shrink-0"
            onClick={() => setLeftCollapsed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search Input bar */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search policy no., auth code or subject..."
            className="h-10 rounded-xl border-none bg-slate-50 pl-9 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus-visible:ring-brand-500/20"
          />
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
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
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
                  "block w-full p-4 text-left transition-all border-l-4 border-b border-slate-100",
                  isSelected ? "bg-brand-50 border-brand-400" : "border-transparent hover:bg-slate-50"
                )}
              >
                <div className="flex flex-col gap-2">
                  {/* Top Row: Ticket Number & Status Badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-500">
                      {item.ticket_number || "TCK-PENDING"}
                    </span>
                    <span
                      className={cn(
                        "rounded-md text-xs font-semibold uppercase px-2.5 py-1 tracking-wide border",
                        item.status === "new"
                          ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                          : ["open", "reopened"].includes(item.status)
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : item.status?.includes("pending")
                          ? "bg-amber-50 text-amber-700 border-amber-100"
                          : ["closed", "resolved"].includes(item.status)
                          ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                          : "bg-slate-50 text-slate-500 border-slate-200"
                      )}
                    >
                      {(item.status || "").replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight leading-snug">
                    {item.subject || "Dispute request"}
                  </h3>

                  {/* Hospital Name */}
                  <p className="text-sm text-slate-600">
                    Hospital: <span className="font-semibold text-slate-800">{name}</span>
                  </p>

                  {/* Department / Priority */}
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold uppercase text-slate-600 tracking-wide">
                      {item.department || "GENERAL"}
                    </span>
                    {item.priority && (
                      <span
                        className={cn(
                          "rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide border",
                          item.priority === "urgent"
                            ? "text-rose-700 bg-rose-50 border-rose-200"
                            : item.priority === "high"
                            ? "text-amber-700 bg-amber-50 border-amber-200"
                            : "text-slate-600 bg-white border-slate-200"
                        )}
                      >
                        {item.priority}
                      </span>
                    )}
                  </div>

                  {/* Preview Snippet */}
                  <p className="line-clamp-2 text-sm leading-relaxed text-slate-500">
                    {previewMessage || "Awaiting welcome check..."}
                  </p>

                  {/* Date/Time stamp */}
                  <div className="text-xs font-medium text-slate-400">
                    {item.last_message_at
                      ? new Date(item.last_message_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        }) +
                        ", " +
                        new Date(item.last_message_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : new Date(item.created_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        }) +
                        ", " +
                        new Date(item.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
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
