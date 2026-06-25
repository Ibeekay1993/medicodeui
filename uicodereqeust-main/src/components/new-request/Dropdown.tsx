import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface DropdownProps {
  anchorRef: React.RefObject<HTMLDivElement>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Dropdown({
  anchorRef,
  open,
  onClose,
  children
}: DropdownProps) {
  const [pos, setPos] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const calc = () => {
      const r = anchorRef.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const maxH = Math.min(below > 260 ? below - 16 : r.top - 16, 300);
      setPos(
        below > 260
          ? { top: r.bottom + 4, left: r.left, width: r.width, maxHeight: maxH }
          : { bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width, maxHeight: maxH }
      );
    };
    calc();
    window.addEventListener("scroll", calc, true);
    window.addEventListener("resize", calc);
    return () => {
      window.removeEventListener("scroll", calc, true);
      window.removeEventListener("resize", calc);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      const h = (e: MouseEvent) => {
        if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) onClose();
      };
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, 80);
    return () => clearTimeout(id);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      style={{ position: "fixed", zIndex: 99999, ...pos }}
      className="bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-y-auto overscroll-contain"
    >
      {children}
    </div>,
    document.body
  );
}
