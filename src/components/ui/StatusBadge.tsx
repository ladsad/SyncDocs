import React from "react";
import { SaveStatus } from "@/types/document";
import { Check, Loader2, AlertCircle, Clock } from "lucide-react";

interface StatusBadgeProps {
  status: SaveStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case "saved":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full border border-emerald-200">
          <Check className="w-3.5 h-3.5 text-emerald-600" />
          Saved
        </span>
      );
    case "saving":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-full border border-blue-200">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
          Saving...
        </span>
      );
    case "unsaved":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded-full border border-amber-200">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Unsaved changes
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 rounded-full border border-rose-200">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          Save failed
        </span>
      );
  }
}
