"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import * as Y from "yjs";
import { Document, SaveStatus } from "@/types/document";
import { updateDocument, isSupabaseConfigured, supabase } from "@/lib/supabase";
import { RichTextEditor } from "./RichTextEditor";
import { StatusBadge } from "../ui/StatusBadge";
import { SupabaseYjsProvider } from "@/lib/sync/supabase-provider";
import { getRandomUserPresence } from "@/lib/sync/user-presence";
import {
  ArrowLeft,
  Save,
  Database,
  HardDrive,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

interface EditorContainerProps {
  initialDocument: Document;
}

interface CollaboratorInfo {
  clientId: number;
  name: string;
  color: string;
}

export function EditorContainer({ initialDocument }: EditorContainerProps) {
  const [doc, setDoc] = useState<Document>(initialDocument);
  const [title, setTitle] = useState(initialDocument.title);
  const [content, setContent] = useState(initialDocument.content);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([]);
  const [isSyncConnected, setIsSyncConnected] = useState(false);

  const [currentUser] = useState(() => getRandomUserPresence());
  const [provider, setProvider] = useState<SupabaseYjsProvider | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);
  const isSupabase = isSupabaseConfigured();

  // Initialize Yjs Document and Supabase Provider
  useEffect(() => {
    const ydoc = new Y.Doc();
    const yProvider = new SupabaseYjsProvider(supabase, doc.id, ydoc);
    setProvider(yProvider);

    // Set local awareness presence
    yProvider.awareness.setLocalStateField("user", currentUser);

    const unsubscribeStatus = yProvider.onStatus(({ connected }) => {
      setIsSyncConnected(connected);
    });

    const updateCollaborators = () => {
      const states = yProvider.awareness.getStates();
      const active: CollaboratorInfo[] = [];

      states.forEach((state: any, clientId: number) => {
        if (state?.user) {
          active.push({
            clientId,
            name: state.user.name || "Collaborator",
            color: state.user.color || "#3b82f6",
          });
        }
      });
      setCollaborators(active);
    };

    yProvider.awareness.on("change", updateCollaborators);
    updateCollaborators();

    return () => {
      unsubscribeStatus();
      yProvider.awareness.off("change", updateCollaborators);
      yProvider.destroy();
    };
  }, [doc.id, currentUser]);

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
            provider={provider}
            userPresence={currentUser}
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
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
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
            {/* Live Sync Status & Active Collaborators */}
            {isSupabase && (
              <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <div
                  className="flex items-center gap-1 font-medium"
                  title={isSyncConnected ? "Realtime sync connected" : "Connecting to sync room..."}
                >
                  {isSyncConnected ? (
                    <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                  )}
                  <span className="hidden md:inline">
                    {isSyncConnected ? "Live Sync" : "Connecting..."}
                  </span>
                </div>

                <div className="w-px h-3.5 bg-slate-300" />

                {/* Collaborator Avatars */}
                <div className="flex items-center gap-1" title={`${collaborators.length} active in room`}>
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-semibold text-slate-700">{collaborators.length}</span>
                  <div className="hidden sm:flex items-center -space-x-1.5 ml-1">
                    {collaborators.map((c) => (
                      <span
                        key={c.clientId}
                        style={{ backgroundColor: c.color }}
                        className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center border-2 border-white uppercase shadow-sm"
                        title={c.name}
                      >
                        {c.name.replace("Guest ", "").charAt(0)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Storage Mode indicator */}
            <div
              className="hidden lg:flex items-center gap-1 text-xs text-slate-500 px-2 py-1 bg-slate-100 rounded"
              title={
                isSupabase
                  ? "Connected to Supabase Postgres"
                  : "Using Local Storage"
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
