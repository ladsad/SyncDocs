import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { encryptBytes, decryptBytes } from "@/lib/crypto/cipher";
import { EncryptedPayload } from "@/types/crypto";

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class SupabaseYjsProvider {
  public doc: Y.Doc;
  public awareness: awarenessProtocol.Awareness;
  public channel: RealtimeChannel | null = null;
  public isConnected = false;
  private supabase: SupabaseClient | null;
  private documentId: string;
  private documentKey: CryptoKey | null = null;
  private pendingUpdates: Uint8Array[] = [];
  private onDocUpdateBound: (update: Uint8Array, origin: any) => void;
  private onAwarenessUpdateBound: ({
    added,
    updated,
    removed,
  }: {
    added: number[];
    updated: number[];
    removed: number[];
  }) => void;
  private statusListeners: Array<(status: { connected: boolean }) => void> = [];

  constructor(
    supabase: SupabaseClient | null,
    documentId: string,
    doc: Y.Doc = new Y.Doc(),
    documentKey: CryptoKey | null = null
  ) {
    this.supabase = supabase;
    this.documentId = documentId;
    this.doc = doc;
    this.documentKey = documentKey;
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    this.onDocUpdateBound = this.handleLocalDocUpdate.bind(this);
    this.onAwarenessUpdateBound = this.handleLocalAwarenessUpdate.bind(this);

    this.doc.on("update", this.onDocUpdateBound);
    this.awareness.on("update", this.onAwarenessUpdateBound);

    this.connect();
  }

  public setDocumentKey(key: CryptoKey | null) {
    this.documentKey = key;
  }

  public onStatus(cb: (status: { connected: boolean }) => void) {
    this.statusListeners.push(cb);
    cb({ connected: this.isConnected });
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== cb);
    };
  }

  private notifyStatus(connected: boolean) {
    this.isConnected = connected;
    this.statusListeners.forEach((cb) => cb({ connected }));
  }

  private connect() {
    if (!this.supabase) {
      this.notifyStatus(false);
      return;
    }

    const channelName = `syncdocs-room-${this.documentId}`;
    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: {
          self: false,
          ack: true,
        },
      },
    });

    // 1. Handle live incoming Yjs updates (Encrypted or Plaintext fallback)
    this.channel.on("broadcast", { event: "doc-update" }, async ({ payload }) => {
      if (payload?.encryptedUpdate && this.documentKey) {
        try {
          const decrypted = await decryptBytes(
            payload.encryptedUpdate as EncryptedPayload,
            this.documentKey
          );
          Y.applyUpdate(this.doc, decrypted, this);
        } catch (e) {
          console.error("Failed to decrypt incoming doc-update:", e);
        }
      } else if (payload?.update) {
        try {
          const update = base64ToUint8Array(payload.update);
          Y.applyUpdate(this.doc, update, this);
        } catch (e) {
          console.error("Failed to apply incoming plaintext doc-update:", e);
        }
      }
    });

    // 2. Handle sync-step-1: peer is requesting updates from their state vector
    this.channel.on("broadcast", { event: "sync-step-1" }, async ({ payload }) => {
      if (payload?.stateVector) {
        try {
          const remoteStateVector = base64ToUint8Array(payload.stateVector);
          const update = Y.encodeStateAsUpdate(this.doc, remoteStateVector);
          if (update.byteLength > 0 && this.channel && this.isConnected) {
            if (this.documentKey) {
              const encrypted = await encryptBytes(update, this.documentKey);
              this.channel.send({
                type: "broadcast",
                event: "sync-step-2",
                payload: { encryptedUpdate: encrypted },
              });
            } else {
              this.channel.send({
                type: "broadcast",
                event: "sync-step-2",
                payload: { update: uint8ArrayToBase64(update) },
              });
            }
          }

          // If initial handshake, send reciprocal state vector request
          if (payload.initiator && this.channel && this.isConnected) {
            const ourStateVector = Y.encodeStateVector(this.doc);
            this.channel.send({
              type: "broadcast",
              event: "sync-step-1",
              payload: {
                stateVector: uint8ArrayToBase64(ourStateVector),
                initiator: false,
              },
            });
          }
        } catch (e) {
          console.error("Failed to process sync-step-1:", e);
        }
      }
    });

    // 3. Handle sync-step-2: reply with missing updates
    this.channel.on("broadcast", { event: "sync-step-2" }, async ({ payload }) => {
      if (payload?.encryptedUpdate && this.documentKey) {
        try {
          const decrypted = await decryptBytes(
            payload.encryptedUpdate as EncryptedPayload,
            this.documentKey
          );
          Y.applyUpdate(this.doc, decrypted, this);
        } catch (e) {
          console.error("Failed to decrypt incoming sync-step-2:", e);
        }
      } else if (payload?.update) {
        try {
          const update = base64ToUint8Array(payload.update);
          Y.applyUpdate(this.doc, update, this);
        } catch (e) {
          console.error("Failed to process sync-step-2:", e);
        }
      }
    });

    // 4. Handle incoming cursor & presence awareness updates
    this.channel.on("broadcast", { event: "awareness-update" }, ({ payload }) => {
      if (payload?.awareness) {
        try {
          const awarenessBytes = base64ToUint8Array(payload.awareness);
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            awarenessBytes,
            this
          );
        } catch (e) {
          console.error("Failed to apply awareness update:", e);
        }
      }
    });

    this.channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        this.notifyStatus(true);

        // Flush queued updates
        if (this.pendingUpdates.length > 0) {
          this.pendingUpdates.forEach(async (upd) => {
            if (this.documentKey) {
              const encrypted = await encryptBytes(upd, this.documentKey);
              this.channel?.send({
                type: "broadcast",
                event: "doc-update",
                payload: { encryptedUpdate: encrypted },
              });
            } else {
              this.channel?.send({
                type: "broadcast",
                event: "doc-update",
                payload: { update: uint8ArrayToBase64(upd) },
              });
            }
          });
          this.pendingUpdates = [];
        }

        // Initiate two-way sync handshake
        const stateVector = Y.encodeStateVector(this.doc);
        this.channel?.send({
          type: "broadcast",
          event: "sync-step-1",
          payload: {
            stateVector: uint8ArrayToBase64(stateVector),
            initiator: true,
          },
        });

        // Broadcast current user presence
        const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          [this.doc.clientID]
        );
        this.channel?.send({
          type: "broadcast",
          event: "awareness-update",
          payload: {
            awareness: uint8ArrayToBase64(awarenessUpdate),
          },
        });
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        this.notifyStatus(false);
      }
    });
  }

  private async handleLocalDocUpdate(update: Uint8Array, origin: any) {
    if (origin === this) return; // Do not echo back remote updates

    if (this.channel && this.isConnected) {
      if (this.documentKey) {
        const encrypted = await encryptBytes(update, this.documentKey);
        this.channel.send({
          type: "broadcast",
          event: "doc-update",
          payload: { encryptedUpdate: encrypted },
        });
      } else {
        this.channel.send({
          type: "broadcast",
          event: "doc-update",
          payload: {
            update: uint8ArrayToBase64(update),
          },
        });
      }
    } else {
      this.pendingUpdates.push(update);
    }
  }

  private handleLocalAwarenessUpdate({
    added,
    updated,
    removed,
  }: {
    added: number[];
    updated: number[];
    removed: number[];
  }) {
    const changedClients = added.concat(updated).concat(removed);
    if (changedClients.length === 0) return;

    if (this.channel && this.isConnected) {
      const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
        this.awareness,
        changedClients
      );
      this.channel.send({
        type: "broadcast",
        event: "awareness-update",
        payload: {
          awareness: uint8ArrayToBase64(awarenessUpdate),
        },
      });
    }
  }

  public destroy() {
    this.doc.off("update", this.onDocUpdateBound);
    this.awareness.off("update", this.onAwarenessUpdateBound);

    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.doc.clientID],
      this
    );

    if (this.channel && this.supabase) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.notifyStatus(false);
    this.statusListeners = [];
    this.pendingUpdates = [];
  }
}
