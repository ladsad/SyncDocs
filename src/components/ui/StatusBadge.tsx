import React from "react";
import { SaveStatus } from "@/types/document";

interface StatusBadgeProps {
  status: SaveStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case "saved":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-medium text-status-success bg-canvas-subtle border border-border rounded-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
          SAVED
        </span>
      );
    case "saving":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-medium text-sage-hover bg-canvas-subtle border border-sage/40 rounded-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse" />
          SAVING...
        </span>
      );
    case "unsaved":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-medium text-status-warning bg-canvas-subtle border border-status-warning/40 rounded-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-status-warning" />
          UNSAVED
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-medium text-status-danger bg-canvas-subtle border border-status-danger/40 rounded-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-status-danger" />
          SAVE ERROR
        </span>
      );
  }
}

