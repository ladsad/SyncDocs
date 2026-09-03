export interface EncryptedPayload {
  ciphertext: string; // Base64
  iv: string; // Base64 (12-byte IV for AES-GCM)
}

export interface WrappedKey {
  ciphertext: string; // Base64
  iv: string; // Base64
  salt?: string; // Base64 (if derived from PBKDF2 password)
}

export interface UserKeypairExport {
  publicKey: string; // Base64 or SPKI
  wrappedPrivateKey: WrappedKey;
}

export interface UserCryptoProfile {
  userId: string;
  publicKey: string;
  wrappedPrivateKey: WrappedKey;
  recoverySalt?: string;
  wrappedRecoveryKey?: WrappedKey;
}

export interface DocumentKeyRecord {
  documentId: string;
  userId: string;
  wrappedDk: string; // Base64 ciphertext of AES-256-GCM Document Key
  iv: string;
  ephemeralPublicKey?: string; // Base64 for ECDH key wrapping
}
