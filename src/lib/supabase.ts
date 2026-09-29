import { createClient } from "@supabase/supabase-js";
import * as Y from "yjs";
import {
  Document,
  DocumentContentType,
  StoredDocumentRow,
  DocumentSnapshot,
  StoredDocumentSnapshotRow,
} from "@/types/document";
import { cryptoVault } from "./crypto/vault";
import { encryptDocumentPayload, decryptDocumentRow } from "./crypto/document-crypto";
import { uint8ArrayToBase64 } from "./sync/supabase-provider";

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

  let currentUserId = cryptoVault.getUserId();
  if (!currentUserId && typeof window !== "undefined") {
    const session = await cryptoVault.initializeUserSession();
    currentUserId = session.userId;
  }

  if (supabase && currentUserId) {
    // 1. Fetch document IDs user has permissions for
    const { data: perms } = await supabase
      .from("permissions")
      .select("document_id")
      .eq("user_id", currentUserId);

    // 2. Fetch document IDs where user has wrapped keys
    const { data: keys } = await supabase
      .from("document_keys")
      .select("document_id")
      .eq("user_id", currentUserId);

    const docIds = new Set<string>();
    perms?.forEach((p) => docIds.add(p.document_id));
    keys?.forEach((k) => docIds.add(k.document_id));

    // Also include any docs with keys saved in localStorage
    if (typeof window !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("syncdocs_dk_")) {
          docIds.add(k.replace("syncdocs_dk_", ""));
        }
      }
    }

    let query = supabase.from("documents").select("*").order("updated_at", { ascending: false });

    if (docIds.size > 0) {
      const idList = Array.from(docIds).join(",");
      query = query.or(`owner_id.eq.${currentUserId},id.in.(${idList})`);
    } else {
      query = query.eq("owner_id", currentUserId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("Supabase filtered fetch failed, querying owned:", error.message);
      const fallback = await supabase
        .from("documents")
        .select("*")
        .eq("owner_id", currentUserId)
        .order("updated_at", { ascending: false });
      rows = fallback.data || [];
    } else {
      rows = data || [];
    }
  } else if (supabase) {
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

  // Decrypt rows if keys are available & resolve role
  const docs: Document[] = await Promise.all(
    rows.map(async (row) => {
      let dk = cryptoVault.getDocumentKey(row.id);
      if (!dk && row.is_encrypted) {
        dk = await cryptoVault.getLocalFallbackDocumentKey(row.id).catch(() => null);
      }
      const role = await cryptoVault.fetchDocumentRole(row.id);
      const decrypted = await decryptDocumentRow(row, dk);
      return {
        ...decrypted,
        role: role || (row.owner_id === currentUserId ? "owner" : "viewer"),
      };
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

  const role = await cryptoVault.fetchDocumentRole(id);
  const decrypted = await decryptDocumentRow(row, dk);
  return {
    ...decrypted,
    role: role || undefined,
  };
}

export function getDefaultContentForType(contentType: DocumentContentType): any {
  switch (contentType) {
    case "rich_text":
      return {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Start writing..." }],
          },
        ],
      };
    case "markdown":
      return "# Untitled\n\nStart writing in Markdown...";
    case "latex":
      return `\\documentclass{article}
\\usepackage{amsmath}

\\title{Untitled Document}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Start writing your \\LaTeX{} document here.

\\end{document}`;
    case "typst":
      return "= Untitled Document\n\nStart writing in Typst...";
    default:
      return "";
  }
}

export async function createDocument(
  title?: string,
  contentType: DocumentContentType = "rich_text",
  initialContent?: any,
  isEncrypted: boolean = true
): Promise<Document> {
  const newId = crypto.randomUUID();
  let insertPayload: any;

  const docTitle =
    title ||
    (contentType === "rich_text"
      ? "Untitled Document"
      : contentType === "markdown"
      ? "Untitled Markdown"
      : contentType === "latex"
      ? "Untitled LaTeX"
      : "Untitled Document");

  const docContent =
    initialContent !== undefined
      ? initialContent
      : getDefaultContentForType(contentType);

  // Ensure user session identity
  let currentUserId = cryptoVault.getUserId();
  if (!currentUserId && typeof window !== "undefined") {
    const session = await cryptoVault.initializeUserSession();
    currentUserId = session.userId;
  }

  // Pre-seed initial CRDT binary snapshot for plaintext source styles (Markdown/LaTeX)
  let initialYjsState: string | null = null;
  if (contentType === "markdown" || contentType === "latex") {
    const initDoc = new Y.Doc();
    const initText = initDoc.getText("codemirror");
    if (typeof docContent === "string" && docContent.length > 0) {
      initText.insert(0, docContent);
    }
    initialYjsState = uint8ArrayToBase64(Y.encodeStateAsUpdate(initDoc));
    initDoc.destroy();
  }

  if (isEncrypted) {
    const dk = await cryptoVault.createAndStoreDocumentKey(newId, currentUserId);
    const encryptedData = await encryptDocumentPayload(
      { title: docTitle, content: docContent, yjs_state: initialYjsState },
      dk
    );
    insertPayload = {
      id: newId,
      owner_id: currentUserId || null,
      content_type: contentType,
      ...encryptedData,
    };
  } else {
    insertPayload = {
      id: newId,
      owner_id: currentUserId || null,
      title: docTitle,
      content_type: contentType,
      content: docContent,
      yjs_state: initialYjsState,
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

    // Set owner permission
    if (currentUserId) {
      await supabase.from("permissions").upsert({
        document_id: newId,
        user_id: currentUserId,
        role: "owner",
        updated_at: new Date().toISOString(),
      });
    }

    const dk = cryptoVault.getDocumentKey(newId);
    const decrypted = await decryptDocumentRow(data, dk);
    return {
      ...decrypted,
      role: "owner",
    };
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
  const decrypted = await decryptDocumentRow(storedRow, dk);
  return {
    ...decrypted,
    role: "owner",
  };
}

export async function updateDocument(
  id: string,
  updates: Partial<Pick<Document, "title" | "content" | "yjs_state">>,
  isEncrypted = true
): Promise<Document | null> {
  let updatePayload: any = {};

  if (isEncrypted) {
    const dk = await cryptoVault.getLocalFallbackDocumentKey(id);
    if (!dk) {
      console.error("Cannot update document without encryption key:", id);
      return null;
    }
    const encryptedData = await encryptDocumentPayload(
      {
        title: updates.title !== undefined ? updates.title : "Untitled Document",
        content: updates.content !== undefined ? updates.content : { type: "doc", content: [] },
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

const SNAPSHOTS_STORAGE_KEY_PREFIX = "syncdocs_snapshots_";

export async function createDocumentSnapshot(
  documentId: string,
  name?: string
): Promise<DocumentSnapshot | null> {
  const dk = await cryptoVault.getLocalFallbackDocumentKey(documentId);
  if (!dk) {
    console.error("Cannot create snapshot without document key:", documentId);
    return null;
  }

  let docRow: StoredDocumentRow | null = null;
  if (supabase) {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (!error && data) {
      docRow = data;
    }
  }

  if (!docRow) {
    const rows = getLocalDocRows();
    docRow = rows.find((r) => r.id === documentId) || null;
  }

  if (!docRow) return null;

  const snapshotId = crypto.randomUUID();
  const userEmail = cryptoVault.getUserEmail() || "Anonymous";
  const now = new Date().toISOString();

  const snapshotRow: StoredDocumentSnapshotRow = {
    id: snapshotId,
    document_id: documentId,
    name:
      name ||
      `Checkpoint ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    encrypted_content: docRow.encrypted_content,
    encrypted_yjs_state: docRow.encrypted_yjs_state,
    created_by: userEmail,
    created_at: now,
  };

  if (supabase) {
    const { error } = await supabase.from("document_snapshots").insert(snapshotRow);
    if (!error) {
      const decrypted = await decryptDocumentRow(
        {
          id: docRow.id,
          content: docRow.content,
          yjs_state: docRow.yjs_state,
          encrypted_content: docRow.encrypted_content,
          encrypted_yjs_state: docRow.encrypted_yjs_state,
          is_encrypted: docRow.is_encrypted,
          content_type: docRow.content_type,
          created_at: now,
          updated_at: now,
        },
        dk
      );
      return {
        id: snapshotId,
        document_id: documentId,
        name: snapshotRow.name,
        content: decrypted.content,
        yjs_state: decrypted.yjs_state,
        created_by: userEmail,
        created_at: now,
      };
    }
    console.warn("Supabase snapshot insert failed, falling back to local storage:", error?.message);
  }

  // Local storage fallback
  if (typeof window !== "undefined") {
    const key = `${SNAPSHOTS_STORAGE_KEY_PREFIX}${documentId}`;
    const raw = localStorage.getItem(key);
    const list: StoredDocumentSnapshotRow[] = raw ? JSON.parse(raw) : [];
    list.unshift(snapshotRow);
    localStorage.setItem(key, JSON.stringify(list));
  }

  const decrypted = await decryptDocumentRow(
    {
      id: docRow.id,
      content: docRow.content,
      yjs_state: docRow.yjs_state,
      encrypted_content: docRow.encrypted_content,
      encrypted_yjs_state: docRow.encrypted_yjs_state,
      is_encrypted: docRow.is_encrypted,
      content_type: docRow.content_type,
      created_at: now,
      updated_at: now,
    },
    dk
  );

  return {
    id: snapshotId,
    document_id: documentId,
    name: snapshotRow.name,
    content: decrypted.content,
    yjs_state: decrypted.yjs_state,
    created_by: userEmail,
    created_at: now,
  };
}

export async function fetchDocumentSnapshots(documentId: string): Promise<DocumentSnapshot[]> {
  const dk = await cryptoVault.getLocalFallbackDocumentKey(documentId);
  let rows: StoredDocumentSnapshotRow[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from("document_snapshots")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false });
    if (!error && data) {
      rows = data;
    }
  }

  if (rows.length === 0 && typeof window !== "undefined") {
    const key = `${SNAPSHOTS_STORAGE_KEY_PREFIX}${documentId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        rows = JSON.parse(raw);
      } catch (e) {
        console.warn("Failed to parse local snapshots:", e);
      }
    }
  }

  const results: DocumentSnapshot[] = [];
  for (const row of rows) {
    try {
      let content = null;
      let yjs_state = null;
      if (row.encrypted_content && dk) {
        const decrypted = await decryptDocumentRow(
          {
            id: row.id,
            encrypted_content: row.encrypted_content,
            encrypted_yjs_state: row.encrypted_yjs_state,
            is_encrypted: true,
            content_type: "rich_text",
            created_at: row.created_at,
            updated_at: row.created_at,
          },
          dk
        );
        content = decrypted.content;
        yjs_state = decrypted.yjs_state;
      }
      results.push({
        id: row.id,
        document_id: row.document_id,
        name: row.name,
        content,
        yjs_state,
        created_by: row.created_by,
        created_at: row.created_at,
      });
    } catch (err) {
      console.warn("Failed to decrypt snapshot:", row.id, err);
    }
  }

  return results;
}

export async function restoreDocumentSnapshot(
  documentId: string,
  snapshot: DocumentSnapshot
): Promise<Document | null> {
  return await updateDocument(documentId, {
    content: snapshot.content,
    yjs_state: snapshot.yjs_state,
  });
}

