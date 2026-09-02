"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Document, DocumentContentType } from "@/types/document";
import {
  fetchDocuments,
  createDocument,
  deleteDocument,
  isSupabaseConfigured,
} from "@/lib/supabase";
import {
  FileText,
  Plus,
  Trash2,
  Database,
  HardDrive,
  Info,
  Clock,
  FileCode,
  FileSpreadsheet,
} from "lucide-react";

export function DocumentList() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const isSupabase = isSupabaseConfigured();

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error("Failed to load documents:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleCreateNew = async (
    contentType: DocumentContentType = "rich_text"
  ) => {
    try {
      setCreating(true);
      const defaultTitle =
        contentType === "rich_text"
          ? "Untitled Rich Text"
          : contentType === "markdown"
          ? "Untitled Markdown"
          : "Untitled Document";

      const newDoc = await createDocument(defaultTitle, contentType);
      router.push(`/documents/${newDoc.id}`);
    } catch (error) {
      console.error("Failed to create document:", error);
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (confirm("Are you sure you want to delete this document?")) {
      try {
        await deleteDocument(id);
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      } catch (error) {
        console.error("Failed to delete document:", error);
      }
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  const getStyleIcon = (type: DocumentContentType) => {
    switch (type) {
      case "rich_text":
        return <FileText className="w-5 h-5 text-blue-600" />;
      case "markdown":
        return <FileCode className="w-5 h-5 text-purple-600" />;
      case "latex":
      case "typst":
        return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
      default:
        return <FileText className="w-5 h-5 text-slate-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              S
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                SyncDocs
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Phase 0 — Single-User Rich Text Editor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Supabase / Local storage status badge */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600 px-3 py-1.5 bg-slate-100 rounded-md border border-slate-200">
              {isSupabase ? (
                <>
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-medium">Supabase Postgres</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-medium">Local Mode (No Supabase Env)</span>
                </>
              )}
            </div>

            <button
              onClick={() => handleCreateNew("rich_text")}
              disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>New Document</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {!isSupabase && (
          <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-3 text-sm text-blue-900">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-0.5">
                Supabase credentials not detected in .env.local
              </p>
              <p className="text-blue-800 text-xs">
                SyncDocs is currently storing documents in local browser storage.
                To save/load to Supabase Postgres, set{" "}
                <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">
                  NEXT_PUBLIC_SUPABASE_URL
                </code>{" "}
                and{" "}
                <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </code>{" "}
                in <code className="font-mono">.env.local</code> and run the migration in{" "}
                <code className="font-mono">supabase/schema.sql</code>.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">All Documents</h2>
          <span className="text-xs text-slate-500">
            {documents.length} {documents.length === 1 ? "document" : "documents"}
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-36 rounded-lg bg-slate-200 animate-pulse border border-slate-300"
              />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center bg-white">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">
              No documents yet
            </h3>
            <p className="text-sm text-slate-500 mb-4 max-w-sm mx-auto">
              Create your first rich text document to start writing.
            </p>
            <button
              onClick={() => handleCreateNew("rich_text")}
              disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create Rich Text Document</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="group p-5 bg-white border border-slate-200 hover:border-blue-400 rounded-xl shadow-sm hover:shadow transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
                      {getStyleIcon(doc.content_type)}
                    </div>
                    <button
                      onClick={(e) => handleDelete(doc.id, e)}
                      title="Delete document"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1 mb-1">
                    {doc.title || "Untitled Document"}
                  </h3>
                  <span className="inline-block text-[11px] font-medium uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    {doc.content_type.replace("_", " ")}
                  </span>
                </div>

                <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Updated {formatTimestamp(doc.updated_at)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
