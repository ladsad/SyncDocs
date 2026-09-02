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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="text-slate-600 font-medium text-sm">Loading document...</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl border border-slate-200 shadow-sm text-center">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileQuestion className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            Document Not Found
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            The requested document does not exist or may have been deleted.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-md shadow-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Documents
          </Link>
        </div>
      </div>
    );
  }

  return <EditorContainer initialDocument={doc} />;
}
