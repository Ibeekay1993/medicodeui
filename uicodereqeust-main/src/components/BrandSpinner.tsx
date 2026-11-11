import { cn } from "@/lib/utils";

interface BrandSpinnerProps {
  className?: string;
  label?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

/** One branded loading mark used across page, section, and action loading states. */
export function BrandSpinner({ className, label, ...props }: BrandSpinnerProps) {
  const classes = className?.split(/\s+/).filter((name) => name && name !== "animate-spin").join(" ");

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", classes)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : props["aria-hidden"] ?? true}
    >
      <img
        src="/ronsberger-logo.webp"
        alt=""
        className="h-[62%] w-[62%] object-contain"
        draggable={false}
      />
      <span
        className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-r-[#0EA5E9] border-t-[#0F6E56]"
        aria-hidden="true"
      />
    </span>
  );
}
