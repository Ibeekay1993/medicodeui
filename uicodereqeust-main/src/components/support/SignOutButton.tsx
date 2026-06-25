import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SignOutButtonProps {
  onClick: () => void;
}

/**
 * Sign-out control with an explanatory tooltip. The previous markup collapsed
 * the tooltip intent, so we move the label into a TooltipProvider.
 */
export function SignOutButton({ onClick }: SignOutButtonProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClick}
            className="hidden md:flex h-8 w-8 rounded-lg text-slate-400 hover:text-rose-500"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="text-xs">
          <p className="font-semibold text-slate-900">Sign out</p>
          <p className="mt-0.5 text-slate-500">End your session on this device.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
