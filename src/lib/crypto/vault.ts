import {
  generateUserKeypair,
  generateDocumentKey,
  deriveDocumentKeyFromId,
  wrapDocumentKeyForUser,
  unwrapDocumentKey,
  exportPublicKey,
  importPublicKey,
  exportRawKey,
  importRawDocumentKey,
} from "./keys";
import { arrayBufferToBase64, base64ToArrayBuffer } from "./encoding";
import { UserKeypairExport, DocumentKeyRecord } from "@/types/crypto";
import { DocumentRole } from "@/types/document";
import { supabase } from "../supabase";

function getKeyFromUrlHash(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const hash = window.location.hash;
    if (!hash) return null;
    const match = hash.match(/(?:#|&)key=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

const USER_PROFILE_STORAGE_KEY = "syncdocs_user_profile";

interface StoredUserProfile {
  userId: string;
  email: string;
  publicKeyBase64: string;
  privateKeyPkcs8Base64: string;
}

class CryptoVault {
  private userId: string | null = null;
  private userEmail: string | null = null;
  private userPrivateKey: CryptoKey | null = null;
  private userPublicKey: CryptoKey | null = null;
  private userPublicKeyBase64: string | null = null;
  private documentKeys: Map<string, CryptoKey> = new Map();

  // In-memory session keypair
  public setSessionKeypair(
    privateKey: CryptoKey,
    publicKey: CryptoKey,
    publicKeyBase64: string,
    userId?: string,
    email?: string
  ) {
    this.userPrivateKey = privateKey;
    this.userPublicKey = publicKey;
    this.userPublicKeyBase64 = publicKeyBase64;
    if (userId) this.userId = userId;
    if (email) this.userEmail = email;
  }

  public getUserId(): string | null {
    return this.userId;
  }

  public getUserEmail(): string | null {
    return this.userEmail;
  }

  public getUserPrivateKey(): CryptoKey | null {
    return this.userPrivateKey;
  }

  public getUserPublicKeyBase64(): string | null {
    return this.userPublicKeyBase64;
  }

  public setDocumentKey(documentId: string, key: CryptoKey) {
    this.documentKeys.set(documentId, key);
  }

  public getDocumentKey(documentId: string): CryptoKey | null {
    return this.documentKeys.get(documentId) || null;
  }

  /**
   * Initializes or restores the user's persistent cryptographic identity (ECDH keypair).
   */
  public async initializeUserSession(preferredEmail?: string): Promise<{
    userId: string;
    email: string;
    publicKey: string;
  }> {
    if (typeof window === "undefined") {
      return { userId: "server", email: "server@syncdocs.local", publicKey: "" };
    }

    // 1. Check local storage for existing keypair
    const stored = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (stored) {
      try {
        const parsed: StoredUserProfile = JSON.parse(stored);
        const privateKeyBytes = base64ToArrayBuffer(parsed.privateKeyPkcs8Base64);
        const privateKey = await window.crypto.subtle.importKey(
          "pkcs8",
          privateKeyBytes as unknown as BufferSource,
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveKey", "deriveBits"]
        );

        const publicKey = await importPublicKey(parsed.publicKeyBase64);

        this.setSessionKeypair(
          privateKey,
          publicKey,
          parsed.publicKeyBase64,
          parsed.userId,
          parsed.email
        );

        return {
          userId: parsed.userId,
          email: parsed.email,
          publicKey: parsed.publicKeyBase64,
        };
      } catch (e) {
        console.warn("Failed to restore user profile from local storage, generating new keypair", e);
      }
    }

    // 2. Generate fresh ECDH keypair
    const keyPair = await generateUserKeypair();
    const pubKeyBase64 = await exportPublicKey(keyPair.publicKey);
    const pkcs8 = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const pkcs8Base64 = arrayBufferToBase64(pkcs8);

    const randomSuffix = Math.floor(Math.random() * 9000 + 1000);
    const userId = crypto.randomUUID();
    const email = preferredEmail || `user-${randomSuffix}@syncdocs.local`;

    const profile: StoredUserProfile = {
      userId,
      email,
      publicKeyBase64: pubKeyBase64,
      privateKeyPkcs8Base64: pkcs8Base64,
    };

    localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));

    this.setSessionKeypair(keyPair.privateKey, keyPair.publicKey, pubKeyBase64, userId, email);

    // 3. Register public key on Supabase users table if connected
    if (supabase) {
      try {
        await supabase.from("users").upsert({
          id: userId,
          email,
          public_key: pubKeyBase64,
          wrapped_private_key: { ciphertext: pkcs8Base64, iv: "" },
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn("Could not register user to Supabase users table:", err);
      }
    }

    return {
      userId,
      email,
      publicKey: pubKeyBase64,
    };
  }

  /**
   * Updates the user's email address and synchronizes with Supabase & local storage.
   */
  public async updateUserEmail(newEmail: string): Promise<void> {
    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail) throw new Error("Email cannot be empty");

    this.userEmail = cleanEmail;

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          parsed.email = cleanEmail;
          localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(parsed));
        } catch {}
      }
    }

    if (supabase && this.userId && this.userPublicKeyBase64) {
      await supabase.from("users").upsert({
        id: this.userId,
        email: cleanEmail,
        public_key: this.userPublicKeyBase64,
        updated_at: new Date().toISOString(),
      });
    }
  }

  /**
   * Unwraps the Document Key from the `document_keys` table using the user's private key.
   */
  public async unwrapUserDocumentKey(documentId: string): Promise<CryptoKey | null> {
    if (!this.userPrivateKey) {
      await this.initializeUserSession();
    }
    if (!this.userPrivateKey || !this.userId || !supabase) return null;

    try {
      const { data, error } = await supabase
        .from("document_keys")
        .select("wrapped_dk, iv, ephemeral_public_key")
        .eq("document_id", documentId)
        .eq("user_id", this.userId)
        .single();

      if (error || !data) return null;

      const unwrapped = await unwrapDocumentKey(
        {
          wrappedDk: data.wrapped_dk,
          iv: data.iv,
          ephemeralPublicKey: data.ephemeral_public_key,
        },
        this.userPrivateKey
      );

      this.setDocumentKey(documentId, unwrapped);
      return unwrapped;
    } catch (err) {
      console.warn("Failed to unwrap document key for user:", err);
      return null;
    }
  }

  /**
   * Resolves the current user's role on the document (owner, editor, viewer).
   */
  public async fetchDocumentRole(documentId: string): Promise<DocumentRole> {
    if (!this.userId) {
      await this.initializeUserSession();
    }

    if (supabase && this.userId) {
      const { data, error } = await supabase
        .from("permissions")
        .select("role")
        .eq("document_id", documentId)
        .eq("user_id", this.userId)
        .single();

      if (!error && data?.role) {
        return data.role as DocumentRole;
      }
    }

    // Default to editor in single-user/local fallback mode
    return "editor";
  }

  /**
   * Initializes or retrieves a Document Key for a document.
   * Order of priority:
   * 1. In-memory cache
   * 2. URL Hash parameter (#key=...)
   * 3. LocalStorage
   * 4. Asymmetric unwrap (if wrapped record present in document_keys)
   * 5. Deterministic room key derivation (for seamless multi-tab collaboration)
   */
  public async getLocalFallbackDocumentKey(documentId: string): Promise<CryptoKey> {
    const cached = this.getDocumentKey(documentId);
    if (cached) return cached;

    // 1. Check URL hash
    const hashKey = getKeyFromUrlHash();
    if (hashKey) {
      try {
        const dk = await importRawDocumentKey(hashKey);
        this.setDocumentKey(documentId, dk);
        if (typeof window !== "undefined") {
          localStorage.setItem(`syncdocs_dk_${documentId}`, hashKey);
        }
        return dk;
      } catch (err) {
        console.warn("Failed to import key from URL hash:", err);
      }
    }

    // 2. Check LocalStorage
    const storageKey = `syncdocs_dk_${documentId}`;
    const stored = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (stored) {
      try {
        const dk = await importRawDocumentKey(stored);
        this.setDocumentKey(documentId, dk);
        return dk;
      } catch (err) {
        console.warn("Failed to import key from localStorage:", err);
      }
    }

    // 3. Try asymmetric unwrap from document_keys
    const unwrappedDk = await this.unwrapUserDocumentKey(documentId);
    if (unwrappedDk) {
      const raw = await exportRawKey(unwrappedDk);
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, raw);
      }
      return unwrappedDk;
    }

    // 4. Deterministic room key derivation ensures consistent keys across all tabs
    const deterministicDk = await deriveDocumentKeyFromId(documentId);
    const raw = await exportRawKey(deterministicDk);
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, raw);
    }
    this.setDocumentKey(documentId, deterministicDk);
    return deterministicDk;
  }

  public async getShareableUrl(documentId: string): Promise<string> {
    if (typeof window === "undefined") return "";
    const dk = await this.getLocalFallbackDocumentKey(documentId);
    const rawKey = await exportRawKey(dk);
    const origin = window.location.origin;
    return `${origin}/documents/${documentId}#key=${encodeURIComponent(rawKey)}`;
  }
}

export const cryptoVault = new CryptoVault();
