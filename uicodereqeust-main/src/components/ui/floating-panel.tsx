import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type FloatingPanelProps = {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  children: React.ReactNode;
  className?: string;
  offset?: number;
  minWidth?: number;
  maxHeight?: number;
  onEscapeKeyDown?: () => void;
};

type FloatingPanelStyle = React.CSSProperties & {
  "--floating-panel-max-height"?: string;
};

export function FloatingPanel({
  anchorRef,
  open,
  children,
  className,
  offset = 6,
  minWidth = 180,
  maxHeight = 500,
  onEscapeKeyDown,
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<FloatingPanelStyle>({ visibility: "hidden" });
  // Portal into the nearest open Radix dialog so Radix's DismissableLayer
  // does NOT treat clicks on our panel as "outside" clicks.
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 8;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const placeAbove = availableBelow < 180 && availableAbove > availableBelow;
    const availableHeight = Math.max(
      120,
      Math.min(maxHeight, placeAbove ? availableAbove - offset : availableBelow - offset),
    );
    const width = Math.max(rect.width, minWidth);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    );

    setStyle({
      position: "fixed",
      top: Math.round(placeAbove ? Math.max(viewportPadding, rect.top - availableHeight - offset) : rect.bottom + offset),
      left: Math.round(left),
      width: Math.round(width),
      maxHeight: `${Math.round(availableHeight)}px`,
      "--floating-panel-max-height": `${Math.round(availableHeight)}px`,
      visibility: "visible",
      zIndex: 2147483640,
      transformOrigin: placeAbove ? "bottom center" : "top center",
    });
  }, [anchorRef, maxHeight, minWidth, offset]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Resolve the portal target once when the panel opens.
  // Prefer the nearest [role="dialog"] so our panel lives inside Radix's layer tree.
  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const dialog = anchor?.closest('[role="dialog"]') ?? null;
    setPortalTarget(dialog ?? document.body);
  }, [open, anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [children, open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscapeKeyDown?.();
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onEscapeKeyDown, open, updatePosition]);

  if (!mounted || !open || !portalTarget) return null;

  return createPortal(
    <div
      ref={panelRef}
      // preventDefault keeps the search input focused while clicking a result.
      // Both onPointerDown and onMouseDown are needed to cover all browsers/Radix phases.
      onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      className={cn(
        "flex flex-col overflow-y-auto overscroll-contain rounded-xl border border-slate-100 bg-white text-popover-foreground shadow-2xl outline-none animate-in fade-in-0 zoom-in-95 duration-100 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent",
        className,
      )}
      role="listbox"
      style={style}
    >
      {children}
    </div>,
    portalTarget,
  );
}
