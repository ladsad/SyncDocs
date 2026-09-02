"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Document, SaveStatus } from "@/types/document";
import { updateDocument, isSupabaseConfigured } from "@/lib/supabase";
import { RichTextEditor } from "./RichTextEditor";
import { StatusBadge } from "../ui/StatusBadge";
import { ArrowLeft, Save, Database, HardDrive } from "lucide-react";

interface EditorContainerProps {
  initialDocument: Document;
}

export function EditorContainer({ initialDocument }: EditorContainerProps) {
  const [doc, setDoc] = useState<Document>(initialDocument);
  const [title, setTitle] = useState(initialDocument.title);
  const [content, setContent] = useState(initialDocument.content);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);

  const isSupabase = isSupabaseConfigured();

  const performSave = useCallback(
    async (newTitle: string, newContent: any) => {
      setSaveStatus("saving");
      try {
        const updated = await updateDocument(doc.id, {
          title: newTitle,
          content: newContent,
        });
        if (updated) {
          setDoc(updated);
          setSaveStatus("saved");
        } else {
          setSaveStatus("error");
        }
      } catch (err) {
        console.error("Failed to save document:", err);
        setSaveStatus("error");
      }
    },
    [doc.id]
  );

  // Trigger auto-save debounce on title or content change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    setSaveStatus("unsaved");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      performSave(title, content);
    }, 1200);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, content, performSave]);

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        performSave(title, content);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [title, content, performSave]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  const handleContentChange = (newContent: any) => {
    setContent(newContent);
  };

  const handleManualSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    performSave(title, content);
  };

  // Section 6: Content-type routing layer
  const renderEditorSurface = () => {
    switch (doc.content_type) {
      case "rich_text":
      default:
        return (
          <RichTextEditor
            initialContent={content}
            onChange={handleContentChange}
          />
        );
      case "markdown":
        return (
          <div className="p-8 border border-slate-200 rounded-lg bg-white text-center text-slate-500">
            Markdown editor surface will be enabled in future phases.
          </div>
        );
      case "latex":
        return (
          <div className="p-8 border border-slate-200 rounded-lg bg-white text-center text-slate-500">
            LaTeX editor surface will be enabled in future phases.
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link
              href="/"
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Back to all documents"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled Document"
              className="font-semibold text-lg text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white px-2 py-0.5 rounded-md focus:outline-none w-full max-w-md transition-colors"
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Storage Mode indicator */}
            <div
              className="hidden sm:flex items-center gap-1 text-xs text-slate-500 px-2 py-1 bg-slate-100 rounded"
              title={
                isSupabase
                  ? "Connected to Supabase Postgres"
                  : "Using Local Storage (Configure Supabase in .env.local to persist remotely)"
              }
            >
              {isSupabase ? (
                <>
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Supabase</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-3.5 h-3.5 text-amber-600" />
                  <span>Local Mode</span>
                </>
              )}
            </div>

            <StatusBadge status={saveStatus} />

            <button
              onClick={handleManualSave}
              disabled={saveStatus === "saving"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">Save</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Editing Surface */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
        {renderEditorSurface()}
      </main>
    </div>
  );
}
