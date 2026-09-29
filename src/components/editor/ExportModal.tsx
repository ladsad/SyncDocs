"use client";

import React, { useState } from "react";
import { X, Download, FileText, Check, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { Document, DocumentContentType } from "@/types/document";
import {
  getExportOptionsForType,
  tiptapToMarkdown,
  tiptapToHTML,
  tiptapToPlainText,
  buildHTMLDocument,
  generateClientPDF,
  triggerFileDownload,
  ExportOption,
} from "@/lib/export/document-exporter";
import { marked } from "marked";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document;
}

export function ExportModal({ isOpen, onClose, document: doc }: ExportModalProps) {
  const options = getExportOptionsForType(doc.content_type);
  const [selectedOptionId, setSelectedOptionId] = useState<string>(options[0]?.id || "txt");
  const [exporting, setExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen) return null;

  const selectedOption = options.find((o) => o.id === selectedOptionId) || options[0];

  const handleExport = async () => {
    setExporting(true);
    setDownloadSuccess(false);

    try {
      const baseFilename = (doc.title || "Untitled Document")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_");
      const filename = `${baseFilename}.${selectedOption.extension}`;

      let blob: Blob;

      if (doc.content_type === "rich_text") {
        if (selectedOption.id === "markdown") {
          const md = tiptapToMarkdown(doc.content);
          blob = new Blob([md], { type: selectedOption.mimeType });
        } else if (selectedOption.id === "html") {
          const html = tiptapToHTML(doc.content, doc.title || "Untitled Document");
          blob = new Blob([html], { type: selectedOption.mimeType });
        } else if (selectedOption.id === "txt") {
          const txt = tiptapToPlainText(doc.content);
          blob = new Blob([txt], { type: selectedOption.mimeType });
        } else if (selectedOption.id === "pdf") {
          const md = tiptapToMarkdown(doc.content);
          const pdfBytes = await generateClientPDF(doc.title || "Untitled Document", md);
          blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
        } else {
          blob = new Blob([JSON.stringify(doc.content, null, 2)], { type: "text/plain" });
        }
      } else if (doc.content_type === "markdown") {
        const rawMd = typeof doc.content === "string" ? doc.content : "";
        if (selectedOption.id === "markdown") {
          blob = new Blob([rawMd], { type: selectedOption.mimeType });
        } else if (selectedOption.id === "html") {
          const parsed = marked.parse(rawMd, { async: false }) as string;
          const fullHtml = buildHTMLDocument(doc.title || "Untitled Document", parsed);
          blob = new Blob([fullHtml], { type: selectedOption.mimeType });
        } else if (selectedOption.id === "pdf") {
          const pdfBytes = await generateClientPDF(doc.title || "Untitled Document", rawMd);
          blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
        } else {
          blob = new Blob([rawMd], { type: "text/plain" });
        }
      } else if (doc.content_type === "latex") {
        const rawTex = typeof doc.content === "string" ? doc.content : "";
        if (selectedOption.id === "pdf") {
          // Client-side quick preview PDF
          const pdfBytes = await generateClientPDF(doc.title || "Untitled Document", rawTex);
          blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
        } else {
          blob = new Blob([rawTex], { type: selectedOption.mimeType });
        }
      } else {
        blob = new Blob([String(doc.content || "")], { type: "text/plain" });
      }

      triggerFileDownload(blob, filename);
      setDownloadSuccess(true);
      setTimeout(() => {
        setDownloadSuccess(false);
      }, 3000);
    } catch (err) {
      console.error("Client export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-[2px]">
      <div className="bg-canvas-surface border border-border rounded-xs w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-canvas-subtle">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-sage rounded-xs" />
            <h3 className="font-mono text-xs font-bold uppercase text-ink tracking-wider">
              EXPORT DOCUMENT &bull; CLIENT-SIDE
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-ink-muted hover:text-ink hover:bg-canvas-neutral rounded-xs transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="p-3 bg-canvas-subtle border border-border rounded-xs space-y-1">
            <div className="flex items-center gap-1.5 text-status-success font-mono text-[10px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="font-bold">ZERO-KNOWLEDGE PRIVACY</span>
            </div>
            <p className="font-mono text-[11px] text-ink-secondary">
              Conversion is executed completely in your browser. Document content never touches a server.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase text-ink-muted tracking-wider block">
              SELECT EXPORT FORMAT
            </label>
            <div className="space-y-1.5">
              {options.map((opt) => {
                const isSelected = opt.id === selectedOptionId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedOptionId(opt.id)}
                    className={`w-full p-2.5 rounded-xs border text-left flex items-start justify-between transition-colors ${
                      isSelected
                        ? "bg-sage-soft border-sage text-ink"
                        : "bg-canvas-DEFAULT border-border text-ink hover:bg-canvas-subtle"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold uppercase">
                          .{opt.extension.toUpperCase()}
                        </span>
                        <span className="text-xs font-medium text-ink">
                          {opt.name}
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-ink-secondary">
                        {opt.description}
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-sage shrink-0 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-canvas-subtle border-t border-border flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-ink-muted">
            OUTPUT: .{selectedOption.extension}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-mono text-ink-secondary hover:text-ink border border-transparent rounded-xs transition-colors"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono font-medium text-canvas-DEFAULT bg-sage hover:bg-sage-hover border border-sage rounded-xs transition-colors disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : downloadSuccess ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{exporting ? "GENERATING..." : downloadSuccess ? "DOWNLOADED" : "DOWNLOAD"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
