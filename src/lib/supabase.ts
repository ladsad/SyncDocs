import { createClient } from "@supabase/supabase-js";
import { Document, DocumentContentType } from "@/types/document";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    !supabaseUrl.includes("your-project.supabase.co")
  );
};

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const LOCAL_STORAGE_KEY = "syncdocs_local_documents";

const getLocalDocs = (): Document[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveLocalDocs = (docs: Document[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(docs));
  } catch (e) {
    console.error("Failed to save to local storage", e);
  }
};

export async function fetchDocuments(): Promise<Document[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Supabase fetch error:", error.message);
      throw error;
    }
    return data || [];
  }

  return getLocalDocs();
}

export async function fetchDocumentById(id: string): Promise<Document | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      console.error("Supabase fetch document error:", error.message);
      throw error;
    }
    return data;
  }

  const docs = getLocalDocs();
  return docs.find((d) => d.id === id) || null;
}

export async function createDocument(
  title: string = "Untitled Document",
  contentType: DocumentContentType = "rich_text",
  initialContent: any = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Start writing..." }],
      },
    ],
  }
): Promise<Document> {
  const newDocData = {
    title,
    content_type: contentType,
    content: initialContent,
  };

  if (supabase) {
    const { data, error } = await supabase
      .from("documents")
      .insert([newDocData])
      .select()
      .single();

    if (error) {
      console.error("Supabase create error:", error.message);
      throw error;
    }
    return data;
  }

  const newDoc: Document = {
    id: crypto.randomUUID(),
    title,
    content_type: contentType,
    content: initialContent,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const docs = getLocalDocs();
  docs.unshift(newDoc);
  saveLocalDocs(docs);
  return newDoc;
}

export async function updateDocument(
  id: string,
  updates: Partial<Pick<Document, "title" | "content">>
): Promise<Document | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from("documents")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase update error:", error.message);
      throw error;
    }
    return data;
  }

  const docs = getLocalDocs();
  const index = docs.findIndex((d) => d.id === id);
  if (index === -1) return null;

  docs[index] = {
    ...docs[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  saveLocalDocs(docs);
  return docs[index];
}

export async function deleteDocument(id: string): Promise<boolean> {
  if (supabase) {
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) {
      console.error("Supabase delete error:", error.message);
      throw error;
    }
    return true;
  }

  const docs = getLocalDocs().filter((d) => d.id !== id);
  saveLocalDocs(docs);
  return true;
}
