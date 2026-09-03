import {
  generateDocumentKey,
  deriveDocumentKeyFromId,
  wrapDocumentKeyForUser,
  unwrapDocumentKey,
  exportPublicKey,
  exportRawKey,
  importRawDocumentKey,
} from "./keys";
import { UserKeypairExport, DocumentKeyRecord } from "@/types/crypto";

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

class CryptoVault {
  private userPrivateKey: CryptoKey | null = null;
  private userPublicKey: CryptoKey | null = null;
  private userPublicKeyBase64: string | null = null;
  private documentKeys: Map<string, CryptoKey> = new Map();

  // In-memory session keypair
  public setSessionKeypair(
    privateKey: CryptoKey,
    publicKey: CryptoKey,
    publicKeyBase64: string
  ) {
    this.userPrivateKey = privateKey;
    this.userPublicKey = publicKey;
    this.userPublicKeyBase64 = publicKeyBase64;
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
   * Initializes or retrieves a Document Key for a document.
   * Order of priority:
   * 1. In-memory cache
   * 2. URL Hash parameter (#key=...)
   * 3. LocalStorage
   * 4. Asymmetric unwrap (if wrapped record present)
   * 5. Deterministic room key derivation (for seamless multi-tab collaboration in Phase 2)
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

    // 3. Deterministic room key derivation ensures consistent keys across all tabs
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
