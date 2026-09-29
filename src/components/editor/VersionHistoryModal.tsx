"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  History,
  RotateCcw,
  Plus,
  Clock,
  User,
  ShieldCheck,
  Check,
  Loader2,
  FileText,
} from "lucide-react";
import { Document, DocumentSnapshot } from "@/types/document";
import {
  fetchDocumentSnapshots,
  createDocumentSnapshot,
  restoreDocumentSnapshot,
} from "@/lib/supabase";
import { tiptapToPlainText } from "@/lib/export/document-exporter";

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document;
  onRestored: (newContent: any) => void;
}

export function VersionHistoryModal({
  isOpen,
  onClose,
  document: doc,
  onRestored,
}: VersionHistoryModalProps) {
  const [snapshots, setSnapshots] = useState<DocumentSnapshot[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<DocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [newCheckpointName, setNewCheckpointName] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSnapshots();
    }
  }, [isOpen, doc.id]);

  const loadSnapshots = async () => {
    setLoading(true);
    try {
      const list = await fetchDocumentSnapshots(doc.id);
      setSnapshots(list);
      if (list.length > 0 && !selectedSnapshot) {
        setSelectedSnapshot(list[0]);
      }
    } catch (err) {
      console.error("Failed to load snapshots:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const snap = await createDocumentSnapshot(doc.id, newCheckpointName.trim() || undefined);
      if (snap) {
        setSnapshots((prev) => [snap, ...prev]);
        setSelectedSnapshot(snap);
        setNewCheckpointName("");
        setStatusMessage("Checkpoint saved");
        setTimeout(() => setStatusMessage(null), 2500);
      }
    } catch (err) {
      console.error("Failed to create snapshot:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (snap: DocumentSnapshot) => {
    if (restoring) return;
    const confirmed = window.confirm(
      `Revert document to "${snap.name || "Snapshot"}"? Current unsaved work will be overwritten.`
    );
    if (!confirmed) return;

    setRestoring(true);
    try {
      const updated = await restoreDocumentSnapshot(doc.id, snap);
      if (updated) {
        onRestored(updated.content);
        setStatusMessage("Restored successfully");
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err) {
      console.error("Failed to restore snapshot:", err);
    } finally {
      setRestoring(false);
    }
  };

  if (!isOpen) return null;

  const renderSnapshotPreview = (snap: DocumentSnapshot) => {
    if (!snap.content) {
      return (
        <div className="p-8 text-center font-mono text-xs text-ink-muted">
          EMPTY SNAPSHOT CONTENT
        </div>
      );
    }

    if (doc.content_type === "rich_text") {
      const previewText = tiptapToPlainText(snap.content);
      return (
        <pre className="font-mono text-xs text-ink p-4 whitespace-pre-wrap leading-relaxed">
          {previewText || "(Empty Document)"}
        </pre>
      );
    }

    const textContent = typeof snap.content === "string" ? snap.content : "";
    return (
      <pre className="font-mono text-xs text-ink p-4 whitespace-pre-wrap leading-relaxed">
        {textContent || "(Empty Document)"}
      </pre>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-[2px]">
      <div className="bg-canvas-surface border border-border rounded-xs w-full max-w-4xl h-[620px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-canvas-subtle shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-sage rounded-xs" />
            <h3 className="font-mono text-xs font-bold uppercase text-ink tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              <span>VERSION HISTORY &bull; ZERO-KNOWLEDGE SNAPSHOTS</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-ink-muted hover:text-ink hover:bg-canvas-neutral rounded-xs transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Split: Left (Checkpoints List) / Right (Preview & Restore) */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left: Snapshots List */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-border bg-canvas-subtle/50 flex flex-col shrink-0">
            {/* Create Checkpoint bar */}
            <form
              onSubmit={handleCreateCheckpoint}
              className="p-3 border-b border-border flex items-center gap-2 bg-canvas-surface"
            >
              <input
                type="text"
                value={newCheckpointName}
                onChange={(e) => setNewCheckpointName(e.target.value)}
                placeholder="Checkpoint name..."
                className="flex-1 text-xs font-mono bg-canvas-DEFAULT border border-border px-2.5 py-1.5 rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-sage"
              />
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-mono font-medium text-canvas-DEFAULT bg-sage hover:bg-sage-hover border border-sage rounded-xs transition-colors disabled:opacity-50 shrink-0"
                title="Create a new snapshot checkpoint"
              >
                {creating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>SAVE</span>
              </button>
            </form>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/60">
              {loading ? (
                <div className="p-8 text-center font-mono text-xs text-ink-muted flex items-center justify-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>DECRYPTING SNAPSHOTS...</span>
                </div>
              ) : snapshots.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <Clock className="w-6 h-6 text-ink-muted mx-auto stroke-1" />
                  <p className="font-mono text-xs text-ink-secondary">NO SAVED CHECKPOINTS</p>
                  <p className="font-mono text-[11px] text-ink-muted">
                    Save a checkpoint above to preserve a rollback point.
                  </p>
                </div>
              ) : (
                snapshots.map((snap) => {
                  const isSelected = selectedSnapshot?.id === snap.id;
                  const date = new Date(snap.created_at);
                  return (
                    <button
                      key={snap.id}
                      type="button"
                      onClick={() => setSelectedSnapshot(snap)}
                      className={`w-full text-left p-3.5 transition-colors flex flex-col gap-1 ${
                        isSelected
                          ? "bg-canvas-DEFAULT border-l-2 border-l-sage text-ink"
                          : "hover:bg-canvas-DEFAULT/60 text-ink-secondary"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-ink truncate">
                          {snap.name || "Snapshot"}
                        </span>
                        <span className="font-mono text-[10px] text-ink-muted">
                          {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px] text-ink-muted">
                        <User className="w-3 h-3" />
                        <span className="truncate">{snap.created_by || "Unknown"}</span>
                        <span>&bull;</span>
                        <span>{date.toLocaleDateString()}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Snapshot Preview & Revert Action */}
          <div className="flex-1 flex flex-col min-h-0 bg-canvas-DEFAULT">
            {selectedSnapshot ? (
              <>
                <div className="px-5 py-3 border-b border-border bg-canvas-surface flex items-center justify-between gap-3 shrink-0">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-ink">
                        {selectedSnapshot.name || "Snapshot"}
                      </span>
                      <span className="font-mono text-[10px] text-ink-muted bg-canvas-subtle border border-border px-1.5 py-0.5 rounded-xs">
                        {new Date(selectedSnapshot.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-ink-secondary">
                      Created by {selectedSnapshot.created_by || "Anonymous"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRestore(selectedSnapshot)}
                    disabled={restoring}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono font-medium text-canvas-DEFAULT bg-sage hover:bg-sage-hover border border-sage rounded-xs transition-colors disabled:opacity-50"
                  >
                    {restoring ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>RESTORE VERSION</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto bg-canvas-DEFAULT">
                  {renderSnapshotPreview(selectedSnapshot)}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2">
                <FileText className="w-8 h-8 text-ink-muted stroke-1" />
                <p className="font-mono text-xs text-ink-secondary">
                  SELECT A CHECKPOINT TO PREVIEW
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-canvas-subtle border-t border-border flex items-center justify-between text-ink-secondary shrink-0 font-mono text-[11px]">
          <div className="flex items-center gap-1.5 text-status-success">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Encrypted with document key before persistence</span>
          </div>
          {statusMessage && (
            <span className="text-sage font-bold flex items-center gap-1">
              <Check className="w-3 h-3" />
              {statusMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
