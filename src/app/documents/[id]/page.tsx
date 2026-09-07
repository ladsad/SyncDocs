"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Document } from "@/types/document";
import { fetchDocumentById } from "@/lib/supabase";
import { EditorContainer } from "@/components/editor/EditorContainer";
import Link from "next/link";
import { ArrowLeft, Loader2, FileQuestion } from "lucide-react";

export default function DocumentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        const data = await fetchDocumentById(id);
        if (isMounted) {
          if (!data) {
            setError("Document not found");
          } else {
            setDoc(data);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load document");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-4 selection:bg-sage-soft">
        <Loader2 className="w-6 h-6 animate-spin text-sage mb-3" />
        <p className="font-mono text-xs text-ink-muted uppercase">LOADING DOCUMENT RECORD...</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-4 selection:bg-sage-soft">
        <div className="max-w-md w-full bg-canvas-surface p-8 rounded-xs border border-border text-center space-y-4">
          <div className="w-12 h-12 bg-canvas-subtle border border-border text-status-danger rounded-xs flex items-center justify-center mx-auto">
            <FileQuestion className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="font-mono text-sm font-bold uppercase text-ink">
              DOCUMENT NOT FOUND
            </h2>
            <p className="text-xs text-ink-secondary">
              The requested document identifier is invalid or has been deleted.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 bg-sage hover:bg-sage-hover text-canvas-DEFAULT font-mono text-xs font-medium rounded-xs border border-sage transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>RETURN TO DASHBOARD</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <EditorContainer initialDocument={doc} />;
}

