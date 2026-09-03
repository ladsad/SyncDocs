import { createClient } from "@supabase/supabase-js";
import { Document, DocumentContentType, StoredDocumentRow } from "@/types/document";
import { cryptoVault } from "./crypto/vault";
import { encryptDocumentPayload, decryptDocumentRow } from "./crypto/document-crypto";

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

const getLocalDocRows = (): StoredDocumentRow[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveLocalDocRows = (rows: StoredDocumentRow[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(rows));
  } catch (e) {
    console.error("Failed to save to local storage", e);
  }
};

export async function fetchDocuments(): Promise<Document[]> {
  let rows: StoredDocumentRow[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Supabase fetch error:", error.message);
      throw error;
    }
    rows = data || [];
  } else {
    rows = getLocalDocRows();
  }

  // Decrypt rows if keys are available
  const docs: Document[] = await Promise.all(
    rows.map(async (row) => {
      let dk = cryptoVault.getDocumentKey(row.id);
      if (!dk && row.is_encrypted) {
        dk = await cryptoVault.getLocalFallbackDocumentKey(row.id).catch(() => null);
      }
      return await decryptDocumentRow(row, dk);
    })
  );

  return docs;
}

export async function fetchDocumentById(id: string): Promise<Document | null> {
  let row: StoredDocumentRow | null = null;

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
    row = data;
  } else {
    const rows = getLocalDocRows();
    row = rows.find((d) => d.id === id) || null;
  }

  if (!row) return null;

  let dk = cryptoVault.getDocumentKey(id);
  if (!dk && row.is_encrypted) {
    dk = await cryptoVault.getLocalFallbackDocumentKey(id).catch(() => null);
  }

  return await decryptDocumentRow(row, dk);
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
  },
  isEncrypted: boolean = true
): Promise<Document> {
  const newId = crypto.randomUUID();
  let insertPayload: any;

  if (isEncrypted) {
    const dk = await cryptoVault.getLocalFallbackDocumentKey(newId);
    const encryptedData = await encryptDocumentPayload(
      { title, content: initialContent, yjs_state: null },
      dk
    );
    insertPayload = {
      id: newId,
      content_type: contentType,
      ...encryptedData,
    };
  } else {
    insertPayload = {
      id: newId,
      title,
      content_type: contentType,
      content: initialContent,
      is_encrypted: false,
    };
  }

  if (supabase) {
    const { data, error } = await supabase
      .from("documents")
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      console.error("Supabase create error:", error.message);
      throw error;
    }

    const dk = cryptoVault.getDocumentKey(newId);
    return await decryptDocumentRow(data, dk);
  }

  const now = new Date().toISOString();
  const storedRow: StoredDocumentRow = {
    ...insertPayload,
    created_at: now,
    updated_at: now,
  };

  const rows = getLocalDocRows();
  rows.unshift(storedRow);
  saveLocalDocRows(rows);

  const dk = cryptoVault.getDocumentKey(newId);
  return await decryptDocumentRow(storedRow, dk);
}

export async function updateDocument(
  id: string,
  updates: Partial<Pick<Document, "title" | "content" | "yjs_state">>,
  isEncrypted = true
): Promise<Document | null> {
  let updatePayload: any = {};

  if (isEncrypted) {
    const dk = await cryptoVault.getLocalFallbackDocumentKey(id);
    const encryptedData = await encryptDocumentPayload(
      {
        title: updates.title || "Untitled Document",
        content: updates.content || { type: "doc", content: [] },
        yjs_state: updates.yjs_state || null,
      },
      dk
    );
    updatePayload = {
      ...encryptedData,
      updated_at: new Date().toISOString(),
    };
  } else {
    updatePayload = {
      ...updates,
      updated_at: new Date().toISOString(),
    };
  }

  if (supabase) {
    const { data, error } = await supabase
      .from("documents")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase update error:", error.message);
      throw error;
    }
    const dk = cryptoVault.getDocumentKey(id);
    return await decryptDocumentRow(data, dk);
  }

  const rows = getLocalDocRows();
  const index = rows.findIndex((d) => d.id === id);
  if (index === -1) return null;

  rows[index] = {
    ...rows[index],
    ...updatePayload,
  };
  saveLocalDocRows(rows);

  const dk = cryptoVault.getDocumentKey(id);
  return await decryptDocumentRow(rows[index], dk);
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

  const rows = getLocalDocRows().filter((d) => d.id !== id);
  saveLocalDocRows(rows);
  return true;
}
