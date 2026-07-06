import { Bell, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface BellLinkProps {
  count: number;
  isInternal: boolean;
  onNavigate: () => void;
}

/**
 * Header bell with a live unread badge. Clicking it jumps into the Messages
 * inbox (filtered by queue when relevant) so staff never see an unread badge
 * they cannot act on. The tooltip names the queue and explains hospital vs
 * internal semantics.
 */
export function BellLink({ count, isInternal, onNavigate }: BellLinkProps) {
  const label = isInternal ? "Open my support queue" : "Open support conversations";
  const detail = isInternal
    ? count > 0
      ? `${count} message${count === 1 ? "" : "s"} need your attention. Click to open the queue.`
      : "No unread messages. Click to open the support inbox."
    : count > 0
    ? `${count} message${count === 1 ? "" : "s"} are waiting for a reply. Click to open the inbox.`
    : "Click to open your support conversations.";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onNavigate}
            className={cn(
              "h-8 w-8 rounded-lg relative transition-colors",
              count > 0 ? "text-brand-700" : "text-slate-400 hover:text-slate-600"
            )}
            aria-label={`${label}${count > 0 ? `, ${count} unread` : ""}`}
          >
            {count > 0 ? <Inbox className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-xs font-black text-white ring-2 ring-white">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-[240px] text-xs">
          <p className="font-semibold text-slate-900">{label}</p>
          <p className="mt-0.5 text-slate-500">{detail}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
